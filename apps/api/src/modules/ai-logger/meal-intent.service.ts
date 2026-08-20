import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { SERVING_UNITS } from '../food/types';
import { MEAL_TYPES } from '../nutrition/dto/log-meal.dto';
import { ExtractedFood, ExtractionResult, MealEdit } from '../nutrition/types';
import { buildSystemPrompt, PromptContext } from './meal-intent.prompt';

/**
 * Upstream failures the user cannot act on, mapped to something readable. The
 * full error is logged server-side either way.
 */
const PROVIDER_HINTS: { match: RegExp; message: string }[] = [
  {
    match: /quota|billing|insufficient_quota/i,
    message:
      'The AI meal logger is temporarily unavailable: the connected OpenAI account has no remaining quota.',
  },
  {
    match: /rate limit|429/i,
    message: 'The AI meal logger is busy right now. Please try again in a moment.',
  },
  {
    match: /api key|401|unauthorized|invalid_api_key/i,
    message: 'The AI meal logger is not configured correctly: the OpenAI API key was rejected.',
  },
];

/**
 * The extraction schema.
 *
 * Note what is absent: there is no field anywhere for calories or macros. The
 * model is given no place to put a nutrition figure, so it cannot contribute one
 * even if the prompt were ignored. Nutrition is the food catalogue's job.
 *
 * `edits` is a flat object with an `op` discriminator rather than a Zod
 * discriminated union: unions produce a `oneOf` that OpenAI's structured-output
 * mode handles poorly, so the shape is kept flat here and narrowed in code.
 */
const extractionSchema = z.object({
  intent: z.enum(['log', 'edit', 'repeat', 'clarify', 'chat']),

  mealType: z.enum(MEAL_TYPES).nullable().describe('Only when the user names the meal.'),

  foods: z
    .array(
      z.object({
        name: z.string().describe('Plain English food name, e.g. "Egg", "Grilled chicken".'),
        quantity: z.number().positive(),
        unit: z.enum(SERVING_UNITS),
        note: z.string().nullable().describe('Preparation detail, e.g. "with milk".'),
      }),
    )
    .describe('Foods to log. Empty unless intent is "log".'),

  edits: z
    .array(
      z.object({
        op: z.enum(['add', 'remove', 'set_quantity', 'replace', 'clear']),
        target: z.string().nullable().describe("The item to act on, in the user's words."),
        name: z.string().nullable().describe('New food name, for "add" and "replace".'),
        quantity: z.number().positive().nullable(),
        unit: z.enum(SERVING_UNITS).nullable(),
      }),
    )
    .describe('Changes to the current meal. Empty unless intent is "edit".'),

  repeat: z
    .object({
      day: z.enum(['yesterday', 'today']),
      mealType: z.enum(MEAL_TYPES),
    })
    .nullable()
    .describe('Which past meal to copy. Only when intent is "repeat".'),

  clarification: z
    .object({
      question: z.string().describe('One short question.'),
      about: z.string().describe('The food in question, in the user\'s words.'),
      options: z.array(z.string()).describe('2-4 concrete choices.'),
    })
    .nullable()
    .describe('Only when intent is "clarify".'),

  reply: z.string().nullable().describe('One short sentence to show the user. No numbers.'),
});

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The language layer of meal logging, and nothing else.
 *
 * It converts a sentence into an `ExtractionResult` — names, quantities, units
 * and an intent. It has no database access, computes nothing, and returns no
 * nutrition. Everything downstream of it (resolving foods, pricing portions,
 * writing the log) belongs to the nutrition module, which means the interesting
 * logic is testable without a model in the loop.
 */
