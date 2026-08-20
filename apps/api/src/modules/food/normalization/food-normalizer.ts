import { FoodCategory, ServingUnit } from '../types';
import { normalize } from '../search/normalize';
import { CanonicalServing, matchCanonical } from './canonical-foods';
import { emojiFor } from './emoji';
import { gramsPerUnit, tidyServingLabel } from '../search/servings';

/**
 * Turning provider names into names people recognise.
 *
 * USDA writes for a database, not a reader: "Eggs, Grade A, Large, egg whole"
 * is precise and unreadable. Two passes fix it — a curated rule table for the
 * foods people actually log, and the heuristic below for everything else, which
 * is most of a million-row catalogue and can never be curated by hand.
 *
 * The heuristic is deliberately conservative. Mangling a name into something
 * *wrong* is far worse than leaving it merely long, so every transformation here
 * either drops a segment known to be noise or reorders segments that are already
 * present. It never invents a word.
 */

export interface NormalizedFood {
  displayName: string;
  shortName: string;
  keywords: string[];
  emoji: string;
  groupKey: string;
  /** Suggested portions, when the normaliser knows better than a flat 100 g. */
  servings: CanonicalServing[];
  /** True when a curated rule matched, rather than the heuristic fallback. */
  curated: boolean;
}

/**
 * Comma segments that carry no meaning for a reader.
 *
 * These are USDA's cataloguing apparatus — grades, cuts of the supply chain,
 * survey codes. A person searching for chicken does not need "broilers or
 * fryers" and has never heard of "NFS" (Not Further Specified).
 */
const NOISE_SEGMENTS = [
  'nfs',
  'ns as to form',
  'ns as to type',
  'all types',
  'all classes',
  'broilers or fryers',
  'broiler or fryer',
  'composite of cuts',
  'meat only',
  'meat and skin',
  'flesh only',
  'without added',
  'includes usda commodity',
  'commodity',
  'unprepared',
  'unheated',
  'year round average',
  'grade a',
  'grade aa',
  'usda',
  'upc',
  'gtin',
  'brand',
  'store',
  'restaurant',
  'infant',
  'baby food',
];

/** Whole-segment noise: size and packaging words that mean nothing alone. */
const NOISE_WORDS = new Set([
  'large',
  'small',
  'medium',
  'extra large',
  'jumbo',
  'regular',
  'assorted',
  'value',
  'family',
  'pack',
  'size',
  'bulk',
  'each',
  'approx',
]);

/**
 * Qualifiers that read naturally *before* the food. "Raw" + "chicken" is
 * "Raw Chicken"; putting it after would give "Chicken, Raw".
 */
const LEADING_QUALIFIERS = new Set([
  'raw',
  'cooked',
  'roasted',
  'grilled',
  'fried',
  'boiled',
  'baked',
  'steamed',
  'smoked',
  'dried',
  'fresh',
  'frozen',
  'canned',
  'whole',
  'ground',
  'chopped',
  'sliced',
  'shredded',
  'plain',
  'sweetened',
  'unsweetened',
  'salted',
  'unsalted',
  'low fat',
  'nonfat',
  'fat free',
  'skim',
  'lean',
  'light',
  'dark',
  'white',
  'brown',
  'red',
  'green',
  'sweet',
  'hot',
  'mild',
  'organic',
]);

/** Leading qualifiers describing preparation, which lead the rest. */
const PREPARATION = new Set([
  'raw',
  'cooked',
  'roasted',
  'grilled',
  'fried',
  'boiled',
  'baked',
  'steamed',
  'smoked',
  'dried',
  'fresh',
  'frozen',
  'canned',
]);

/**
 * Parts and cuts, which read naturally *after* the food: "Egg" + "white" is
 * "Egg White", not "White Egg".
 *
 * `white` appears here and in `LEADING_QUALIFIERS`; the part reading wins,
 * because "egg white" and "chicken breast" are the shapes that actually occur.
 */
