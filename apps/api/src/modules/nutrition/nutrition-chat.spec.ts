import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NutritionChatService } from './nutrition-chat.service';
import { ChatDto } from './dto/chat.dto';
import { DraftItem, ExtractionResult } from './types';
import { Nutrients } from '../food/types';

/**
 * The conversation state machine.
 *
 * Covers the decisions that determine what ends up in someone's food diary:
 * when a draft is saved versus questioned, how an edit finds its target, and
 * whether a follow-up joins the meal in progress or starts a new one.
 *
 * Drizzle's builder is stubbed rather than run against Postgres — the queries
 * here are simple reads and writes, and what is worth testing is the branching
 * around them.
 */

// ─── Database stub ──────────────────────────────────────────

/**
 * A chainable stand-in for a Drizzle query builder. Every method returns the
 * same proxy, and awaiting it yields the next queued result — which is enough
 * for this service, whose queries are all "read some rows" or "write some rows".
 */
const chain = (nextResult: () => unknown) => {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          const promise = Promise.resolve(nextResult());
          return promise.then.bind(promise);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
};

const makeDb = () => {
  const selects: unknown[] = [];
  const inserts: unknown[] = [];
  const updates: { set: unknown }[] = [];

  const db = {
    select: vi.fn(() => chain(() => selects.shift() ?? [])),
    insert: vi.fn(() => chain(() => inserts.shift() ?? [])),
    update: vi.fn(() =>
      chain(() => {
        updates.push({ set: undefined });
        return [];
      }),
    ),
    queueSelect: (rows: unknown) => selects.push(rows),
    queueInsert: (rows: unknown) => inserts.push(rows),
    updates,
  };

  return db;
};

// ─── Fixtures ───────────────────────────────────────────────

const nutrients = (calories: number): Nutrients => ({
  calories,
  protein: 5,
  carbs: 10,
  fat: 2,
  fiber: 0,
  sugar: 0,
  sodium: 0,
});

const draftItem = (name: string, overrides: Partial<DraftItem> = {}): DraftItem => ({
  foodId: `id-${name}`,
  name,
  spokenName: name.toLowerCase(),
  quantity: 1,
  unit: 'piece',
  grams: 50,
  servingLabel: '1 piece (50 g)',
  nutrients: nutrients(100),
  confidence: 1,
  ...overrides,
});

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'conv-1',
  userId: 'user-1',
  date: '2026-08-05',
  status: 'active',
  mealType: 'breakfast',
  draftItems: [],
  pendingQuestion: null,
  mealId: null,
  ...overrides,
});

const extraction = (overrides: Partial<ExtractionResult> = {}): ExtractionResult => ({
  intent: 'log',
  foods: [],
  edits: [],
  ...overrides,
});

/**
 * `date` is always explicit: a meal is dated by when it is logged, so leaving it
 * out would make these assertions depend on the day the suite happens to run.
 */
const chatDto = (overrides: Partial<ChatDto> = {}): ChatDto => ({
  message: 'I had two eggs',
  conversationId: 'conv-1',
  date: '2026-08-05',
  autoCommit: true,
  ...overrides,
});

