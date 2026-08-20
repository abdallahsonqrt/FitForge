export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Mirrors the `meals` table returned by `GET /meals`. */
export interface Meal {
  id: string;
  userId: string;
  name: string;
  type: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  date: string;
  createdAt: string;
}

/** `GET /meals/summary/:date` — totals only, no goals. */
export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface LogMealPayload {
  name: string;
  type: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** ISO datetime; the API truncates it to a date. */
  date: string;
}

/** `POST /ai/meals/extract` and `/conversation`. */
export type AiMealResponse =
  | { status: 'needs_clarification'; conversationId: string; message: string }
  | { status: 'logged'; conversationId: string; meal: MacroTotals & { name: string } }
  | { status: 'error'; message: string };

export const EMPTY_MACROS: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

// ─── Food search (`GET /foods/*`) ────────────────────────────────────────────
//
// Mirrors `apps/api/src/modules/food/types.ts`. The API searches its own
// catalogue first and falls back to USDA / Open Food Facts, storing what it
// finds — so `source` describes where a food originally came from, not where
// this particular response was served from.

export type FoodSource = 'local' | 'usda' | 'off';

/** Curated generic food ("Bananas, raw") vs branded packaged product. */
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

export type ServingUnit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'cup'
  | 'piece'
  | 'slice'
  | 'tablespoon'
  | 'teaspoon'
  | 'serving';

/** Full nutrition for a fixed quantity. */
export interface Nutrients extends MacroTotals {
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface ServingOption {
  id: string;
  name: string;
  amount: number;
  unit: ServingUnit;
  gramsPerUnit: number;
  /** Total grams this portion weighs. */
  grams: number;
  isDefault: boolean;
}

export interface FoodItem {
  id: string;
  /**
   * The provider's original name — "Eggs, Grade A, Large, egg whole". Kept for
   * reference; never render this. Use `displayName`.
   */
  name: string;
  /**
   * The name to show: a normalised, reader-facing label ("Whole Egg"), or the
   * translation when searching in another language.
   */
  displayName: string;
  /** Compact label for chips and dense rows — "Egg". */
  shortName: string;
  /** Icon for the card — "🥚". */
  emoji: string;
  /** Family this food belongs to; null if it was never normalised. */
  groupKey: string | null;
  brand: string | null;
  category: FoodCategory;
  kind: FoodKind;
  source: FoodSource;
  imageUrl: string | null;
  /** Nutrition per 100 g — the basis every portion scales from. */
  per100g: Nutrients;
  servings: ServingOption[];
  /** Grams of the portion the food opens on. */
  defaultGrams: number;
  isFavorite: boolean;
  score?: number;
}

/** A family of near-identical foods, shown under one header. */
export interface FoodGroup {
  key: string;
  /** Header text — "Eggs". */
  label: string;
  emoji: string;
  /** Total matches in the family, which may exceed `items.length`. */
  count: number;
  items: FoodItem[];
}

/**
 * `GET /foods/search`. `results` is the flat ranked list; `groups` is the same
 * data collapsed into families, with `ungrouped` holding the rest. Both views
 * arrive in one request.
 */
export interface FoodSearchResponse {
  results: FoodItem[];
  groups: FoodGroup[];
  ungrouped: FoodItem[];
}

/** `GET /foods/autocomplete` — no nutrition, built for speed. */
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

/** `GET /foods/suggestions` — the pre-search screen. */
export interface FoodSuggestionFeed {
  mealType: MealType;
  forThisMeal: FoodItem[];
  favorites: FoodItem[];
  recent: FoodItem[];
}

export const FOOD_SOURCE_LABEL: Record<FoodSource, string> = {
  local: 'FitForge',
  usda: 'USDA',
  off: 'Open Food Facts',
};

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  fruits: 'Fruits',
  vegetables: 'Vegetables',
  meat: 'Meat',
  seafood: 'Seafood',
  dairy: 'Dairy',
  grains: 'Grains',
  snacks: 'Snacks',
  drinks: 'Drinks',
  supplements: 'Supplements',
  recipes: 'Recipes',
  restaurant: 'Restaurant',
  other: 'Other',
};

/** Scale a food's per-100 g macros to an arbitrary weight. */
export const macrosForGrams = (item: FoodItem, grams: number): MacroTotals => {
  const factor = grams / 100;
  return {
    calories: Math.round(item.per100g.calories * factor),
    protein: Math.round(item.per100g.protein * factor * 10) / 10,
    carbs: Math.round(item.per100g.carbs * factor * 10) / 10,
    fat: Math.round(item.per100g.fat * factor * 10) / 10,
  };
};

/**
 * Grams for `amount` of a serving option. The server already resolved the
 * per-food conversion, so scaling the option's own weight is all that's left.
 */
export const gramsForServing = (option: ServingOption, amount: number): number =>
  Math.round(amount * option.gramsPerUnit * 100) / 100;