const TRAILING_PARTS = new Set([
  'breast',
  'thigh',
  'wing',
  'leg',
  'drumstick',
  'yolk',
  'white',
  'fillet',
  'loin',
  'rib',
  'shoulder',
  'flank',
  'sirloin',
  'tenderloin',
  'juice',
  'oil',
  'powder',
  'flour',
]);

/** Irregular plurals worth handling; the rest fall to the -s/-es rule. */
const IRREGULAR_SINGULARS: Record<string, string> = {
  leaves: 'leaf',
  loaves: 'loaf',
  potatoes: 'potato',
  tomatoes: 'tomato',
  berries: 'berry',
  cherries: 'cherry',
  anchovies: 'anchovy',
};

const singularize = (word: string): string => {
  const lower = word.toLowerCase();
  if (IRREGULAR_SINGULARS[lower]) return IRREGULAR_SINGULARS[lower];

  // Words that merely end in "s" are not plurals.
  if (/(ss|us|is|as)$/.test(lower)) return word;
  if (lower.endsWith('ies') && lower.length > 4) return `${word.slice(0, -3)}y`;
  if (lower.endsWith('es') && /(ch|sh|x|z)es$/.test(lower)) return word.slice(0, -2);
  if (lower.endsWith('s') && lower.length > 3) return word.slice(0, -1);
  return word;
};

const titleCase = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      // Preserve deliberate capitalisation like "USDA" or a brand's "iOgo".
      if (word.length > 1 && word !== word.toLowerCase() && word !== word.toUpperCase()) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

/** Strip barcodes, parenthetical asides and trailing punctuation. */
const stripCruft = (raw: string): string =>
  raw
    .replace(/\b(upc|gtin|sku)\s*:?\s*\d+/gi, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;:\-–—]+$/, '')
    .trim();

const isNoiseSegment = (segment: string): boolean => {
  const normalized = normalize(segment);
  if (!normalized) return true;
  if (NOISE_WORDS.has(normalized)) return true;
  if (NOISE_SEGMENTS.some((noise) => normalized === noise || normalized.startsWith(`${noise} `))) {
    return true;
  }
  // Pure numbers and measurement fragments ("16 oz") carry nothing.
  return /^[\d\s.%]+$/.test(normalized) || /^\d+\s*(oz|g|kg|ml|l|lb|ct|pk)$/.test(normalized);
};

/**
 * Rebuild a readable name from a comma-delimited provider description.
 *
 * "Eggs, Grade A, Large, egg whole" ->
 *   head "Eggs"; drop "Grade A" and "Large" as noise; "egg whole" repeats the
 *   head so only "whole" survives, and it is a leading qualifier ->
 *   "Whole Egg".
 */
