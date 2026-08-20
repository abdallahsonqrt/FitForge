import { describe, expect, it } from 'vitest';
import { scoreCandidate, Scorable, UserAffinity } from '../search/ranking';
import { groupResults } from './grouping';
import { FoodResult } from '../types';

/**
 * The four ranking inputs the redesign calls for — relevance, user history,
 * popularity and name simplicity — plus the grouping that presents the result.
 */

const candidate = (searchName: string, extra: Partial<Scorable> = {}): Scorable => ({
  searchName,
  kind: 'generic',
  popularity: 0,
  verified: false,
  similarity: 0.5,
  ...extra,
});

const affinity = (extra: Partial<UserAffinity> = {}): UserAffinity => ({
  usageCount: 0,
  daysSinceUsed: null,
  isFavorite: false,
  ...extra,
});

describe('ranking — user history', () => {
  it('promotes a food this user eats over one they do not', () => {
    const eaten = scoreCandidate('egg', candidate('egg'), affinity({ usageCount: 20, daysSinceUsed: 1 }));
    const unknown = scoreCandidate('egg', candidate('egg'));

    expect(eaten).toBeGreaterThan(unknown);
  });

  it('decays with time since last eaten', () => {
    const recent = scoreCandidate('rice', candidate('rice'), affinity({ usageCount: 10, daysSinceUsed: 1 }));
    const stale = scoreCandidate('rice', candidate('rice'), affinity({ usageCount: 10, daysSinceUsed: 180 }));

    expect(recent).toBeGreaterThan(stale);
  });

  it('needs both habit and recency', () => {
    // Eaten fifty times, but not for a year — not what you want today.
    const lapsed = scoreCandidate('oats', candidate('oats'), affinity({ usageCount: 50, daysSinceUsed: 365 }));
    // Eaten twice, both times this week.
    const current = scoreCandidate('oats', candidate('oats'), affinity({ usageCount: 2, daysSinceUsed: 2 }));

    expect(current).toBeGreaterThan(lapsed);
  });

  it('counts a favourite that has never been logged', () => {
    const favorite = scoreCandidate('milk', candidate('milk'), affinity({ isFavorite: true }));
    expect(favorite).toBeGreaterThan(scoreCandidate('milk', candidate('milk')));
  });

  it('never lets history beat actually typing a food’s name', () => {
    // The user eats rice constantly, but they typed "oats".
    const typed = scoreCandidate('oats', candidate('oats'));
    const habitual = scoreCandidate(
      'oats',
      candidate('rice pudding'),
      affinity({ usageCount: 500, daysSinceUsed: 0, isFavorite: true }),
    );

    expect(typed).toBeGreaterThan(habitual);
  });
});

