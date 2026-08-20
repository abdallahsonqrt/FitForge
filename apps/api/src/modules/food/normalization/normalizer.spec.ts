import { describe, expect, it } from 'vitest';
import { normalizeFood } from './food-normalizer';
import { matchCanonical } from './canonical-foods';
import { emojiFor } from './emoji';
import { tidyServingLabel } from '../search/servings';

import type { FoodCategory } from '../types';

const food = (name: string, category: FoodCategory = 'other', extra = {}) =>
  normalizeFood({ name, category, ...extra });

describe('canonical matching', () => {
  it('identifies the food the spec calls out', () => {
    expect(matchCanonical('Eggs, Grade A, Large, egg whole')?.id).toBe('egg-whole');
  });

  it('prefers the more specific rule', () => {
    // Both the chicken and chicken-breast rules could fire; specificity decides.
    expect(matchCanonical('Chicken, broilers or fryers, breast, meat only, raw')?.id).toBe(
      'chicken-breast',
    );
  });

  it('does not relabel foods that merely mention an ingredient', () => {
    // The exclusion lists exist precisely for these.
    expect(matchCanonical('Egg noodles, cooked')).toBeNull();
    expect(matchCanonical('Bagels, egg')).toBeNull();
    expect(matchCanonical('Apple juice, canned')).toBeNull();
    expect(matchCanonical('Rice milk, unsweetened')).toBeNull();
  });

  it('separates the variants of one food', () => {
    expect(matchCanonical('Egg, white, raw, fresh')?.id).toBe('egg-white');
    expect(matchCanonical('Egg, yolk, raw, fresh')?.id).toBe('egg-yolk');
    expect(matchCanonical('Egg, whole, cooked, fried')?.id).toBe('egg-fried');
  });
});

describe('normalizeFood — curated', () => {
  it('turns the raw USDA name into something readable', () => {
    const result = food('Eggs, Grade A, Large, egg whole', 'dairy');

    expect(result.displayName).toBe('Whole Egg');
    expect(result.shortName).toBe('Egg');
    expect(result.emoji).toBe('🥚');
    expect(result.groupKey).toBe('egg');
    expect(result.curated).toBe(true);
  });

  it('keeps the raw name searchable', () => {
    // Someone who pasted the provider wording must still find the food.
    expect(food('Eggs, Grade A, Large, egg whole', 'dairy').keywords).toContain(
      'eggs grade a large egg whole',
    );
  });

  it('groups every egg variant together', () => {
    const groups = [
      'Eggs, Grade A, Large, egg whole',
      'Egg, white, raw, fresh',
      'Egg, yolk, raw, fresh',
      'Egg, whole, cooked, fried',
    ].map((name) => food(name, 'dairy').groupKey);

    expect(new Set(groups)).toEqual(new Set(['egg']));
  });

  it('suggests portions people actually use', () => {
    const eggs = food('Eggs, Grade A, Large, egg whole', 'dairy').servings;
    expect(eggs.map((s) => s.name)).toEqual(['1 egg', '2 eggs', '3 eggs', '100 g']);
    expect(eggs.find((s) => s.isDefault)?.name).toBe('1 egg');

    expect(food('Rice, white, long-grain, cooked', 'grains').servings[0].name).toBe(
      '1 cup, cooked',
    );
    expect(food('Chicken, broilers or fryers, breast', 'meat').servings[0].name).toBe('1 breast');
  });
});

