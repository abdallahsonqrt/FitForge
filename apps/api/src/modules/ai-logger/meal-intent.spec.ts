import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { MealIntentService } from './meal-intent.service';
import { buildSystemPrompt } from './meal-intent.prompt';
import { DraftItem } from '../nutrition/types';

/**
 * The extraction layer's contract, tested at its two boundaries: the prompt it
 * builds, and how it normalises whatever the model returns.
 *
 * The model itself is mocked. What matters here is not that GPT parses English
 * — it does — but that this service never lets an inconsistent or hostile
 * response through unchecked, and never carries a nutrition figure.
 */

const generateObject = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({ generateObject }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => () => 'model' }));

const config = (key?: string) => ({
  get: (name: string) => (name === 'OPENAI_API_KEY' ? key : undefined),
});

/** A complete model response, overridable per test. */
const response = (overrides: Record<string, unknown> = {}) => ({
  object: {
    intent: 'log',
    mealType: null,
    foods: [],
    edits: [],
    repeat: null,
    clarification: null,
    reply: null,
    ...overrides,
  },
});

const draftItem = (name: string): DraftItem => ({
  foodId: 'f1',
  name,
  spokenName: name.toLowerCase(),
  quantity: 1,
  unit: 'piece',
  grams: 50,
  servingLabel: '1 piece',
  nutrients: { calories: 70, protein: 6, carbs: 0, fat: 5, fiber: 0, sugar: 0, sodium: 0 },
  confidence: 1,
});

describe('buildSystemPrompt', () => {
  const base = { draft: [], mealType: 'breakfast' as const, committed: false };

  it('forbids nutrition figures outright', () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toMatch(/NEVER output calories/);
  });

  it('names the regional dishes so they are not translated away', () => {
    const prompt = buildSystemPrompt(base);
    for (const dish of ['Shawarma', 'Falafel', 'Mansaf', 'Musakhan', 'Maqluba', 'Labneh']) {
      expect(prompt).toContain(dish);
    }
  });

  it('shows the draft, so a later reference has something to resolve against', () => {
    const prompt = buildSystemPrompt({ ...base, draft: [draftItem('Egg'), draftItem('Toast')] });

    expect(prompt).toContain('Egg (1 piece)');
    expect(prompt).toContain('Toast (1 piece)');
  });

  it('says the meal is empty when it is', () => {
    expect(buildSystemPrompt(base)).toContain('is empty');
  });

  it('steers towards edits once the meal is saved', () => {
    expect(buildSystemPrompt({ ...base, committed: true })).toMatch(/already saved/);
  });

  it('tells the model not to repeat a question it just asked', () => {
    const prompt = buildSystemPrompt({
      ...base,
      pendingQuestion: { question: 'What type of pasta?', about: 'pasta' },
    });

    expect(prompt).toContain('What type of pasta?');
    expect(prompt).toMatch(/do not ask again/i);
  });
});

