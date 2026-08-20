/**
 * Public contracts for the food search API. The mobile client mirrors these in
 * `apps/mobile/src/features/nutrition/types`.
 */

export type FoodSource = 'local' | 'usda' | 'off';
export type FoodKind = 'generic' | 'branded';

export const FOOD_CATEGORIES = [
  'fruits',
  'vegetables',
  'meat',
  'seafood',
  'dairy',
  'grains',
  'snacks',
  'drinks',
  'supplements',
  'recipes',
  'restaurant',
  'other',
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export const SERVING_UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'cup',
  'piece',
  'slice',
  'tablespoon',
  'teaspoon',
  'serving',
] as const;

export type ServingUnit = (typeof SERVING_UNITS)[number];

/** Nutrition for a fixed quantity. */
export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface ServingOption {
  id: string;
  /** Display label, e.g. "1 cup, cooked". */
  name: string;
  amount: number;
  unit: ServingUnit;
  /** Grams in one `unit` — how this portion converts to the per-100 g basis. */
  gramsPerUnit: number;
  /** Total grams for `amount` × `unit`. */
  grams: number;
  isDefault: boolean;
}

/** One food as returned by search and detail endpoints. */
export interface FoodResult {
  id: string;
  /**
   * The provider's original name — "Eggs, Grade A, Large, egg whole". Kept for
   * reference and debugging; clients should render `displayName`.
   */
  name: string;
  /**
   * The name to show. A normalised, reader-facing label ("Whole Egg"), or the
   * translation when the search was made in another language.
   */
  displayName: string;
  /** Compact label for chips and dense rows — "Egg". */
  shortName: string;
  /** Icon for the result card — "🥚". */
  emoji: string;
  /** Family this food belongs to, for grouping. Null if never normalised. */
  groupKey: string | null;
  brand: string | null;
  category: FoodCategory;
  kind: FoodKind;
  source: FoodSource;
  imageUrl: string | null;
  /** Nutrition per 100 g — the basis every serving scales from. */
  per100g: Nutrients;
  servings: ServingOption[];
  /** Grams of the default serving, or 100 when the food has no named portion. */
  defaultGrams: number;
  isFavorite: boolean;
  /** Relevance, 0–1. Present on search results, absent on direct lookups. */
  score?: number;
}

/** A family of near-identical foods, presented under one header. */
export interface FoodGroup {
  key: string;
  /** Header text — "Eggs". */
  label: string;
  emoji: string;
  /** Total matches in this family, which may exceed `items.length`. */
  count: number;
  items: FoodResult[];
}

/**
 * A search response. `results` is the flat ranked list; `groups` is the same
 * data collapsed into families, with `ungrouped` holding what didn't belong to
 * one. Clients render either view without a second request.
 */
export interface FoodSearchResponse {
  results: FoodResult[];
  groups: FoodGroup[];
  ungrouped: FoodResult[];
}

/** A lightweight autocomplete row — no nutrition, built to be fast. */
export interface FoodSuggestion {
  id: string;
  name: string;
  displayName: string;
  shortName: string;
  emoji: string;
  brand: string | null;
  category: FoodCategory;
  calories: number;
}

export const EMPTY_NUTRIENTS: Nutrients = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
};

/** Atwater factors: kcal per gram. */
const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 };

/** True when a record carries at least some usable nutrition. */
export const hasNutrition = (nutrients: Nutrients): boolean =>
  nutrients.calories > 0 || nutrients.protein > 0 || nutrients.carbs > 0 || nutrients.fat > 0;

/**
 * Some provider records carry macros but no energy figure. Rather than show
 * "0 kcal" in a calorie tracker, derive it from the macros that are present.
 */
export const withDerivedCalories = (nutrients: Nutrients): Nutrients => {
  if (nutrients.calories > 0) return nutrients;

  const derived =
    nutrients.protein * KCAL_PER_GRAM.protein +
    nutrients.carbs * KCAL_PER_GRAM.carbs +
    nutrients.fat * KCAL_PER_GRAM.fat;

  return derived > 0 ? { ...nutrients, calories: derived } : nutrients;
};

export const roundNutrients = (nutrients: Nutrients): Nutrients => ({
  calories: Math.round(nutrients.calories),
  protein: Math.round(nutrients.protein * 10) / 10,
  carbs: Math.round(nutrients.carbs * 10) / 10,
  fat: Math.round(nutrients.fat * 10) / 10,
  fiber: Math.round(nutrients.fiber * 10) / 10,
  sugar: Math.round(nutrients.sugar * 10) / 10,
  sodium: Math.round(nutrients.sodium * 10) / 10,
});

/** Scale per-100 g nutrition to an arbitrary weight. */
export const nutrientsForGrams = (per100g: Nutrients, grams: number): Nutrients => {
  const factor = grams / 100;
  return roundNutrients({
    calories: per100g.calories * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
    fiber: per100g.fiber * factor,
    sugar: per100g.sugar * factor,
    sodium: per100g.sodium * factor,
  });
};