describe('NutritionChatService', () => {
  let db: ReturnType<typeof makeDb>;
  let intent: { extract: ReturnType<typeof vi.fn> };
  let resolver: {
    resolve: ReturnType<typeof vi.fn>;
    resolveAll: ReturnType<typeof vi.fn>;
    rescale: ReturnType<typeof vi.fn>;
    candidatesFor: ReturnType<typeof vi.fn>;
  };
  let log: {
    logDraft: ReturnType<typeof vi.fn>;
    replaceItems: ReturnType<typeof vi.fn>;
    findByTypeOnDate: ReturnType<typeof vi.fn>;
  };
  let service: NutritionChatService;

  /** Queue the two reads every turn makes: the conversation, then its transcript. */
  const openWith = (overrides: Record<string, unknown> = {}) => {
    db.queueSelect([conversation(overrides)]);
    db.queueSelect([]);
  };

  beforeEach(() => {
    db = makeDb();
    intent = { extract: vi.fn() };
    resolver = {
      resolve: vi.fn(),
      resolveAll: vi.fn().mockResolvedValue([]),
      rescale: vi.fn(),
      candidatesFor: vi.fn().mockResolvedValue([]),
    };
    log = {
      logDraft: vi.fn().mockResolvedValue({ id: 'meal-1' }),
      replaceItems: vi.fn().mockResolvedValue({ id: 'meal-1' }),
      findByTypeOnDate: vi.fn().mockResolvedValue(null),
    };

    service = new NutritionChatService(
      db as never,
      intent as never,
      resolver as never,
      log as never,
    );
  });

  // ─── Logging ──────────────────────────────────────────────

  it('logs a confidently resolved meal and reports catalogue totals', async () => {
    openWith();
    intent.extract.mockResolvedValue(
      extraction({ foods: [{ name: 'Egg', quantity: 2, unit: 'piece' }] }),
    );
    resolver.resolveAll.mockResolvedValue([draftItem('Egg', { quantity: 2 })]);

    const result = await service.chat('user-1', chatDto());

    expect(result.status).toBe('logged');
    expect(log.logDraft).toHaveBeenCalledWith(
      'user-1',
      [expect.objectContaining({ name: 'Egg' })],
      expect.objectContaining({ type: 'breakfast' }),
    );
    // The number quoted back is the one computed from the food database.
    expect(result.message).toContain('100 kcal');
    expect(result.totals.calories).toBe(100);
  });

  it('holds the meal back and asks when a food is ambiguous', async () => {
    openWith();
    intent.extract.mockResolvedValue(
      extraction({ foods: [{ name: 'pasta', quantity: 1, unit: 'serving' }] }),
    );
    resolver.resolveAll.mockResolvedValue([draftItem('Pasta', { confidence: 0.2 })]);
    resolver.candidatesFor.mockResolvedValue([
      { name: 'Pasta with alfredo sauce', displayName: 'Pasta with alfredo sauce' },
      { name: 'Pasta with tomato sauce', displayName: 'Pasta with tomato sauce' },
    ]);

    const result = await service.chat('user-1', chatDto({ message: 'I ate pasta' }));

    expect(result.status).toBe('needs_clarification');
    expect(result.question?.options).toEqual([
      'Pasta with alfredo sauce',
      'Pasta with tomato sauce',
    ]);
    // Nothing is written until the ambiguity is settled.
    expect(log.logDraft).not.toHaveBeenCalled();
  });

  it('offers to add a custom food when nothing at all matches', async () => {
    openWith();
    intent.extract.mockResolvedValue(
      extraction({ foods: [{ name: 'grandma stew', quantity: 1, unit: 'serving' }] }),
    );
    resolver.resolveAll.mockResolvedValue([
      draftItem('Grandma stew', { foodId: null, confidence: 0 }),
    ]);
    resolver.candidatesFor.mockResolvedValue([]);

    const result = await service.chat('user-1', chatDto());

    expect(result.status).toBe('needs_clarification');
    expect(result.message).toMatch(/custom food/);
    expect(result.unresolved).toEqual(['Grandma stew']);
  });

  it('returns a draft without saving when the client wants to confirm first', async () => {
    openWith();
    intent.extract.mockResolvedValue(
      extraction({ foods: [{ name: 'Egg', quantity: 1, unit: 'piece' }] }),
    );
    resolver.resolveAll.mockResolvedValue([draftItem('Egg')]);

    const result = await service.chat('user-1', chatDto({ autoCommit: false }));

    expect(result.status).toBe('draft');
    expect(log.logDraft).not.toHaveBeenCalled();
  });

  it('adds a later food to the meal already in progress', async () => {
    openWith({ draftItems: [draftItem('Egg')] });
    intent.extract.mockResolvedValue(
      extraction({ foods: [{ name: 'Banana', quantity: 1, unit: 'piece' }] }),
    );
    resolver.resolveAll.mockResolvedValue([draftItem('Banana')]);

    const result = await service.chat('user-1', chatDto({ message: 'add a banana' }));

    expect(result.items.map((entry) => entry.name)).toEqual(['Egg', 'Banana']);
  });

  it('starts a new meal when a saved one belonged to a different slot', async () => {
    openWith({ mealId: 'meal-1', mealType: 'breakfast', draftItems: [draftItem('Egg')] });
    intent.extract.mockResolvedValue(
      extraction({ mealType: 'lunch', foods: [{ name: 'Rice', quantity: 1, unit: 'cup' }] }),
    );
    resolver.resolveAll.mockResolvedValue([draftItem('Rice')]);

    const result = await service.chat('user-1', chatDto({ message: 'for lunch I had rice' }));

    // Breakfast is left alone: a new meal is written rather than the old one edited.
    expect(result.items.map((entry) => entry.name)).toEqual(['Rice']);
    expect(log.replaceItems).not.toHaveBeenCalled();
    expect(log.logDraft).toHaveBeenCalled();
  });

  // ─── Editing ──────────────────────────────────────────────

  it('removes an item by the words the user used', async () => {
    openWith({ draftItems: [draftItem('Egg'), draftItem('Toast, white')] });
    intent.extract.mockResolvedValue(
      extraction({ intent: 'edit', edits: [{ op: 'remove', target: 'the toast' }] }),
    );

    const result = await service.chat('user-1', chatDto({ message: 'remove the toast' }));

    expect(result.items.map((entry) => entry.name)).toEqual(['Egg']);
  });

  it('rescales an item and re-prices it from the catalogue', async () => {
    openWith({ draftItems: [draftItem('Chicken breast')] });
    intent.extract.mockResolvedValue(
      extraction({
        intent: 'edit',
        edits: [{ op: 'set_quantity', target: 'chicken', quantity: 200, unit: 'g' }],
      }),
    );
    resolver.rescale.mockResolvedValue(
      draftItem('Chicken breast', { quantity: 200, unit: 'g', grams: 200, nutrients: nutrients(330) }),
    );

    const result = await service.chat('user-1', chatDto({ message: 'make the chicken 200 grams' }));

    expect(resolver.rescale).toHaveBeenCalledWith(expect.anything(), 200, 'g');
    expect(result.totals.calories).toBe(330);
  });

  it('swaps one food for another in place', async () => {
    openWith({ draftItems: [draftItem('Rice'), draftItem('Chicken')] });
    intent.extract.mockResolvedValue(
      extraction({
        intent: 'edit',
        edits: [
          { op: 'replace', target: 'rice', food: { name: 'Potato', quantity: 1, unit: 'piece' } },
        ],
      }),
    );
    resolver.resolve.mockResolvedValue(draftItem('Potato'));

    const result = await service.chat('user-1', chatDto({ message: 'replace rice with potatoes' }));

    expect(result.items.map((entry) => entry.name)).toEqual(['Potato', 'Chicken']);
  });

  it('updates the saved meal when editing one already logged', async () => {
    openWith({ mealId: 'meal-1', draftItems: [draftItem('Egg'), draftItem('Toast')] });
    intent.extract.mockResolvedValue(
      extraction({ intent: 'edit', edits: [{ op: 'remove', target: 'toast' }] }),
    );

    await service.chat('user-1', chatDto({ message: 'remove the toast' }));

    expect(log.replaceItems).toHaveBeenCalledWith('user-1', 'meal-1', [
      expect.objectContaining({ name: 'Egg' }),
    ]);
    expect(log.logDraft).not.toHaveBeenCalled();
  });

  it('says so when an edit names something that is not in the meal', async () => {
    openWith({ draftItems: [draftItem('Egg')] });
    intent.extract.mockResolvedValue(
      extraction({ intent: 'edit', edits: [{ op: 'remove', target: 'the salmon' }] }),
    );

    const result = await service.chat('user-1', chatDto({ message: 'remove the salmon' }));

    expect(result.message).toContain('salmon');
    expect(result.items).toHaveLength(1);
    expect(log.logDraft).not.toHaveBeenCalled();
  });

  it('empties the meal on a clear', async () => {
    openWith({ draftItems: [draftItem('Egg')] });
    intent.extract.mockResolvedValue(extraction({ intent: 'edit', edits: [{ op: 'clear' }] }));

    const result = await service.chat('user-1', chatDto({ message: 'start over' }));

    expect(result.items).toEqual([]);
    expect(result.status).toBe('chat');
  });

  // ─── Repeating ────────────────────────────────────────────

  it('copies yesterday\'s breakfast', async () => {
    openWith();
    intent.extract.mockResolvedValue(
      extraction({ intent: 'repeat', repeat: { day: 'yesterday', mealType: 'breakfast' } }),
    );
    log.findByTypeOnDate.mockResolvedValue({
      id: 'meal-0',
      items: [
        {
          foodId: 'id-Egg',
          name: 'Egg',
          quantity: 2,
          unit: 'piece',
          grams: 100,
          servingSize: '2 piece (100 g)',
          nutrients: nutrients(143),
        },
      ],
    });

    const result = await service.chat('user-1', chatDto({ message: 'same breakfast as yesterday' }));

    expect(log.findByTypeOnDate).toHaveBeenCalledWith('user-1', '2026-08-04', 'breakfast');
    expect(result.items.map((entry) => entry.name)).toEqual(['Egg']);
    expect(result.status).toBe('logged');
  });

  it('asks for the meal when there is nothing to repeat', async () => {
    openWith();
    intent.extract.mockResolvedValue(
      extraction({ intent: 'repeat', repeat: { day: 'yesterday', mealType: 'breakfast' } }),
    );
    log.findByTypeOnDate.mockResolvedValue(null);

    const result = await service.chat('user-1', chatDto());

    expect(result.message).toMatch(/couldn't find a breakfast/);
    expect(log.logDraft).not.toHaveBeenCalled();
  });

  // ─── Conversation handling ────────────────────────────────

  it('passes the draft and the open question to the model as context', async () => {
    openWith({
      draftItems: [draftItem('Egg')],
      pendingQuestion: { question: 'What type of pasta?', about: 'pasta', options: [] },
      mealId: 'meal-1',
    });
    intent.extract.mockResolvedValue(extraction({ intent: 'chat', reply: 'Sure.' }));

    await service.chat('user-1', chatDto({ message: 'alfredo' }));

    const [, context] = intent.extract.mock.calls[0];
    expect(context.draft).toHaveLength(1);
    expect(context.committed).toBe(true);
    expect(context.pendingQuestion?.question).toBe('What type of pasta?');
  });

  it('refuses to open a conversation belonging to someone else', async () => {
    db.queueSelect([]);

    await expect(service.chat('user-2', chatDto())).rejects.toThrow(/could not be found/);
  });

  it('holds a clarification the model raised, without logging anything', async () => {
    openWith({ draftItems: [draftItem('Egg')] });
    intent.extract.mockResolvedValue(
      extraction({
        intent: 'clarify',
        clarification: {
          question: 'What was in the sandwich?',
          about: 'sandwich',
          options: ['Chicken', 'Cheese'],
        },
      }),
    );

    const result = await service.chat('user-1', chatDto({ message: 'I had a sandwich' }));

    expect(result.status).toBe('needs_clarification');
    expect(result.question?.options).toEqual(['Chicken', 'Cheese']);
    expect(log.logDraft).not.toHaveBeenCalled();
  });
});