describe('MealIntentService', () => {
  let service: MealIntentService;
  const context = { draft: [], mealType: 'lunch' as const, committed: false };

  beforeEach(() => {
    generateObject.mockReset();
    service = new MealIntentService(config('sk-test') as never);
  });

  afterEach(() => vi.clearAllMocks());

  it('fails clearly when no API key is configured', async () => {
    const unconfigured = new MealIntentService(config(undefined) as never);

    expect(unconfigured.isConfigured).toBe(false);
    await expect(unconfigured.extract('two eggs', context)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('extracts foods with their quantities and units', async () => {
    generateObject.mockResolvedValue(
      response({
        foods: [
          { name: 'Egg', quantity: 2, unit: 'piece', note: null },
          { name: 'Toast', quantity: 2, unit: 'slice', note: null },
        ],
      }),
    );

    const result = await service.extract('I had two eggs and toast', context);

    expect(result.intent).toBe('log');
    expect(result.foods).toEqual([
      { name: 'Egg', quantity: 2, unit: 'piece' },
      { name: 'Toast', quantity: 2, unit: 'slice' },
    ]);
  });

  it('passes the transcript so the model has the conversation so far', async () => {
    generateObject.mockResolvedValue(response({ foods: [] }));

    await service.extract('add a banana', context, [
      { role: 'user', content: 'I had two eggs' },
      { role: 'assistant', content: 'Logged.' },
    ]);

    const { messages } = generateObject.mock.calls[0][0];
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({ role: 'user', content: 'add a banana' });
  });

  it('carries no nutrition field into the schema it asks the model to fill', async () => {
    generateObject.mockResolvedValue(response());
    await service.extract('two eggs', context);

    const { schema } = generateObject.mock.calls[0][0];
    const shape = Object.keys(schema.shape);

    for (const forbidden of ['calories', 'protein', 'carbs', 'fat', 'nutrition', 'macros']) {
      expect(shape).not.toContain(forbidden);
    }
    expect(Object.keys(schema.shape.foods.element.shape)).toEqual([
      'name',
      'quantity',
      'unit',
      'note',
    ]);
  });

  it('normalises edit operations', async () => {
    generateObject.mockResolvedValue(
      response({
        intent: 'edit',
        edits: [
          { op: 'remove', target: 'the toast', name: null, quantity: null, unit: null },
          { op: 'set_quantity', target: 'chicken', name: null, quantity: 200, unit: 'g' },
          { op: 'replace', target: 'rice', name: 'Potato', quantity: 1, unit: 'piece' },
        ],
      }),
    );

    const result = await service.extract('...', context);

    expect(result.edits).toEqual([
      { op: 'remove', target: 'the toast' },
      { op: 'set_quantity', target: 'chicken', quantity: 200, unit: 'g' },
      { op: 'replace', target: 'rice', food: { name: 'Potato', quantity: 1, unit: 'piece' } },
    ]);
  });

  it('drops edits that name nothing to act on', async () => {
    generateObject.mockResolvedValue(
      response({
        intent: 'edit',
        edits: [
          { op: 'remove', target: null, name: null, quantity: null, unit: null },
          { op: 'add', target: null, name: null, quantity: 1, unit: 'piece' },
        ],
      }),
    );

    // Both are unusable, so the turn degrades to conversation rather than
    // performing a mystery operation on the meal.
    const result = await service.extract('...', context);
    expect(result.edits).toEqual([]);
    expect(result.intent).toBe('chat');
  });

  it('keeps a clarification with its options', async () => {
    generateObject.mockResolvedValue(
      response({
        intent: 'clarify',
        clarification: {
          question: 'What type of pasta?',
          about: 'pasta',
          options: ['Alfredo', 'Tomato Sauce', 'Bolognese', 'Other'],
        },
      }),
    );

    const result = await service.extract('I ate pasta', context);

    expect(result.intent).toBe('clarify');
    expect(result.clarification?.options).toHaveLength(4);
  });

  it('downgrades a clarify intent that arrived without a question', async () => {
    generateObject.mockResolvedValue(
      response({
        intent: 'clarify',
        clarification: null,
        foods: [{ name: 'Egg', quantity: 1, unit: 'piece', note: null }],
      }),
    );

    // The foods are real; only the stated intent was wrong.
    const result = await service.extract('an egg', context);
    expect(result.intent).toBe('log');
  });

  it('downgrades a log intent that produced no foods', async () => {
    generateObject.mockResolvedValue(response({ intent: 'log', foods: [] }));
    expect((await service.extract('hello', context)).intent).toBe('chat');
  });

  it('downgrades a repeat intent with nothing to repeat', async () => {
    generateObject.mockResolvedValue(response({ intent: 'repeat', repeat: null }));
    expect((await service.extract('same as before', context)).intent).toBe('chat');
  });

  it('reads "same breakfast as yesterday" as a repeat', async () => {
    generateObject.mockResolvedValue(
      response({ intent: 'repeat', repeat: { day: 'yesterday', mealType: 'breakfast' } }),
    );

    const result = await service.extract('same breakfast as yesterday', context);
    expect(result.repeat).toEqual({ day: 'yesterday', mealType: 'breakfast' });
  });

  it('clamps implausible and invalid quantities', async () => {
    generateObject.mockResolvedValue(
      response({
        foods: [
          { name: 'Egg', quantity: 99_999, unit: 'piece', note: null },
          { name: 'Rice', quantity: 0, unit: 'g', note: null },
        ],
      }),
    );

    const result = await service.extract('...', context);
    expect(result.foods[0].quantity).toBe(5000);
    expect(result.foods[1].quantity).toBe(1);
  });

  it('discards foods with a blank name', async () => {
    generateObject.mockResolvedValue(
      response({ foods: [{ name: '   ', quantity: 1, unit: 'piece', note: null }] }),
    );

    const result = await service.extract('...', context);
    expect(result.foods).toEqual([]);
  });

  it('translates a provider quota failure into something readable', async () => {
    generateObject.mockRejectedValue(new Error('429 insufficient_quota'));

    await expect(service.extract('two eggs', context)).rejects.toThrow(/no remaining quota/);
  });

  it('does not leak an unrecognised provider error to the user', async () => {
    generateObject.mockRejectedValue(new Error('ECONNRESET at internal.host:443'));

    await expect(service.extract('two eggs', context)).rejects.toThrow(
      /temporarily unavailable/,
    );
  });
});
