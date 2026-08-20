import { ServingUnit, ServingOption, FoodCategory } from '../types';

/**
 * Portion maths.
 *
 * Two kinds of unit exist and they are not interchangeable:
 *
 * - *Measured* units (g, kg, ml, l) have a fixed conversion. Grams are exact;
 *   millilitres assume a density of 1 g/ml, which is right for water and close
 *   enough for milk, juice and most drinks.
 * - *Counted* units (cup, piece, slice, tbsp, tsp, serving) have no universal
 *   weight — a cup of rice and a cup of spinach differ by a factor of four — so
 *   they are only meaningful against a per-food `gramsPerUnit`.
 */

/**
 * Mass units. These are conversions by definition — a kilogram is a thousand
 * grams of anything — so nothing may override them.
 */
const MASS_GRAMS_PER_UNIT: Partial<Record<ServingUnit, number>> = {
  g: 1,
  kg: 1000,
};

/**
 * Volume units, assuming the density of water.
 *
 * Only a default. Density is a property of the food, not of the unit: olive oil
 * is ~0.92 g/ml and honey ~1.42, so treating a millilitre as a gram understates
 * oil by 8% and overstates honey by 42%. A per-food conversion recorded in
 * `food_servings` is measured data and takes precedence — see `gramsPerUnit`.
 */
const VOLUME_GRAMS_PER_UNIT: Partial<Record<ServingUnit, number>> = {
  ml: 1,
  l: 1000,
};

/** Units that measure a quantity directly, rather than counting portions. */
export const isMeasuredUnit = (unit: ServingUnit): boolean =>
  unit in MASS_GRAMS_PER_UNIT || unit in VOLUME_GRAMS_PER_UNIT;

/**
 * Fallbacks for counted units when a food has no recorded conversion — a
 * reasonable weight is far more useful than refusing to compute one. Ingested
 * provider records routinely arrive without serving data, and this is what lets
 * them still offer "1 cup" instead of grams alone.
 */
const FALLBACK_GRAMS_PER_UNIT: Record<ServingUnit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  cup: 240,
  piece: 100,
  slice: 30,
  tablespoon: 15,
  teaspoon: 5,
  serving: 100,
};

/** Category-specific refinements — a slice of bread isn't a slice of cheese. */
const CATEGORY_OVERRIDES: Partial<Record<FoodCategory, Partial<Record<ServingUnit, number>>>> = {
  fruits: { piece: 150, cup: 150, slice: 40 },
  vegetables: { piece: 120, cup: 100, slice: 20 },
  meat: { piece: 120, slice: 30, cup: 140 },
  seafood: { piece: 100, slice: 30, cup: 145 },
  dairy: { cup: 245, slice: 20, piece: 25 },
  grains: { cup: 160, slice: 30, piece: 60 },
  snacks: { piece: 30, cup: 50, slice: 25 },
  drinks: { cup: 240, piece: 330, serving: 240 },
  supplements: { serving: 30, piece: 30, tablespoon: 10, teaspoon: 3 },
  recipes: { piece: 200, cup: 220, serving: 250 },
  restaurant: { piece: 220, serving: 300, cup: 240 },
};

/**
 * Grams in one unit of a food. `recorded` is the per-food conversion from
 * `food_servings` and always wins when present; the category tables only fill
 * the gap for foods no one has measured yet.
 */
export const gramsPerUnit = (
  unit: ServingUnit,
  category: FoodCategory,
  recorded?: number | null,
): number => {
  // Mass is definitional; no recorded value may contradict it.
  const mass = MASS_GRAMS_PER_UNIT[unit];
  if (mass !== undefined) return mass;

  const usable = recorded && Number.isFinite(recorded) && recorded > 0 ? recorded : null;

  // Volume needs a density, and a density recorded for this food beats the
  // water assumption. Previously the assumption always won, so a food that had
  // been measured at its real density was silently computed at 1 g/ml — the
  // measurement was stored and then ignored.
  const volume = VOLUME_GRAMS_PER_UNIT[unit];
  if (volume !== undefined) return usable ?? volume;

  // Counted units have no universal weight at all.
  return usable ?? CATEGORY_OVERRIDES[category]?.[unit] ?? FALLBACK_GRAMS_PER_UNIT[unit];
};

/** Total grams for `amount` × `unit`. */
export const toGrams = (
  amount: number,
  unit: ServingUnit,
  category: FoodCategory,
  recorded?: number | null,
): number => {
  const grams = amount * gramsPerUnit(unit, category, recorded);
  return Math.round(grams * 100) / 100;
};

