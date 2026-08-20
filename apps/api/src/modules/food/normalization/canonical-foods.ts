import { FoodCategory, ServingUnit } from '../types';
import { normalize } from '../search/normalize';

/**
 * The curated half of normalisation.
 *
 * Heuristics can tidy any name, but only a human knows that "Eggs, Grade A,
 * Large, egg whole" is the thing people call a whole egg, that it belongs in a
 * group with egg whites and yolks, and that nobody weighs eggs in grams. This
 * table encodes that for the foods people actually log; the heuristic cleaner in
 * `food-normalizer.ts` handles the long tail behind it.
 *
 * Deliberately data, not code: adding a food is adding an entry, and the
 * matching rules below are the only logic involved.
 */

export interface CanonicalServing {
  name: string;
  amount: number;
  unit: ServingUnit;
  gramsPerUnit: number;
  isDefault?: boolean;
}

export interface CanonicalFood {
  /** Stable identifier, for tests and debugging. */
  id: string;
  /** Foods sharing a group are presented together under `groupLabel`. */
  group: string;
  groupLabel: string;
  displayName: string;
  shortName: string;
  emoji: string;
  category: FoodCategory;
  /** Extra terms this food should be findable by. */
  keywords: string[];
  /** Every one of these must appear in the raw name for the rule to apply. */
  requires: string[];
  /**
   * At least one of these must appear. For foods identified by any of several
   * wordings for the same thing — "hard boiled" and "hard cooked" are one food.
   */
  requiresAny?: string[];
  /** Any of these appearing strengthens the match, breaking ties between rules. */
  prefers?: string[];
  /** Any of these appearing disqualifies the rule outright. */
  excludes?: string[];
  servings?: CanonicalServing[];
}

/**
 * Disqualifiers that apply to every rule in a group.
 *
 * "Egg noodles" and "Bagels, egg" are not eggs under *any* egg rule, so the
 * exclusion belongs to the group rather than being repeated on each member —
 * where forgetting it on one rule silently mislabels food, which is exactly how
 * "Egg noodles, cooked" first came back as a boiled egg.
 */
const GROUP_EXCLUDES: Record<string, string[]> = {
  egg: ['noodle', 'bagel', 'substitute', 'nog', 'roll', 'bread', 'plant based', 'free range'],
  // A yogurt-covered pretzel is a snack, not a yogurt.
  yogurt: ['covered', 'raisin', 'pretzel', 'granola', 'parfait'],
  chicken: ['soup', 'nugget', 'flavored', 'flavour', 'bouillon', 'stock', 'broth'],
  rice: ['cake', 'flour', 'milk', 'drink', 'vinegar', 'paper', 'krispies'],
  // Plant milks are a different food with different macros, never "Whole Milk".
  milk: [
    'chocolate',
    'shake',
    'candy',
    'powder',
    'condensed',
    'evaporated',
    'rice',
    'soy',
    'almond',
    'oat',
    'coconut',
    'cashew',
  ],
  bread: ['crumb', 'stick', 'pudding', 'stuffing'],
  coffee: ['cake', 'candy', 'creamer', 'flavored', 'ice cream'],
  tea: ['cake', 'candy', 'steak', 'bread', 'spoon'],
  apple: ['juice', 'sauce', 'pie', 'cider', 'vinegar', 'pineapple', 'chip', 'turnover'],
  banana: ['bread', 'chip', 'pudding', 'flavored', 'shake', 'split'],
  orange: ['juice', 'soda', 'flavored', 'peel', 'zest', 'marmalade'],
};