describe('normalizeFood — heuristic fallback', () => {
  it('drops cataloguing noise', () => {
    // "broilers or fryers", "meat only" and the percentage clause are apparatus,
    // not description.
    expect(food('Beef, ground, 85% lean meat / 15% fat, raw', 'meat').displayName).toBe(
      'Raw Ground Beef',
    );
  });

  it('puts preparation before cut', () => {
    expect(food('Pork, loin, roasted', 'meat').displayName).toBe('Roasted Pork Loin');
  });

  it('singularises the head once qualifiers attach', () => {
    expect(food('Carrots, raw', 'vegetables').displayName).toBe('Raw Carrot');
  });

  it('strips barcodes and parentheticals', () => {
    expect(food('Granola Bar (Chocolate Chip) UPC: 0123456789', 'snacks').displayName).toBe(
      'Granola Bar',
    );
  });

  it('leaves an already-clean name alone', () => {
    expect(food('Kunafa', 'snacks').displayName).toBe('Kunafa');
  });

  it('never returns an empty label', () => {
    for (const name of ['NFS', ',,,', 'Grade A', '16 oz']) {
      const result = food(name, 'other');
      expect(result.displayName.length).toBeGreaterThan(0);
      expect(result.shortName.length).toBeGreaterThan(0);
    }
  });

  it('caps runaway names', () => {
    const result = food(
      'Beverages, coffee, instant, decaffeinated, powder, half the caffeine, prepared with water',
      'drinks',
    );
    expect(result.displayName.length).toBeLessThanOrEqual(60);
    expect(result.shortName.length).toBeLessThanOrEqual(28);
  });

  it('always offers grams alongside a natural unit', () => {
    const servings = food('Some Unlisted Vegetable Thing', 'vegetables').servings;
    expect(servings.some((s) => s.unit === 'g')).toBe(true);
    expect(servings.filter((s) => s.isDefault)).toHaveLength(1);
  });

  it('prefers a provider-stated serving weight over an estimate', () => {
    const servings = food('Some Snack Bar', 'snacks', {
      servingGrams: 45,
      servingLabel: '1 bar',
    }).servings;

    expect(servings[0].name).toBe('1 bar');
    expect(servings[0].gramsPerUnit).toBe(45);
    expect(servings[0].isDefault).toBe(true);
  });
});

describe('emoji', () => {
  it('matches specific foods before the general term they contain', () => {
    expect(emojiFor('sweet potato, baked', 'vegetables')).toBe('🍠');
    expect(emojiFor('potato, boiled', 'vegetables')).toBe('🥔');
    expect(emojiFor('peanut butter', 'snacks')).toBe('🥜');
  });

  it('prefers the dish over its ingredients', () => {
    // A chicken shawarma is a wrap, not a drumstick.
    expect(emojiFor('chicken shawarma', 'restaurant')).toBe('🌯');
    expect(emojiFor('chicken salad', 'recipes')).toBe('🥗');
  });

  it('falls back to the category', () => {
    expect(emojiFor('unrecognisable foodstuff', 'seafood')).toBe('🐟');
  });
});

describe('normalizeFood — branded products', () => {
  it('keeps a branded product’s own name instead of the canonical one', () => {
    // Collapsing this to "Greek Yogurt" would render every Chobani flavour
    // identically while each carries different macros.
    const result = normalizeFood({
      name: 'CHOBANI, Greek Yogurt, Strawberry',
      brand: 'Chobani',
      category: 'dairy',
    });

    expect(result.displayName).toContain('Strawberry');
    expect(result.displayName).not.toBe('Greek Yogurt');
  });

  it('still borrows the canonical group, icon and portions', () => {
    const result = normalizeFood({
      name: 'CHOBANI, Greek Yogurt, Strawberry',
      brand: 'Chobani',
      category: 'dairy',
    });

    // It is still a yogurt: it groups, looks and is portioned like one.
    expect(result.groupKey).toBe('yogurt');
    expect(result.emoji).toBe('🥛');
    expect(result.servings[0].name).toBe('1 cup');
  });

  it('leaves unbranded foods on the canonical name', () => {
    expect(normalizeFood({ name: 'Yogurt, Greek, plain, nonfat', category: 'dairy' }).displayName).toBe(
      'Greek Yogurt',
    );
  });
});