/** Unit abbreviations providers shout or misspell, and how they should read. */
const UNIT_SPELLINGS: [RegExp, string][] = [
  [/\bonz\b/gi, 'oz'],
  [/\bozs?\b/gi, 'oz'],
  [/\bgrm?s?\b/gi, 'g'],
  [/\bgrams?\b/gi, 'g'],
  [/\bmls?\b/gi, 'ml'],
  [/\btbsp?\b/gi, 'tbsp'],
  [/\btsp\b/gi, 'tsp'],
];

/**
 * Make a provider's serving label presentable, or replace it outright.
 *
 * Open Food Facts serving strings are free text entered by contributors:
 * "8 ONZ", "1 CONTAINER |", "100grm", "". This repairs the wording and nothing
 * else.
 *
 * It deliberately does *not* append the gram weight. The picker already shows
 * that separately, so "1 cup (160 g)" would only be redundant — and because the
 * backfill re-tidies stored names, appending would rewrite hand-curated portions
 * ("1 cup" -> "1 cup (160 g)") and make a food read differently depending on
 * whether a backfill had run. Repairing junk is idempotent; embellishing is not.
 */
export const tidyServingLabel = (label: string | null | undefined, grams: number): string => {
  // Nothing usable to repair, so state the one thing that is always known.
  const fallback = `1 serving (${Math.round(grams)} g)`;
  const trimmed = label?.trim();
  if (!trimmed) return fallback;

  // Separate a unit written hard against its number ("100grm"), so the
  // word-boundary rules below can see it at all.
  let result = trimmed.replace(/(\d)([a-z])/gi, '$1 $2');

  for (const [pattern, replacement] of UNIT_SPELLINGS) {
    result = result.replace(pattern, replacement);
  }

  // De-shout, but leave deliberate mixed case alone.
  if (result === result.toUpperCase()) result = result.toLowerCase();

  result = result
    .replace(/\s+/g, ' ')
    // Contributor entries trail separators from half-finished edits ("1 CONTAINER |").
    .replace(/[\s|,;:\-–—]+$/, '')
    .trim();

  if (!result) return fallback;

  return result.length > 60 ? fallback : result;
};

/**
 * The portion list shown in the serving picker.
 *
 * Named portions recorded for the food come first, then the generic units, so a
 * user always sees "1 breast" before "1 cup" — but never loses the ability to
 * just type grams. Units already covered by a named portion are not repeated.
 */
export const buildServingOptions = (
  category: FoodCategory,
  recorded: {
    id: string;
    servingName: string;
    amount: number;
    unit: ServingUnit;
    gramsPerUnit: number;
    isDefault: boolean;
  }[],
  /** Serving weight the provider stated, when the food has no recorded portions. */
  providerServingGrams?: number | null,
  providerServingLabel?: string | null,
): ServingOption[] => {
  const options: ServingOption[] = recorded.map((serving) => ({
    id: serving.id,
    name: serving.servingName,
    amount: serving.amount,
    unit: serving.unit,
    gramsPerUnit: serving.gramsPerUnit,
    grams: toGrams(serving.amount, serving.unit, category, serving.gramsPerUnit),
    isDefault: serving.isDefault,
  }));

  // A provider-stated serving is real measured data — surface it as a portion.
  if (providerServingGrams && providerServingGrams > 0) {
    options.push({
      id: 'provider-serving',
      name: tidyServingLabel(providerServingLabel, providerServingGrams),
      amount: 1,
      unit: 'serving',
      gramsPerUnit: providerServingGrams,
      grams: Math.round(providerServingGrams * 100) / 100,
      isDefault: options.length === 0,
    });
  }

  const coveredUnits = new Set(options.map((option) => option.unit));

  const GENERIC_UNITS: ServingUnit[] = ['g', 'cup', 'piece', 'slice', 'tablespoon', 'teaspoon'];
  for (const unit of GENERIC_UNITS) {
    if (coveredUnits.has(unit)) continue;

    const perUnit = gramsPerUnit(unit, category);
    options.push({
      id: `unit:${unit}`,
      name: unit === 'g' ? '100 g' : `1 ${unit}`,
      amount: unit === 'g' ? 100 : 1,
      unit,
      gramsPerUnit: perUnit,
      grams: unit === 'g' ? 100 : perUnit,
      isDefault: false,
    });
  }

  // Exactly one default: the food's own, else the first option.
  if (options.length > 0 && !options.some((option) => option.isDefault)) {
    options[0] = { ...options[0], isDefault: true };
  }

  return options;
};

/** Grams of the portion a food opens on. */
export const defaultGramsFor = (options: ServingOption[]): number =>
  options.find((option) => option.isDefault)?.grams ?? 100;
