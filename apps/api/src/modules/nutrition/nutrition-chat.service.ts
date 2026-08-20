import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DB_CONNECTION } from '../../database/database.provider';
import { MealIntentService, TranscriptMessage } from '../ai-logger/meal-intent.service';
import { FoodResolverService, LOW_CONFIDENCE } from './food-resolver.service';
import { MealLogService } from './meal-log.service';
import { ChatDto, CommitDto } from './dto/chat.dto';
import { MealType } from './dto/log-meal.dto';
import {
  ChatResponse,
  DraftItem,
  ExtractedFood,
  ExtractionResult,
  MealEdit,
  PendingQuestion,
  describeMeal,
  mealTypeForHour,
  sumNutrients,
} from './types';
import { addItem, matchItem, needsConfirmation, removeItem, replaceItem } from './draft';

/** How much transcript the model sees. Enough for context, bounded for cost. */
const TRANSCRIPT_TURNS = 10;

/**
 * How long a conversation stays resumable without its id. Long enough that
 * "add a banana" a few minutes later joins the meal in progress; short enough
 * that tonight's dinner does not attach itself to this morning's breakfast.
 */
const RESUME_WINDOW_MS = 60 * 60 * 1000;

/**
 * Conversational meal logging.
 *
 * Orchestrates three collaborators that each do one thing: `MealIntentService`
 * understands the sentence, `FoodResolverService` prices it against the food
 * catalogue, and `MealLogService` writes it down. This service owns only the
 * state machine between them — the draft, the outstanding question, and when a
 * draft becomes a saved meal.
 *
 * The conversation's memory is that draft. It is persisted per turn and fed back
 * into the model on the next one, which is what lets a later "add a banana"
 * attach to the meal already under construction rather than starting a new one.
 */
@Injectable()
export class NutritionChatService {
  private readonly logger = new Logger(NutritionChatService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly intent: MealIntentService,
    private readonly resolver: FoodResolverService,
    private readonly log: MealLogService,
  ) {}

  /** One turn of conversation. */
  async chat(userId: string, dto: ChatDto, language?: string): Promise<ChatResponse> {
    const date = dto.date ?? this.today();
    const conversation = await this.openConversation(userId, dto, date);

    const mealType = dto.mealType ?? (conversation.mealType as MealType);
    const draft = this.readDraft(conversation.draftItems);
    const pending = conversation.pendingQuestion as PendingQuestion | null;

    const transcript = await this.transcript(conversation.id);
    await this.saveMessage(conversation.id, 'user', dto.message);

    const extraction = await this.intent.extract(
      dto.message,
      {
        draft,
        mealType,
        committed: !!conversation.mealId,
        pendingQuestion: pending,
      },
      transcript,
    );

    const state: TurnState = {
      userId,
      conversationId: conversation.id,
      date,
      language,
      mealType: extraction.mealType ?? mealType,
      draft,
      mealId: conversation.mealId,
      autoCommit: dto.autoCommit,
      // The stored slot describes the saved meal, which is what a new `log` turn
      // is compared against to decide whether it starts a different meal.
      committedMealType: conversation.mealId ? (conversation.mealType as MealType) : undefined,
    };

    const outcome = await this.dispatch(state, extraction);

    await this.saveMessage(conversation.id, 'assistant', outcome.message);
    await this.persistConversation(conversation.id, outcome);

    return {
      conversationId: conversation.id,
      status: outcome.status,
      message: outcome.message,
      mealType: outcome.mealType,
      items: outcome.draft,
      totals: sumNutrients(outcome.draft),
      ...(outcome.question ? { question: outcome.question } : {}),
      ...(outcome.mealId ? { mealId: outcome.mealId } : {}),
      unresolved: outcome.draft.filter((item) => item.foodId === null).map((item) => item.name),
    };
  }

  /** Save the current draft — the explicit confirm in a review-before-save UI. */
  async commit(userId: string, conversationId: string, dto: CommitDto): Promise<ChatResponse> {
    const conversation = await this.findOwned(userId, conversationId);
    const draft = this.readDraft(conversation.draftItems);

    if (draft.length === 0) {
      throw new NotFoundException('There is nothing to log in this conversation yet.');
    }

    const state: TurnState = {
      userId,
      conversationId,
      date: dto.date ?? conversation.date,
      mealType: dto.mealType ?? (conversation.mealType as MealType),
      draft,
      mealId: conversation.mealId,
      autoCommit: true,
    };

    const outcome = await this.commitDraft(state);

    await this.saveMessage(conversationId, 'assistant', outcome.message);
    await this.persistConversation(conversationId, outcome);

    return {
      conversationId,
      status: outcome.status,
      message: outcome.message,
      mealType: outcome.mealType,
      items: outcome.draft,
      totals: sumNutrients(outcome.draft),
      ...(outcome.mealId ? { mealId: outcome.mealId } : {}),
      unresolved: [],
    };
  }

