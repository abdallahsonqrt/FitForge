import { describe, expect, it, vi, beforeEach } from 'vitest';
import { addItem, matchItem, needsConfirmation, removeItem, replaceItem } from './draft';
import { describeMeal, mealTypeForHour, sumNutrients, DraftItem } from './types';
import { FoodResolverService } from './food-resolver.service';
import { FoodResult, Nutrients } from '../food/types';

/**
 * The parts of conversational logging that decide what gets written down.
 *
 * All of it runs without a model or a database: extraction is mocked at the
 * boundary and the food catalogue is a stub, because what is worth pinning down
 * here is the arithmetic and the reference matching — the places where a
 * mistake silently produces a plausible wrong number.
 */

// ─── Fixtures ───────────────────────────────────────────────

const nutrients = (calories: number, protein = 0, carbs = 0, fat = 0): Nutrients => ({
  calories,
  protein,
  carbs,
  fat,
  fiber: 0,
  sugar: 0,
  sodium: 0,
});

const item = (overrides: Partial<DraftItem> = {}): DraftItem => ({
  foodId: 'food-1',
  name: 'Egg',
  spokenName: 'egg',
  quantity: 1,
  unit: 'piece',
  grams: 50,
  servingLabel: '1 piece (50 g)',
  nutrients: nutrients(72, 6.3, 0.4, 4.8),
  confidence: 1,
  ...overrides,
});

const food = (overrides: Partial<FoodResult> = {}): FoodResult => ({
  id: 'food-1',
  name: 'Egg',
  displayName: 'Egg',
  shortName: 'Egg',
  emoji: '🥚',
  groupKey: 'egg',
  brand: null,
  category: 'dairy',
  kind: 'generic',
  source: 'local',
  imageUrl: null,
  per100g: nutrients(143, 12.6, 0.7, 9.5),
  servings: [
    {
      id: 's1',
      name: '1 large egg',
      amount: 1,
      unit: 'piece',
      gramsPerUnit: 50,
      grams: 50,
      isDefault: true,
    },
  ],
  defaultGrams: 50,
  isFavorite: false,
  score: 0.9,
  ...overrides,
});

// ─── Totals ─────────────────────────────────────────────────

describe('sumNutrients', () => {
  it('adds items and rounds to the precision the UI shows', () => {
    const total = sumNutrients([
      { nutrients: nutrients(72, 6.31, 0.36, 4.76) },
      { nutrients: nutrients(88, 3.12, 15.04, 1.22) },
    ]);

    expect(total.calories).toBe(160);
    expect(total.protein).toBe(9.4);
    expect(total.carbs).toBe(15.4);
  });

  it('is zero for an empty meal rather than NaN', () => {
    expect(sumNutrients([]).calories).toBe(0);
  });
});

describe('mealTypeForHour', () => {
  it('maps the clock to the meal slot', () => {
    expect(mealTypeForHour(8)).toBe('breakfast');
    expect(mealTypeForHour(13)).toBe('lunch');
    expect(mealTypeForHour(19)).toBe('dinner');
    expect(mealTypeForHour(23)).toBe('snack');
  });
});

describe('describeMeal', () => {
  it('names a meal after its contents', () => {
    expect(describeMeal([item({ name: 'Egg' }), item({ name: 'Toast' })])).toBe('Egg and Toast');
    expect(describeMeal([item(), item(), item()])).toBe('Egg and 2 more');
    expect(describeMeal([])).toBe('Meal');
  });
});

// ─── Reference matching ─────────────────────────────────────

describe('matchItem', () => {
  const draft = [
    item({ name: 'Toast, white', spokenName: 'toast' }),
    item({ name: 'Chicken breast, grilled', spokenName: 'chicken' }),
    item({ name: 'Rice, white, cooked', spokenName: 'rice' }),
  ];

  it('matches the word the user actually said', () => {
    expect(matchItem(draft, 'the toast')?.name).toBe('Toast, white');
    expect(matchItem(draft, 'rice')?.name).toBe('Rice, white, cooked');
  });

  it('ignores filler words around the reference', () => {
    expect(matchItem(draft, 'that chicken')?.name).toBe('Chicken breast, grilled');
  });

  it('matches on a fuller phrase than the item was logged under', () => {
    expect(matchItem(draft, 'chicken breast')?.name).toBe('Chicken breast, grilled');
  });

  it('returns null rather than guessing at something absent', () => {
    expect(matchItem(draft, 'the salmon')).toBeNull();
    expect(matchItem([], 'toast')).toBeNull();
  });

  it('refuses to choose between two equally good matches', () => {
    // Removing "the chicken" here could mean either dish. Asking beats deleting
    // the wrong one.
    const ambiguous = [
      item({ name: 'Chicken', spokenName: 'chicken' }),
      item({ name: 'Chicken', spokenName: 'chicken' }),
    ];
    expect(matchItem(ambiguous, 'the chicken')).toBeNull();
  });

  it('ignores a reference made only of filler', () => {
    expect(matchItem(draft, 'the')).toBeNull();
  });
});

// ─── Draft operations ───────────────────────────────────────

describe('addItem', () => {
  it('accumulates the same food instead of listing it twice', () => {
    // "I had an egg" then "add another egg" is two eggs, not two entries.
    const draft = addItem([item()], item());

    expect(draft).toHaveLength(1);
    expect(draft[0].quantity).toBe(2);
    expect(draft[0].grams).toBe(100);
    expect(draft[0].nutrients.calories).toBe(144);
  });

  it('updates the serving label to the new quantity', () => {
    const draft = addItem([item()], item());
    expect(draft[0].servingLabel).toBe('2 piece (50 g)');
  });

  it('keeps different units separate, since they cannot be added', () => {
    const draft = addItem([item()], item({ unit: 'g', quantity: 100, grams: 100 }));
    expect(draft).toHaveLength(2);
  });

  it('keeps different foods separate', () => {
    const draft = addItem([item()], item({ foodId: 'food-2', name: 'Toast' }));
    expect(draft).toHaveLength(2);
  });

  it('never merges unresolved items, which are not known to be the same food', () => {
    const unknown = item({ foodId: null, name: 'Grandma stew' });
    const draft = addItem([unknown], { ...unknown });
    expect(draft).toHaveLength(2);
  });
});