const heuristicName = (rawName: string): { displayName: string; shortName: string } => {
  const cleaned = stripCruft(rawName);
  const segments = cleaned.split(',').map((segment) => segment.trim()).filter(Boolean);

  if (segments.length === 0) return { displayName: titleCase(cleaned), shortName: titleCase(cleaned) };

  const [rawHead, ...rest] = segments;
  const headWords = normalize(rawHead).split(' ').filter(Boolean);

  const leading: string[] = [];
  const trailing: string[] = [];

  for (const segment of rest) {
    if (isNoiseSegment(segment)) continue;

    // Drop any repeat of the head ("Eggs, … , egg whole"), keeping what is new.
    const words = normalize(segment)
      .split(' ')
      .filter(Boolean)
      .filter((word) => !headWords.includes(word) && !headWords.includes(singularize(word)));

    if (words.length === 0) continue;

    const phrase = words.join(' ');
    if (TRAILING_PARTS.has(phrase)) {
      trailing.push(phrase);
    } else if (LEADING_QUALIFIERS.has(phrase)) {
      leading.push(phrase);
    } else if (words.length === 1 && phrase.length <= 12) {
      // A short unknown single word is usually a variety worth keeping.
      leading.push(phrase);
    }
    // Longer unknown phrases are dropped: they are the descriptions that make
    // provider names unreadable, and none of them help a person choose.
  }

  // A head with qualifiers reads better singular: "Whole Egg", not "Whole Eggs".
  const head =
    leading.length > 0 || trailing.length > 0
      ? headWords.map(singularize).join(' ')
      : headWords.join(' ');

  // How the food was prepared comes before how it was cut: people say "Raw
  // Ground Beef", never "Ground Raw Beef".
  const ordered = [...leading].sort(
    (a, b) => Number(PREPARATION.has(b)) - Number(PREPARATION.has(a)),
  );

  // Cap the qualifiers — three descriptors is already a mouthful.
  const displayWords = [...ordered.slice(0, 2), head, ...trailing.slice(0, 2)];
  // Segments overlap in real provider names ("Noosa, Yoghurt, Lemon Yoghurt"),
  // and a repeated word reads as a bug even when the rest is right.
  const displayName = titleCase(dedupeWords(displayWords.join(' '))) || titleCase(cleaned);

  // The short form keeps the food and its part, dropping preparation detail.
  const shortName =
    titleCase(dedupeWords([head, ...trailing.slice(0, 1)].join(' '))) || displayName;

  return { displayName, shortName };
};