describe('ranking — name simplicity', () => {
  it('prefers the readable name over the database one', () => {
    const readable = candidate('eggs grade a large egg whole', {
      displayName: 'Whole Egg',
      curated: true,
    });
    const raw = candidate('eggs grade a large egg whole', {
      displayName: 'Eggs, Grade A, Large, egg whole',
      curated: false,
    });

    expect(scoreCandidate('egg', readable)).toBeGreaterThan(scoreCandidate('egg', raw));
  });

  it('penalises commas, the signature of a leaked provider name', () => {
    const clean = candidate('chicken breast', { displayName: 'Chicken Breast' });
    const commas = candidate('chicken breast', { displayName: 'Chicken, breast, raw' });

    expect(scoreCandidate('chicken', clean)).toBeGreaterThan(scoreCandidate('chicken', commas));
  });

  it('stays within 0 and 1 with every signal maxed', () => {
    const score = scoreCandidate(
      'rice',
      candidate('rice', {
        similarity: 1,
        popularity: 10_000,
        verified: true,
        displayName: 'Rice',
        curated: true,
      }),
      affinity({ usageCount: 1000, daysSinceUsed: 0, isFavorite: true }),
    );

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ─── Grouping ────────────────────────────────────────────────

const result = (id: string, groupKey: string | null, shortName: string): FoodResult =>
  ({
    id,
    name: shortName,
    displayName: shortName,
    shortName,
    emoji: '🥚',
    groupKey,
    brand: null,
    category: 'dairy',
    kind: 'generic',
    source: 'local',
    imageUrl: null,
    per100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
    servings: [],
    defaultGrams: 100,
    isFavorite: false,
  }) as FoodResult;

describe('grouping', () => {
  it('collapses a family under one header', () => {
    const { groups } = groupResults([
      result('1', 'egg', 'Egg'),
      result('2', 'egg', 'Egg White'),
      result('3', 'egg', 'Egg Yolk'),
      result('4', 'egg', 'Fried Egg'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Eggs');
    expect(groups[0].items.map((item) => item.displayName)).toEqual([
      'Egg',
      'Egg White',
      'Egg Yolk',
      'Fried Egg',
    ]);
  });

  it('leaves a lone food ungrouped', () => {
    // A "group" of one is a row with a pointless header.
    const { groups, ungrouped } = groupResults([
      result('1', 'egg', 'Egg'),
      result('2', 'banana', 'Banana'),
    ]);

    expect(groups).toHaveLength(0);
    expect(ungrouped).toHaveLength(2);
  });

  it('preserves ranking order across and within groups', () => {
    const { groups } = groupResults([
      result('1', 'chicken', 'Chicken'),
      result('2', 'egg', 'Egg'),
      result('3', 'chicken', 'Chicken Breast'),
      result('4', 'egg', 'Egg White'),
    ]);

    // Chicken's best member ranked first, so its group leads.
    expect(groups.map((group) => group.key)).toEqual(['chicken', 'egg']);
    expect(groups[0].items.map((item) => item.id)).toEqual(['1', '3']);
  });

  it('claims every member of a large family, so none leak out as duplicates', () => {
    // Truncating the group used to leave members 7+ in `ungrouped`, where the
    // client rendered them again beneath their own group.
    const many = Array.from({ length: 9 }, (_, index) =>
      result(String(index), 'egg', `Egg ${index}`),
    );
    const { groups, ungrouped } = groupResults(many);

    expect(groups[0].count).toBe(9);
    expect(groups[0].items).toHaveLength(9);
    expect(ungrouped).toHaveLength(0);
  });

  it('never returns a food both grouped and ungrouped, at any family size', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => result(`e${i}`, 'egg', `Egg ${i}`)),
      result('solo', 'banana', 'Banana'),
    ];
    const { groups, ungrouped } = groupResults(items);

    const groupedIds = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
    expect(ungrouped.every((item) => !groupedIds.has(item.id))).toBe(true);
    expect(groupedIds.size + ungrouped.length).toBe(items.length);
  });

  it('never grouped and ungrouped the same food', () => {
    const { groups, ungrouped } = groupResults([
      result('1', 'egg', 'Egg'),
      result('2', 'egg', 'Egg White'),
      result('3', 'banana', 'Banana'),
    ]);

    const groupedIds = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(groupedIds).toEqual(['1', '2']);
    expect(ungrouped.map((item) => item.id)).toEqual(['3']);
  });

  it('leaves unnormalised foods alone', () => {
    // No group key means the food never went through normalisation.
    const { groups, ungrouped } = groupResults([
      result('1', null, 'Something'),
      result('2', null, 'Another'),
    ]);

    expect(groups).toHaveLength(0);
    expect(ungrouped).toHaveLength(2);
  });

  it('falls back to the most general member name for an unknown family', () => {
    const { groups } = groupResults([
      result('1', 'granola bar', 'Granola Bar Deluxe'),
      result('2', 'granola bar', 'Granola Bar'),
    ]);

    expect(groups[0].label).toBe('Granola Bar');
  });
});

describe('ranking — exactness is judged on what a food is called', () => {
  it('ranks the staple above a novelty product that borrowed its name', () => {
    // USDA carries branded confectionery literally named "Egg" (a Snickers egg,
    // 513 kcal). It must not outrank the actual egg, whose provider name is
    // "Egg, whole, raw" and so never matches "egg" exactly.
    const staple = candidate('egg whole raw', {
      displayName: 'Whole Egg',
      shortName: 'Egg',
      curated: true,
      verified: true,
      popularity: 100,
    });
    const novelty = candidate('egg', { kind: 'branded', displayName: 'Egg', shortName: 'Egg' });

    expect(scoreCandidate('egg', staple)).toBeGreaterThan(scoreCandidate('egg', novelty));
  });

  it('still rewards a genuine exact match on the raw name', () => {
    const exact = candidate('kunafa', { displayName: 'Kunafa', shortName: 'Kunafa' });
    const partial = candidate('kunafa with cream', {
      displayName: 'Kunafa With Cream',
      shortName: 'Kunafa',
    });
    expect(scoreCandidate('kunafa', exact)).toBeGreaterThanOrEqual(
      scoreCandidate('kunafa', partial),
    );
  });
});

describe('ranking — score is a true 0–1', () => {
  it('reaches 1 for a perfect match instead of topping out at 0.667', () => {
    // `exact`, `prefix` and `wordPrefix` are mutually exclusive, so summing all
    // three into the divisor capped a perfect match at two thirds.
    const perfect = scoreCandidate(
      'rice',
      candidate('rice', {
        similarity: 1,
        popularity: 10_000_000,
        verified: true,
        displayName: 'Rice',
        shortName: 'Rice',
        curated: true,
      }),
      affinity({ usageCount: 100_000, daysSinceUsed: 0, isFavorite: true }),
    );

    expect(perfect).toBeGreaterThan(0.99);
    expect(perfect).toBeLessThanOrEqual(1);
  });

  it('still never goes negative or above 1 for a weak match', () => {
    const weak = scoreCandidate('zzzz', candidate('rice'));
    expect(weak).toBeGreaterThanOrEqual(0);
    expect(weak).toBeLessThanOrEqual(1);
  });
});