@Injectable()
export class MealIntentService {
  private readonly logger = new Logger(MealIntentService.name);
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY') || undefined;
    this.model = this.config.get<string>('OPENAI_MEAL_MODEL') || 'gpt-4o-mini';
  }

  /** False when no API key is configured — callers degrade rather than 500. */
  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Read one user message in the context of the conversation so far.
   *
   * `transcript` is what gives the feature its memory: "add a banana" only means
   * something next to the turns that came before it and the draft in `context`.
   */
  async extract(
    message: string,
    context: PromptContext,
    transcript: TranscriptMessage[] = [],
  ): Promise<ExtractionResult> {
    if (!this.apiKey) {
      // Fail early and specifically: without a key the SDK throws from deep in
      // the call stack with nothing the client could show a user.
      throw new ServiceUnavailableException(
        'AI meal logging is not configured on this server. Set OPENAI_API_KEY and restart the API.',
      );
    }

    const openai = createOpenAI({ apiKey: this.apiKey });

    try {
      const { object } = await generateObject({
        model: openai(this.model),
        schema: extractionSchema,
        system: buildSystemPrompt(context),
        messages: [...transcript, { role: 'user' as const, content: message }],
        temperature: 0,
      });

      return this.toResult(object);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Meal extraction failed: ${detail}`);

      const hint = PROVIDER_HINTS.find((candidate) => candidate.match.test(detail));
      throw new ServiceUnavailableException(
        hint?.message ?? 'The AI meal logger is temporarily unavailable. Please try again shortly.',
      );
    }
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * Normalise the model's output into the internal shape.
   *
   * Everything here is defensive. The schema constrains types but not
   * consistency: a model can return intent "clarify" with no clarification, or
   * an "add" edit naming no food. Rather than trusting it, each intent is
   * downgraded to one its payload actually supports.
   */
  private toResult(object: z.infer<typeof extractionSchema>): ExtractionResult {
    const foods: ExtractedFood[] = object.foods
      .filter((food) => food.name.trim().length > 0)
      .map((food) => ({
        name: food.name.trim(),
        quantity: this.sanitizeQuantity(food.quantity),
        unit: food.unit,
        ...(food.note ? { note: food.note.trim() } : {}),
      }));

    const edits = object.edits
      .map((edit) => this.toEdit(edit))
      .filter((edit): edit is MealEdit => edit !== null);

    const clarification =
      object.clarification && object.clarification.question.trim()
        ? {
            question: object.clarification.question.trim(),
            about: object.clarification.about?.trim() || '',
            // Two options is the minimum for a choice to be worth offering.
            options: object.clarification.options.map((o) => o.trim()).filter(Boolean).slice(0, 4),
          }
        : undefined;

    let intent = object.intent;

    // Reconcile the stated intent with the payload that actually arrived.
    if (intent === 'clarify' && !clarification) intent = foods.length > 0 ? 'log' : 'chat';
    if (intent === 'edit' && edits.length === 0) intent = foods.length > 0 ? 'log' : 'chat';
    if (intent === 'log' && foods.length === 0) intent = edits.length > 0 ? 'edit' : 'chat';
    if (intent === 'repeat' && !object.repeat) intent = 'chat';

    return {
      intent,
      ...(object.mealType ? { mealType: object.mealType } : {}),
      foods,
      edits,
      ...(object.repeat ? { repeat: object.repeat } : {}),
      ...(clarification ? { clarification } : {}),
      ...(object.reply?.trim() ? { reply: object.reply.trim() } : {}),
    };
  }

  private toEdit(edit: z.infer<typeof extractionSchema>['edits'][number]): MealEdit | null {
    const target = edit.target?.trim();
    const name = edit.name?.trim();
    const unit = edit.unit ?? 'serving';

    switch (edit.op) {
      case 'clear':
        return { op: 'clear' };

      case 'add':
        if (!name) return null;
        return {
          op: 'add',
          food: { name, quantity: this.sanitizeQuantity(edit.quantity ?? 1), unit },
        };

      case 'remove':
        return target ? { op: 'remove', target } : null;

      case 'set_quantity':
        if (!target || !edit.quantity) return null;
        return {
          op: 'set_quantity',
          target,
          quantity: this.sanitizeQuantity(edit.quantity),
          unit,
        };

      case 'replace':
        if (!target || !name) return null;
        return {
          op: 'replace',
          target,
          food: { name, quantity: this.sanitizeQuantity(edit.quantity ?? 1), unit },
        };

      default:
        return null;
    }
  }

  /** Guards against a model returning 0, NaN or "I ate 5000 eggs". */
  private sanitizeQuantity(quantity: number): number {
    if (!Number.isFinite(quantity) || quantity <= 0) return 1;
    return Math.min(quantity, 5000);
  }
}