/** Drop repeated words, keeping the first occurrence and the original order. */
const dedupeWords = (value: string): string => {
  const seen = new Set<string>();
  return value
    .split(' ')
    .filter((word) => {
      const key = word.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
};

/**
 * A preparation word present in the raw name but missing from the canonical
 * label, or null when the label already says how the food was prepared.
 *
 * Only preparation qualifies. Size and grade words ("large", "grade a") were
 * dropped as noise for good reason, and re-admitting them here would put the
 * database wording straight back into the name this layer exists to clean up.
 */
const preparationQualifier = (rawName: string, canonicalName: string): string | null => {
  const canonicalWords = normalize(canonicalName).split(' ');

  // If the label already says how it was prepared, leave it be. Checking for
  // *any* preparation word rather than the specific one avoids "Cooked Fried
  // Egg" — provider names routinely carry both the general and the specific
  // term ("Egg, whole, cooked, fried").
  if (canonicalWords.some((word) => PREPARATION.has(word))) return null;

  return normalize(rawName)
    .split(' ')
    .find((word) => PREPARATION.has(word)) ?? null;
};

/** Cap a label, breaking on a word boundary rather than mid-word. */
const truncate = (value: string, max: number): string => {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
};

/**
 * Portions for a food no curated rule covers.
 *
 * Always offers grams, plus the one counted unit that suits the category — a
 * cup for rice, a piece for fruit. A provider-stated serving weight is used
 * when present, since that is measured data rather than an estimate.
 */
const heuristicServings = (
  category: FoodCategory,
  providerServingGrams?: number | null,
  providerServingLabel?: string | null,
): CanonicalServing[] => {
  const servings: CanonicalServing[] = [];

  if (providerServingGrams && providerServingGrams > 0) {
    servings.push({
      name: tidyServingLabel(providerServingLabel, providerServingGrams),
      amount: 1,
      unit: 'serving',
      gramsPerUnit: providerServingGrams,
      isDefault: true,
    });
  }

  const NATURAL_UNIT: Partial<Record<FoodCategory, ServingUnit>> = {
    fruits: 'piece',
    vegetables: 'piece',
    meat: 'piece',
    seafood: 'piece',
    dairy: 'cup',
    grains: 'cup',
    drinks: 'cup',
    snacks: 'piece',
    supplements: 'serving',
    recipes: 'serving',
    restaurant: 'serving',
  };

  const unit = NATURAL_UNIT[category];
  if (unit) {
    const perUnit = gramsPerUnit(unit, category);
    servings.push({
      name: `1 ${unit}`,
      amount: 1,
      unit,
      gramsPerUnit: perUnit,
      isDefault: servings.length === 0,
    });
  }

  servings.push({
    name: '100 g',
    amount: 100,
    unit: 'g',
    gramsPerUnit: 1,
    isDefault: servings.length === 0,
  });

  return servings;
};

/**
 * Derive every user-facing field for a food.
 *
 * A curated rule wins outright when one matches — it carries a hand-written
 * name, group and portions. Otherwise the heuristic produces the best readable
 * name it can and the food groups under its own short name, so it still
 * collapses with genuine duplicates from the other provider.
 */
export const normalizeFood = (input: {
  name: string;
  brand?: string | null;
  category: FoodCategory;
  servingGrams?: number | null;
  servingLabel?: string | null;
}): NormalizedFood => {
  const canonical = matchCanonical(input.name);

  if (canonical) {
    // A branded product keeps its own name. The canonical rule correctly
    // identifies *what kind of food* it is — so its group, icon and portions all
    // apply — but "CHOBANI, Greek Yogurt, Strawberry" is not simply "Greek
    // Yogurt": collapsing it would render every flavour identically and hide
    // which one carries the macros on screen.
    const branded = !!input.brand?.trim();
    const heuristic = branded ? heuristicName(input.name) : null;

    // How a food was prepared changes its macros, so it has to stay in the name.
    // Without this, "Grilled chicken breast" (195 kcal) and "Chicken breast,
    // raw" (165 kcal) both render as "Chicken Breast" — two different foods,
    // one label, and no way for a user to tell which they picked.
    const prep = branded ? null : preparationQualifier(input.name, canonical.displayName);

    const displayName =
      heuristic?.displayName ??
      (prep ? `${titleCase(prep)} ${canonical.displayName}` : canonical.displayName);

    return {
      // Capped like the heuristic path below. Provider names are unbounded, and
      // an uncapped short name overflows `short_name varchar(80)` — which fails
      // the whole multi-row ingest INSERT, discarding every other food in the
      // page and leaving the term permanently unsearchable.
      displayName: truncate(displayName, 60),
      shortName: truncate(heuristic?.shortName ?? canonical.shortName, 28),
      // The raw name stays searchable: someone who knows the USDA wording, or
      // who pasted it, must still find the food.
      keywords: dedupeKeywords([...canonical.keywords, input.name, input.brand ?? '']),
      emoji: canonical.emoji,
      groupKey: canonical.group,
      servings:
        canonical.servings ??
        heuristicServings(input.category, input.servingGrams, input.servingLabel),
      curated: true,
    };
  }

  const { displayName, shortName } = heuristicName(input.name);
  const cappedDisplay = truncate(displayName, 60) || input.name.slice(0, 60);
  const cappedShort = truncate(shortName, 28) || cappedDisplay;

  return {
    displayName: cappedDisplay,
    shortName: cappedShort,
    keywords: dedupeKeywords([cappedDisplay, cappedShort, input.name, input.brand ?? '']),
    emoji: emojiFor(normalize(`${input.name} ${input.brand ?? ''}`), input.category),
    // Grouping on the short name is what collapses the same food arriving from
    // both providers under slightly different wording.
    groupKey: normalize(cappedShort).slice(0, 80) || 'other',
    servings: heuristicServings(input.category, input.servingGrams, input.servingLabel),
    curated: false,
  };
};

/** Normalised, de-duplicated, non-empty keywords. */
const dedupeKeywords = (values: string[]): string[] => {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    keywords.push(normalized);
  }

  // Bounded: keywords are joined into an indexed column, and a runaway list
  // would bloat both the row and the trigram index for no gain.
  return keywords.slice(0, 12);
};

/** The space-joined form stored in `search_keywords` for trigram matching. */
export const keywordsToSearchBlob = (keywords: string[]): string =>
  keywords.join(' ').slice(0, 512);