/** Portions shared by foods measured the same way. */
const EGG_SERVINGS: CanonicalServing[] = [
  { name: '1 egg', amount: 1, unit: 'piece', gramsPerUnit: 50, isDefault: true },
  { name: '2 eggs', amount: 2, unit: 'piece', gramsPerUnit: 50 },
  { name: '3 eggs', amount: 3, unit: 'piece', gramsPerUnit: 50 },
  { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
];

const RICE_SERVINGS: CanonicalServing[] = [
  { name: '1 cup, cooked', amount: 1, unit: 'cup', gramsPerUnit: 158, isDefault: true },
  { name: '½ cup, cooked', amount: 0.5, unit: 'cup', gramsPerUnit: 158 },
  { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
];

const CHICKEN_SERVINGS: CanonicalServing[] = [
  { name: '1 piece', amount: 1, unit: 'piece', gramsPerUnit: 120, isDefault: true },
  { name: '1 breast', amount: 1, unit: 'piece', gramsPerUnit: 172 },
  { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
];

const CUP_DRINK_SERVINGS: CanonicalServing[] = [
  { name: '1 cup', amount: 1, unit: 'cup', gramsPerUnit: 240, isDefault: true },
  { name: '1 mug', amount: 1, unit: 'cup', gramsPerUnit: 350 },
  { name: '100 ml', amount: 100, unit: 'ml', gramsPerUnit: 1 },
];

const SLICE_SERVINGS: CanonicalServing[] = [
  { name: '1 slice', amount: 1, unit: 'slice', gramsPerUnit: 30, isDefault: true },
  { name: '2 slices', amount: 2, unit: 'slice', gramsPerUnit: 30 },
  { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
];

const WHOLE_FRUIT_SERVINGS = (grams: number): CanonicalServing[] => [
  { name: '1 medium', amount: 1, unit: 'piece', gramsPerUnit: grams, isDefault: true },
  { name: '1 large', amount: 1, unit: 'piece', gramsPerUnit: Math.round(grams * 1.35) },
  { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
];

export const CANONICAL_FOODS: CanonicalFood[] = [
  // ─── Eggs ────────────────────────────────────────────────
  {
    id: 'egg-white',
    group: 'egg',
    groupLabel: 'Eggs',
    displayName: 'Egg White',
    shortName: 'Egg White',
    emoji: '🥚',
    category: 'dairy',
    keywords: ['egg white', 'egg whites', 'albumen', 'بياض بيض'],
    requires: ['egg', 'white'],
    excludes: ['yolk', 'whole', 'bread', 'noodle'],
    servings: [
      { name: '1 white', amount: 1, unit: 'piece', gramsPerUnit: 33, isDefault: true },
      { name: '3 whites', amount: 3, unit: 'piece', gramsPerUnit: 33 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'egg-yolk',
    group: 'egg',
    groupLabel: 'Eggs',
    displayName: 'Egg Yolk',
    shortName: 'Egg Yolk',
    emoji: '🥚',
    category: 'dairy',
    keywords: ['egg yolk', 'egg yolks', 'صفار بيض'],
    requires: ['egg', 'yolk'],
    excludes: ['white', 'whole'],
    servings: [
      { name: '1 yolk', amount: 1, unit: 'piece', gramsPerUnit: 17, isDefault: true },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'egg-fried',
    group: 'egg',
    groupLabel: 'Eggs',
    displayName: 'Fried Egg',
    shortName: 'Fried Egg',
    emoji: '🍳',
    category: 'dairy',
    keywords: ['fried egg', 'fried eggs', 'بيض مقلي'],
    requires: ['egg', 'fried'],
    excludes: ['rice', 'noodle'],
    servings: EGG_SERVINGS,
  },
  {
    id: 'egg-scrambled',
    group: 'egg',
    groupLabel: 'Eggs',
    displayName: 'Scrambled Egg',
    shortName: 'Scrambled Egg',
    emoji: '🍳',
    category: 'dairy',
    keywords: ['scrambled egg', 'scrambled eggs', 'بيض مخفوق'],
    requires: ['egg', 'scrambled'],
    servings: EGG_SERVINGS,
  },
  {
    id: 'egg-boiled',
    group: 'egg',
    groupLabel: 'Eggs',
    displayName: 'Boiled Egg',
    shortName: 'Boiled Egg',
    emoji: '🥚',
    category: 'dairy',
    keywords: ['boiled egg', 'hard boiled egg', 'hard-boiled', 'بيض مسلوق'],
    requires: ['egg'],
    requiresAny: ['boiled', 'hard cooked', 'poached'],
    excludes: ['white', 'yolk', 'fried', 'scrambled'],
    servings: EGG_SERVINGS,
  },
  {
    id: 'egg-whole',
    group: 'egg',
    groupLabel: 'Eggs',
    displayName: 'Whole Egg',
    shortName: 'Egg',
    emoji: '🥚',
    category: 'dairy',
    keywords: ['egg', 'eggs', 'whole egg', 'whole eggs', 'بيض', 'بيضة'],
    requires: ['egg'],
    prefers: ['whole', 'raw', 'fresh', 'grade'],
    // Everything here merely *mentions* egg — an egg bagel is not an egg.
    excludes: [
      'white',
      'yolk',
      'fried',
      'scrambled',
      'boiled',
      'substitute',
      'powder',
      'nog',
      'noodle',
      'bagel',
      'roll',
      'salad',
      'bread',
      'plant',
      'free',
    ],
    servings: EGG_SERVINGS,
  },

  // ─── Chicken ─────────────────────────────────────────────
  {
    id: 'chicken-breast',
    group: 'chicken',
    groupLabel: 'Chicken',
    displayName: 'Chicken Breast',
    shortName: 'Chicken Breast',
    emoji: '🍗',
    category: 'meat',
    keywords: ['chicken breast', 'chicken breasts', 'صدر دجاج', 'صدور دجاج'],
    requires: ['chicken', 'breast'],
    excludes: ['soup', 'salad', 'sandwich', 'nugget', 'sauce'],
    servings: [
      { name: '1 breast', amount: 1, unit: 'piece', gramsPerUnit: 172, isDefault: true },
      { name: '½ breast', amount: 0.5, unit: 'piece', gramsPerUnit: 172 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'chicken-thigh',
    group: 'chicken',
    groupLabel: 'Chicken',
    displayName: 'Chicken Thigh',
    shortName: 'Chicken Thigh',
    emoji: '🍗',
    category: 'meat',
    keywords: ['chicken thigh', 'chicken thighs', 'فخذ دجاج'],
    requires: ['chicken', 'thigh'],
    servings: [
      { name: '1 thigh', amount: 1, unit: 'piece', gramsPerUnit: 110, isDefault: true },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'chicken-wing',
    group: 'chicken',
    groupLabel: 'Chicken',
    displayName: 'Chicken Wings',
    shortName: 'Chicken Wings',
    emoji: '🍗',
    category: 'meat',
    keywords: ['chicken wing', 'chicken wings', 'أجنحة دجاج'],
    requires: ['chicken', 'wing'],
    servings: [
      { name: '1 wing', amount: 1, unit: 'piece', gramsPerUnit: 34, isDefault: true },
      { name: '6 wings', amount: 6, unit: 'piece', gramsPerUnit: 34 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'chicken-generic',
    group: 'chicken',
    groupLabel: 'Chicken',
    displayName: 'Chicken',
    shortName: 'Chicken',
    emoji: '🍗',
    category: 'meat',
    keywords: ['chicken', 'دجاج', 'فراخ'],
    requires: ['chicken'],
    excludes: ['breast', 'thigh', 'wing', 'soup', 'salad', 'sandwich', 'nugget', 'shawarma'],
    servings: CHICKEN_SERVINGS,
  },

  // ─── Rice & grains ───────────────────────────────────────
  {
    id: 'rice-white',
    group: 'rice',
    groupLabel: 'Rice',
    displayName: 'White Rice',
    shortName: 'Rice',
    emoji: '🍚',
    category: 'grains',
    keywords: ['rice', 'white rice', 'أرز', 'رز'],
    requires: ['rice'],
    prefers: ['white', 'cooked'],
    excludes: ['brown', 'wild', 'cake', 'milk', 'drink', 'flour', 'noodle', 'pudding', 'vinegar'],
    servings: RICE_SERVINGS,
  },
  {
    id: 'rice-brown',
    group: 'rice',
    groupLabel: 'Rice',
    displayName: 'Brown Rice',
    shortName: 'Brown Rice',
    emoji: '🍚',
    category: 'grains',
    keywords: ['brown rice', 'أرز بني'],
    requires: ['rice', 'brown'],
    excludes: ['cake', 'flour', 'milk'],
    servings: RICE_SERVINGS,
  },
  {
    id: 'oats',
    group: 'oats',
    groupLabel: 'Oats',
    displayName: 'Oats',
    shortName: 'Oats',
    emoji: '🥣',
    category: 'grains',
    keywords: ['oats', 'oatmeal', 'rolled oats', 'porridge', 'شوفان'],
    requires: ['oat'],
    excludes: ['milk', 'drink', 'cookie', 'bar'],
    servings: [
      { name: '½ cup, dry', amount: 0.5, unit: 'cup', gramsPerUnit: 81, isDefault: true },
      { name: '1 cup, dry', amount: 1, unit: 'cup', gramsPerUnit: 81 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'bread-white',
    group: 'bread',
    groupLabel: 'Bread',
    displayName: 'White Bread',
    shortName: 'Bread',
    emoji: '🍞',
    category: 'grains',
    keywords: ['bread', 'white bread', 'toast', 'خبز', 'عيش'],
    requires: ['bread'],
    prefers: ['white'],
    excludes: ['whole', 'wheat', 'brown', 'rye', 'crumb', 'stick', 'pudding'],
    servings: SLICE_SERVINGS,
  },
  {
    id: 'bread-wholewheat',
    group: 'bread',
    groupLabel: 'Bread',
    displayName: 'Whole Wheat Bread',
    shortName: 'Brown Bread',
    emoji: '🍞',
    category: 'grains',
    keywords: ['whole wheat bread', 'brown bread', 'wholemeal', 'خبز أسمر'],
    requires: ['bread'],
    prefers: ['whole wheat', 'wholemeal', 'whole grain'],
    excludes: ['crumb', 'stick'],
    servings: SLICE_SERVINGS,
  },

  // ─── Dairy ───────────────────────────────────────────────
  {
    id: 'milk-whole',
    group: 'milk',
    groupLabel: 'Milk',
    displayName: 'Whole Milk',
    shortName: 'Milk',
    emoji: '🥛',
    category: 'dairy',
    keywords: ['milk', 'whole milk', 'حليب', 'لبن'],
    requires: ['milk'],
    prefers: ['whole', 'fluid'],
    excludes: ['skim', 'chocolate', 'soy', 'almond', 'oat', 'coconut', 'powder', 'condensed', 'shake'],
    servings: CUP_DRINK_SERVINGS,
  },
  {
    id: 'yogurt-greek',
    group: 'yogurt',
    groupLabel: 'Yogurt',
    displayName: 'Greek Yogurt',
    shortName: 'Greek Yogurt',
    emoji: '🥛',
    category: 'dairy',
    keywords: ['greek yogurt', 'greek yoghurt', 'زبادي يوناني'],
    // Providers use both spellings, and a British-spelled product must land in
    // the same family as an American-spelled one rather than forming its own.
    requires: [],
    requiresAny: ['yogurt', 'yoghurt'],
    prefers: ['greek'],
    excludes: ['drink', 'bar', 'frozen'],
    servings: [
      { name: '1 cup', amount: 1, unit: 'cup', gramsPerUnit: 245, isDefault: true },
      { name: '1 pot (170 g)', amount: 1, unit: 'serving', gramsPerUnit: 170 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },

  // ─── Fruit ───────────────────────────────────────────────
  {
    id: 'banana',
    group: 'banana',
    groupLabel: 'Banana',
    displayName: 'Banana',
    shortName: 'Banana',
    emoji: '🍌',
    category: 'fruits',
    keywords: ['banana', 'bananas', 'موز'],
    requires: ['banana'],
    excludes: ['bread', 'chip', 'pudding', 'flavor', 'shake'],
    servings: WHOLE_FRUIT_SERVINGS(118),
  },
  {
    id: 'apple',
    group: 'apple',
    groupLabel: 'Apple',
    displayName: 'Apple',
    shortName: 'Apple',
    emoji: '🍎',
    category: 'fruits',
    keywords: ['apple', 'apples', 'تفاح'],
    requires: ['apple'],
    excludes: ['juice', 'sauce', 'pie', 'cider', 'vinegar', 'pineapple', 'chip'],
    servings: WHOLE_FRUIT_SERVINGS(182),
  },
  {
    id: 'orange',
    group: 'orange',
    groupLabel: 'Orange',
    displayName: 'Orange',
    shortName: 'Orange',
    emoji: '🍊',
    category: 'fruits',
    keywords: ['orange', 'oranges', 'برتقال'],
    requires: ['orange'],
    excludes: ['juice', 'soda', 'flavor', 'peel', 'zest'],
    servings: WHOLE_FRUIT_SERVINGS(131),
  },

  // ─── Middle Eastern staples ──────────────────────────────
  {
    id: 'shawarma-chicken',
    group: 'shawarma',
    groupLabel: 'Shawarma',
    displayName: 'Chicken Shawarma',
    shortName: 'Shawarma',
    emoji: '🌯',
    category: 'restaurant',
    keywords: ['shawarma', 'chicken shawarma', 'شاورما', 'شاورما دجاج'],
    requires: ['shawarma'],
    prefers: ['chicken'],
    excludes: ['beef', 'lamb'],
    servings: [
      { name: '1 sandwich', amount: 1, unit: 'piece', gramsPerUnit: 220, isDefault: true },
      { name: '1 plate', amount: 1, unit: 'serving', gramsPerUnit: 350 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'kunafa',
    group: 'kunafa',
    groupLabel: 'Kunafa',
    displayName: 'Kunafa',
    shortName: 'Kunafa',
    emoji: '🍮',
    category: 'snacks',
    keywords: ['kunafa', 'knafeh', 'kanafeh', 'كنافة'],
    requires: ['kunafa'],
    servings: [
      { name: '1 piece', amount: 1, unit: 'piece', gramsPerUnit: 100, isDefault: true },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'falafel',
    group: 'falafel',
    groupLabel: 'Falafel',
    displayName: 'Falafel',
    shortName: 'Falafel',
    emoji: '🧆',
    category: 'recipes',
    keywords: ['falafel', 'فلافل', 'طعمية'],
    requires: ['falafel'],
    servings: [
      { name: '1 piece', amount: 1, unit: 'piece', gramsPerUnit: 17, isDefault: true },
      { name: '5 pieces', amount: 5, unit: 'piece', gramsPerUnit: 17 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
  {
    id: 'hummus',
    group: 'hummus',
    groupLabel: 'Hummus',
    displayName: 'Hummus',
    shortName: 'Hummus',
    emoji: '🫓',
    category: 'recipes',
    keywords: ['hummus', 'houmous', 'حمص'],
    requires: ['hummus'],
    servings: [
      { name: '2 tbsp', amount: 2, unit: 'tablespoon', gramsPerUnit: 15, isDefault: true },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },

  // ─── Drinks & supplements ────────────────────────────────
  {
    id: 'coffee',
    group: 'coffee',
    groupLabel: 'Coffee',
    displayName: 'Coffee',
    shortName: 'Coffee',
    emoji: '☕',
    category: 'drinks',
    keywords: ['coffee', 'black coffee', 'قهوة'],
    requires: ['coffee'],
    excludes: ['cake', 'ice cream', 'candy', 'flavor', 'creamer', 'bean'],
    servings: CUP_DRINK_SERVINGS,
  },
  {
    id: 'tea',
    group: 'tea',
    groupLabel: 'Tea',
    displayName: 'Tea',
    shortName: 'Tea',
    emoji: '🍵',
    category: 'drinks',
    keywords: ['tea', 'black tea', 'شاي'],
    requires: ['tea'],
    excludes: ['cake', 'candy', 'steak', 'bread'],
    servings: CUP_DRINK_SERVINGS,
  },
  {
    id: 'whey-protein',
    group: 'protein-powder',
    groupLabel: 'Protein',
    displayName: 'Whey Protein',
    shortName: 'Protein',
    emoji: '🥤',
    category: 'supplements',
    keywords: ['whey protein', 'protein powder', 'protein shake', 'بروتين'],
    requires: ['protein'],
    prefers: ['whey', 'powder', 'isolate'],
    excludes: ['bar', 'cookie', 'chip'],
    servings: [
      { name: '1 scoop', amount: 1, unit: 'serving', gramsPerUnit: 30, isDefault: true },
      { name: '2 scoops', amount: 2, unit: 'serving', gramsPerUnit: 30 },
      { name: '100 g', amount: 100, unit: 'g', gramsPerUnit: 1 },
    ],
  },
];

/** Pre-normalised match terms, built once at module load. */
interface CompiledRule extends CanonicalFood {
  requiresNormalized: string[];
  requiresAnyNormalized: string[];
  prefersNormalized: string[];
  excludesNormalized: string[];
}

const COMPILED: CompiledRule[] = CANONICAL_FOODS.map((food) => ({
  ...food,
  requiresNormalized: food.requires.map(normalize),
  requiresAnyNormalized: (food.requiresAny ?? []).map(normalize),
  prefersNormalized: (food.prefers ?? []).map(normalize),
  excludesNormalized: [...(food.excludes ?? []), ...(GROUP_EXCLUDES[food.group] ?? [])].map(
    normalize,
  ),
}));

/**
 * Best canonical rule for a raw food name, or null when none applies.
 *
 * A rule qualifies only if every `requires` term is present and no `excludes`
 * term is — that exclusion list is what keeps "Egg noodles" and "Bagels, egg"
 * from being relabelled "Whole Egg". Among qualifying rules the most specific
 * wins: more required terms first, then more `prefers` hits, so
 * "chicken breast" beats the bare "chicken" rule on a name containing both.
 */
export const matchCanonical = (rawName: string): CanonicalFood | null => {
  const name = normalize(rawName);
  if (!name) return null;

  let best: { rule: CompiledRule; specificity: number; preferred: number } | null = null;

  for (const rule of COMPILED) {
    if (!rule.requiresNormalized.every((term) => name.includes(term))) continue;
    if (
      rule.requiresAnyNormalized.length > 0 &&
      !rule.requiresAnyNormalized.some((term) => name.includes(term))
    ) {
      continue;
    }
    if (rule.excludesNormalized.some((term) => name.includes(term))) continue;

    const preferred = rule.prefersNormalized.filter((term) => name.includes(term)).length;
    // A `requiresAny` group is as much a constraint as a required term, so it
    // counts toward specificity — "boiled egg" must outrank the bare egg rule.
    const specificity =
      rule.requiresNormalized.length + (rule.requiresAnyNormalized.length > 0 ? 1 : 0);

    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && preferred > best.preferred)
    ) {
      best = { rule, specificity, preferred };
    }
  }

  return best?.rule ?? null;
};

/** Display label for a group key, e.g. `egg` -> "Eggs". */
export const groupLabelFor = (groupKey: string): string | null =>
  CANONICAL_FOODS.find((food) => food.group === groupKey)?.groupLabel ?? null;