  /** A conversation with its transcript, for restoring the chat screen. */
  async findConversation(userId: string, conversationId: string) {
    const conversation = await this.findOwned(userId, conversationId);
    const messages = await this.db
      .select()
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.conversationId, conversationId))
      .orderBy(asc(schema.aiMessages.createdAt));

    const draft = this.readDraft(conversation.draftItems);

    return {
      id: conversation.id,
      date: conversation.date,
      status: conversation.status,
      mealType: conversation.mealType,
      mealId: conversation.mealId,
      items: draft,
      totals: sumNutrients(draft),
      question: conversation.pendingQuestion as PendingQuestion | null,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  /** The user's recent conversations. Scoped to the caller. */
  async listConversations(userId: string, limit = 20) {
    return this.db
      .select({
        id: schema.aiConversations.id,
        date: schema.aiConversations.date,
        status: schema.aiConversations.status,
        mealType: schema.aiConversations.mealType,
        mealId: schema.aiConversations.mealId,
        createdAt: schema.aiConversations.createdAt,
      })
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.userId, userId))
      .orderBy(desc(schema.aiConversations.createdAt))
      .limit(limit);
  }

  // ─── Intent dispatch ──────────────────────────────────────

  private async dispatch(state: TurnState, extraction: ExtractionResult): Promise<Outcome> {
    switch (extraction.intent) {
      case 'log':
        return this.handleLog(state, extraction.foods, extraction.reply);

      case 'edit':
        return this.handleEdit(state, extraction.edits, extraction.reply);

      case 'repeat':
        return this.handleRepeat(state, extraction.repeat!, extraction.reply);

      case 'clarify':
        return {
          status: 'needs_clarification',
          message: extraction.clarification!.question,
          question: extraction.clarification!,
          draft: state.draft,
          mealType: state.mealType,
          mealId: state.mealId,
        };

      default:
        return {
          status: state.draft.length > 0 ? 'draft' : 'chat',
          message: extraction.reply ?? 'Tell me what you ate and I will log it.',
          draft: state.draft,
          mealType: state.mealType,
          mealId: state.mealId,
        };
    }
  }

  /**
   * Add newly described foods to the draft.
   *
   * A `log` turn on a meal that is already saved and belongs to a *different*
   * slot starts a fresh meal — saying "and I had lunch: rice and chicken" after
   * logging breakfast must not rewrite breakfast.
   */
  private async handleLog(
    state: TurnState,
    foods: ExtractedFood[],
    reply?: string,
  ): Promise<Outcome> {
    const startsNewMeal = !!state.mealId && state.mealType !== state.committedMealType;

    let draft = startsNewMeal ? [] : state.draft;
    const mealId = startsNewMeal ? null : state.mealId;

    const resolved = await this.resolver.resolveAll(foods, {
      language: state.language,
      userId: state.userId,
    });

    for (const item of resolved) {
      draft = addItem(draft, item);
    }

    return this.settle({ ...state, draft, mealId }, reply);
  }

  /** Apply the model's edit operations to the draft, in order. */
  private async handleEdit(
    state: TurnState,
    edits: MealEdit[],
    reply?: string,
  ): Promise<Outcome> {
    let draft = state.draft;
    const missed: string[] = [];

    for (const edit of edits) {
      switch (edit.op) {
        case 'clear':
          draft = [];
          break;

        case 'add': {
          const item = await this.resolver.resolve(edit.food, {
            language: state.language,
            userId: state.userId,
          });
          draft = addItem(draft, item);
          break;
        }

        case 'remove': {
          const target = matchItem(draft, edit.target);
          if (target) draft = removeItem(draft, target);
          else missed.push(edit.target);
          break;
        }

        case 'set_quantity': {
          const target = matchItem(draft, edit.target);
          if (!target) {
            missed.push(edit.target);
            break;
          }
          const rescaled = await this.resolver.rescale(target, edit.quantity, edit.unit);
          draft = replaceItem(draft, target, rescaled);
          break;
        }

        case 'replace': {
          const target = matchItem(draft, edit.target);
          const item = await this.resolver.resolve(edit.food, {
            language: state.language,
            userId: state.userId,
          });
          draft = target ? replaceItem(draft, target, item) : addItem(draft, item);
          if (!target) missed.push(edit.target);
          break;
        }
      }
    }

    // An edit naming something that is not in the meal is worth saying out loud
    // rather than silently ignoring — usually the user is a step ahead of us.
    if (missed.length > 0 && draft === state.draft) {
      return {
        status: state.draft.length > 0 ? 'draft' : 'chat',
        message: `I couldn't find ${this.list(missed)} in this meal. It has ${
          state.draft.length > 0 ? describeMeal(state.draft) : 'nothing in it yet'
        }.`,
        draft: state.draft,
        mealType: state.mealType,
        mealId: state.mealId,
      };
    }

    return this.settle({ ...state, draft }, reply);
  }

  /** Copy a past meal into the draft — "same breakfast as yesterday". */
  private async handleRepeat(
    state: TurnState,
    repeat: { day: 'yesterday' | 'today'; mealType: MealType },
    reply?: string,
  ): Promise<Outcome> {
    const sourceDate = repeat.day === 'yesterday' ? this.dayBefore(state.date) : state.date;
    const past = await this.log.findByTypeOnDate(state.userId, sourceDate, repeat.mealType);

    if (!past || past.items.length === 0) {
      return {
        status: state.draft.length > 0 ? 'draft' : 'chat',
        message: `I couldn't find a ${repeat.mealType} logged ${repeat.day}. Tell me what you had and I'll log it.`,
        draft: state.draft,
        mealType: state.mealType,
        mealId: state.mealId,
      };
    }

    // Re-used as a snapshot of the past meal, not a live re-resolution: the point
    // of "the same as yesterday" is that it is the same.
    let draft = state.draft;
    for (const item of past.items) {
      draft = addItem(draft, {
        foodId: item.foodId,
        name: item.name,
        spokenName: item.name,
        quantity: item.quantity,
        unit: item.unit as DraftItem['unit'],
        grams: item.grams,
        servingLabel: item.servingSize ?? `${item.quantity} ${item.unit}`,
        nutrients: item.nutrients,
        confidence: 1,
      });
    }

    return this.settle(
      { ...state, draft, mealType: repeat.mealType },
      reply ?? `Same ${repeat.mealType} as ${repeat.day} — ${describeMeal(draft)}.`,
    );
  }

  // ─── Draft settlement ─────────────────────────────────────

  /**
   * Decide what happens to a draft once items have been added or changed: ask
   * about anything uncertain, otherwise save it (or hand it back for review).
   */
  private async settle(state: TurnState, reply?: string): Promise<Outcome> {
    if (state.draft.length === 0) {
      return {
        status: 'chat',
        message: reply ?? 'The meal is empty now. What did you have?',
        draft: [],
        mealType: state.mealType,
        mealId: state.mealId,
      };
    }

    const uncertain = needsConfirmation(state.draft, LOW_CONFIDENCE);
    if (uncertain.length > 0) {
      const question = await this.questionFor(uncertain[0], state.language);
      if (question) {
        return {
          status: 'needs_clarification',
          message: question.question,
          question,
          draft: state.draft,
          mealType: state.mealType,
          mealId: state.mealId,
        };
      }
    }

    if (!state.autoCommit) {
      return {
        status: 'draft',
        message: reply ?? `Ready to log ${describeMeal(state.draft)}.`,
        draft: state.draft,
        mealType: state.mealType,
        mealId: state.mealId,
      };
    }

    return this.commitDraft(state, reply);
  }

  /** Write the draft to the meal log, updating in place if already saved. */
  private async commitDraft(state: TurnState, reply?: string): Promise<Outcome> {
    const totals = sumNutrients(state.draft);
    const name = describeMeal(state.draft);

    const meal = state.mealId
      ? await this.log.replaceItems(state.userId, state.mealId, state.draft)
      : await this.log.logDraft(state.userId, state.draft, {
          type: state.mealType,
          date: state.date,
          name,
        });

    // The totals come from the catalogue, so the confirmation can state them —
    // this is the one place a number is quoted, and it is a computed one.
    const summary = `${totals.calories} kcal · ${totals.protein}g protein · ${totals.carbs}g carbs · ${totals.fat}g fat`;

    return {
      status: 'logged',
      message: reply ? `${reply} (${summary})` : `Logged ${name} — ${summary}.`,
      draft: state.draft,
      mealType: state.mealType,
      mealId: meal.id,
      committedMealType: state.mealType,
    };
  }

  /**
   * Build a "did you mean" question for an item we are unsure about, using real
   * catalogue entries as the options rather than invented ones.
   */
  private async questionFor(
    item: DraftItem,
    language?: string,
  ): Promise<PendingQuestion | null> {
    const candidates = await this.resolver
      .candidatesFor(item.spokenName, language)
      .catch(() => []);

    const options = [...new Set(candidates.map((food) => food.displayName || food.name))].slice(
      0,
      4,
    );

    if (options.length === 0) {
      // Nothing in the catalogue and nothing from the providers. Asking to pick
      // from an empty list helps no one; say so plainly instead.
      return {
        question: `I couldn't find "${item.spokenName}" in the food database. Can you describe it differently, or add it as a custom food?`,
        about: item.spokenName,
        options: [],
      };
    }

    return {
      question: `Which "${item.spokenName}" did you mean?`,
      about: item.spokenName,
      options,
    };
  }

  // ─── Conversation state ───────────────────────────────────

  /**
   * The conversation this message belongs to: the one named, else a recent open
   * one for the same day, else a new one.
   */
  private async openConversation(userId: string, dto: ChatDto, date: string) {
    if (dto.conversationId) {
      return this.findOwned(userId, dto.conversationId);
    }

    const cutoff = new Date(Date.now() - RESUME_WINDOW_MS);
    const [recent] = await this.db
      .select()
      .from(schema.aiConversations)
      .where(
        and(
          eq(schema.aiConversations.userId, userId),
          eq(schema.aiConversations.date, date),
          gte(schema.aiConversations.updatedAt, cutoff),
        ),
      )
      .orderBy(desc(schema.aiConversations.updatedAt))
      .limit(1);

    if (recent) return recent;

    const [created] = await this.db
      .insert(schema.aiConversations)
      .values({
        userId,
        date,
        status: 'active',
        mealType: dto.mealType ?? mealTypeForHour(new Date().getHours()),
      })
      .returning();

    return created;
  }

  private async persistConversation(conversationId: string, outcome: Outcome): Promise<void> {
    await this.db
      .update(schema.aiConversations)
      .set({
        status:
          outcome.status === 'needs_clarification'
            ? 'needs_clarification'
            : outcome.status === 'logged'
              ? 'completed'
              : 'active',
        draftItems: outcome.draft,
        pendingQuestion: outcome.question ?? null,
        mealType: outcome.mealType,
        ...(outcome.mealId ? { mealId: outcome.mealId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.aiConversations.id, conversationId));
  }

  private async findOwned(userId: string, conversationId: string) {
    const [conversation] = await this.db
      .select()
      .from(schema.aiConversations)
      .where(
        and(
          eq(schema.aiConversations.id, conversationId),
          eq(schema.aiConversations.userId, userId),
        ),
      )
      .limit(1);

    if (!conversation) {
      throw new NotFoundException('That conversation could not be found.');
    }
    return conversation;
  }

  /** The last few turns, oldest first — the window the model reasons over. */
  private async transcript(conversationId: string): Promise<TranscriptMessage[]> {
    const rows = await this.db
      .select({ role: schema.aiMessages.role, content: schema.aiMessages.content })
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.conversationId, conversationId))
      .orderBy(desc(schema.aiMessages.createdAt))
      .limit(TRANSCRIPT_TURNS);

    return rows.reverse().map((row) => ({ role: row.role, content: row.content }));
  }

  private async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await this.db.insert(schema.aiMessages).values({ conversationId, role, content });
  }

  /** JSONB comes back as `unknown`; narrow it once, here. */
  private readDraft(value: unknown): DraftItem[] {
    return Array.isArray(value) ? (value as DraftItem[]) : [];
  }

  private list(values: string[]): string {
    if (values.length === 1) return `"${values[0]}"`;
    return `${values.slice(0, -1).map((v) => `"${v}"`).join(', ')} or "${values.at(-1)}"`;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private dayBefore(date: string): string {
    const base = new Date(`${date}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() - 1);
    return base.toISOString().slice(0, 10);
  }
}

/** Mutable state threaded through one turn. */
interface TurnState {
  userId: string;
  conversationId: string;
  date: string;
  language?: string;
  mealType: MealType;
  draft: DraftItem[];
  mealId: string | null;
  autoCommit: boolean;
  /** The slot the saved meal occupies, when one has been committed. */
  committedMealType?: MealType;
}

/** What a turn decided. Converted to the API response by `chat`. */
interface Outcome {
  status: ChatResponse['status'];
  message: string;
  draft: DraftItem[];
  mealType: MealType;
  mealId: string | null;
  question?: PendingQuestion;
  committedMealType?: MealType;
}