describe('normalizeFood — preparation keeps foods distinguishable', () => {
  it('does not collapse differently-prepared foods to one label', () => {
    // These are different foods with different macros (195 vs 165 kcal). Both
    // matching the chicken-breast rule must not make them share a name.
    const grilled = normalizeFood({ name: 'Grilled chicken breast', category: 'meat' });
    const raw = normalizeFood({ name: 'Chicken breast, raw', category: 'meat' });

    expect(grilled.displayName).not.toBe(raw.displayName);
    expect(grilled.displayName).toBe('Grilled Chicken Breast');
    expect(raw.displayName).toBe('Raw Chicken Breast');
  });

  it('leaves the canonical name alone when it already states preparation', () => {
    // The rule is called "Fried Egg"; nothing to add.
    expect(normalizeFood({ name: 'Egg, whole, cooked, fried', category: 'dairy' }).displayName).toBe(
      'Fried Egg',
    );
  });

  it('still produces the spec’s headline name', () => {
    // No preparation word in this one, so it stays exactly as specified.
    expect(
      normalizeFood({ name: 'Eggs, Grade A, Large, egg whole', category: 'dairy' }).displayName,
    ).toBe('Whole Egg');
  });

  it('does not re-admit size or grade noise', () => {
    const result = normalizeFood({ name: 'Eggs, Grade A, Large, egg whole', category: 'dairy' });
    expect(result.displayName).not.toMatch(/large|grade/i);
  });

  it('keeps grouping intact despite the differing names', () => {
    const grilled = normalizeFood({ name: 'Grilled chicken breast', category: 'meat' });
    const raw = normalizeFood({ name: 'Chicken breast, raw', category: 'meat' });
    expect(grilled.groupKey).toBe(raw.groupKey);
  });
});

describe('normalizeFood — real provider data defects', () => {
  it('never repeats a word in a name', () => {
    // Provider segments overlap; "Yoghurt Yoghurt" reads as a bug.
    const result = normalizeFood({
      name: 'Noosa, Yoghurt, Lemon Yoghurt',
      brand: 'Noosa',
      category: 'dairy',
    });
    const words = result.displayName.toLowerCase().split(' ');
    expect(new Set(words).size).toBe(words.length);
  });

  it('groups British and American spellings together', () => {
    const us = normalizeFood({ name: 'Yogurt, Greek, plain', category: 'dairy' });
    const uk = normalizeFood({ name: 'Greek Yoghurt, natural', category: 'dairy' });
    expect(uk.groupKey).toBe(us.groupKey);
    expect(uk.groupKey).toBe('yogurt');
  });

  it('does not treat a yogurt-covered snack as a yogurt', () => {
    expect(matchCanonical('Yogurt covered pretzels')).toBeNull();
  });

  it('tidies shouted provider serving labels', () => {
    // Open Food Facts serving strings are contributor free text.
    expect(tidyServingLabel('8 ONZ', 227)).toBe('8 oz');
    expect(tidyServingLabel('100grm', 100)).toBe('100 g');
    expect(tidyServingLabel('1 CONTAINER', 150)).toBe('1 container');
    // Contributors leave separators behind from half-finished edits.
    expect(tidyServingLabel('1 CONTAINER |', 150)).toBe('1 container');
  });

  it('replaces an unusable serving label with the weight', () => {
    expect(tidyServingLabel('   ', 40)).toBe('1 serving (40 g)');
    expect(tidyServingLabel(null, 40)).toBe('1 serving (40 g)');
    expect(tidyServingLabel('|', 40)).toBe('1 serving (40 g)');
  });

  it('leaves a curated portion name exactly as written', () => {
    // The backfill re-tidies stored names, so anything this function adds would
    // be added again and again, and a hand-written "1 cup" would drift into
    // "1 cup (160 g)" the first time someone ran it. Repair only.
    for (const name of ['1 cup', '1 egg', '2 eggs', '100 g', '1 breast', '1 cup, cooked']) {
      expect(tidyServingLabel(name, 160)).toBe(name);
    }
  });
});