describe('removeItem and replaceItem', () => {
  it('removes only the targeted entry', () => {
    const toast = item({ name: 'Toast' });
    const draft = [item(), toast];
    expect(removeItem(draft, toast)).toEqual([draft[0]]);
  });

  it('replaces in place, preserving order', () => {
    const rice = item({ name: 'Rice' });
    const potato = item({ name: 'Potato' });
    const draft = replaceItem([item(), rice], rice, potato);

    expect(draft[1].name).toBe('Potato');
    expect(draft).toHaveLength(2);
  });
});

describe('needsConfirmation', () => {
  it('flags unresolved foods and weak matches', () => {
    const draft = [
      item({ confidence: 1 }),
      item({ confidence: 0.2, name: 'Pasta' }),
      item({ foodId: null, name: 'Mystery dish' }),
    ];

    const uncertain = needsConfirmation(draft, 0.45);
    expect(uncertain.map((entry) => entry.name)).toEqual(['Pasta', 'Mystery dish']);
  });
});

// ─── Portion pricing ────────────────────────────────────────

/**
 * `FoodSearchService.search` returns the flat list plus its grouped view. The
 * resolver only ever reads `results`, so these fixtures leave grouping empty.
 */
const searchResponse = (items: FoodResult[]) => ({
  results: items,
  groups: [],
  ungrouped: items,
});

describe('FoodResolverService', () => {
  let search: { search: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn> };
  let resolver: FoodResolverService;

  beforeEach(() => {
    search = { search: vi.fn(), findById: vi.fn() };
    resolver = new FoodResolverService(search as never);
  });

  it('prices a portion from the catalogue, never from the caller', async () => {
    search.search.mockResolvedValue(searchResponse([food()]));

    const [resolved] = await resolver.resolveAll([{ name: 'egg', quantity: 2, unit: 'piece' }]);

    // 2 x 50 g of a 143 kcal/100 g food.
    expect(resolved.grams).toBe(100);
    expect(resolved.nutrients.calories).toBe(143);
    expect(resolved.foodId).toBe('food-1');
  });

  it('uses the food\'s own recorded portion over the category average', async () => {
    search.search.mockResolvedValue(
      searchResponse([food({ servings: [{ ...food().servings[0], gramsPerUnit: 172 }] })]),
    );

    const resolved = await resolver.resolve({ name: 'chicken', quantity: 1, unit: 'piece' });
    expect(resolved.grams).toBe(172);
  });

  it('treats a weight unit as exact', async () => {
    search.search.mockResolvedValue(searchResponse([food()]));

    const resolved = await resolver.resolve({ name: 'egg', quantity: 200, unit: 'g' });
    expect(resolved.grams).toBe(200);
    expect(resolved.nutrients.calories).toBe(286);
  });

  it('returns an unresolved item with zero nutrition when nothing matches', async () => {
    search.search.mockResolvedValue(searchResponse([]));

    const resolved = await resolver.resolve({ name: 'grandma stew', quantity: 1, unit: 'serving' });

    // The item survives so the user can correct it, but contributes no calories:
    // a guessed number is worse than a visible gap.
    expect(resolved.foodId).toBeNull();
    expect(resolved.nutrients.calories).toBe(0);
    expect(resolved.confidence).toBe(0);
  });

  it('falls back to the plain name when the qualified one finds nothing', async () => {
    search.search
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(searchResponse([food({ name: 'Toast' })]));

    const resolved = await resolver.resolve({
      name: 'toast',
      quantity: 1,
      unit: 'slice',
      note: 'with butter',
    });

    expect(search.search).toHaveBeenCalledTimes(2);
    expect(search.search.mock.calls[0][0].query).toBe('toast with butter');
    expect(search.search.mock.calls[1][0].query).toBe('toast');
    expect(resolved.foodId).toBe('food-1');
  });

  it('survives a search outage without failing the whole meal', async () => {
    search.search.mockRejectedValue(new Error('provider down'));

    const resolved = await resolver.resolve({ name: 'egg', quantity: 1, unit: 'piece' });
    expect(resolved.foodId).toBeNull();
  });

  it('treats an exact name match as certain regardless of rank', async () => {
    search.search.mockResolvedValue(searchResponse([food({ score: 0.3 })]));

    const resolved = await resolver.resolve({ name: 'Egg', quantity: 1, unit: 'piece' });
    expect(resolved.confidence).toBe(1);
  });

  it('reports low confidence on a loose match, so the user is asked', async () => {
    search.search.mockResolvedValue(searchResponse([food({ name: 'Pasta with alfredo sauce', score: 0.3 })]));

    const resolved = await resolver.resolve({ name: 'pasta', quantity: 1, unit: 'serving' });
    expect(resolved.confidence).toBeLessThan(0.45);
  });

  it('rescales an item without searching again', async () => {
    search.findById.mockResolvedValue(food());

    const rescaled = await resolver.rescale(item(), 200, 'g');

    expect(search.search).not.toHaveBeenCalled();
    expect(rescaled.grams).toBe(200);
    expect(rescaled.nutrients.calories).toBe(286);
  });
});
