import { normalize, tokenize } from '../food/search/normalize';
import { DraftItem } from './types';

/**
 * Draft manipulation — the part of conversational editing that has nothing to do
 * with either the model or the database.
 *
 * "Remove the toast" arrives as the string "the toast", which has to find the
 * right entry among items named "Toast, white, toasted" or "Wholemeal bread".
 * The matching is deliberately layered from strictest to loosest so that an
 * exact reference never loses to a fuzzy one, and pure so the awkward cases can
 * be pinned down in tests.
 */

/** Words that carry no identifying information in a reference to an item. */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'my',
  'that',
  'this',
  'those',
  'these',
  'it',
  'one',
  'some',
  'of',
  'and',
]);

const meaningfulTokens = (text: string): string[] =>
  tokenize(text).filter((token) => !STOP_WORDS.has(token));

/**
 * The draft item a phrase refers to, or `null` when nothing matches well enough.
 *
 * Returning null rather than a best guess matters: silently removing the wrong
 * food is worse than telling the user we did not follow.
 */
export const matchItem = (items: DraftItem[], target: string): DraftItem | null => {
  if (items.length === 0) return null;

  const normalizedTarget = normalize(target);
  if (!normalizedTarget) return null;

  const targetTokens = meaningfulTokens(target);
  if (targetTokens.length === 0) return null;

  const scored = items
    .map((item) => ({ item, score: scoreMatch(item, normalizedTarget, targetTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  // An ambiguous reference — "the chicken" with two chicken dishes in the draft
  // scoring identically — is not a match. Better to ask than to guess.
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;

  return scored[0].item;
};

/** How well a phrase identifies an item. Higher is a better match. */
const scoreMatch = (item: DraftItem, normalizedTarget: string, targetTokens: string[]): number => {
  const names = [normalize(item.name), normalize(item.spokenName)].filter(Boolean);

  // 1. The phrase is exactly one of the item's names.
  if (names.includes(normalizedTarget)) return 100;

  // 2. One name contains the other outright — "toast" in "toast, white".
  for (const name of names) {
    if (name.startsWith(`${normalizedTarget} `) || name.endsWith(` ${normalizedTarget}`)) return 80;
    if (name.includes(` ${normalizedTarget} `)) return 75;
    if (normalizedTarget.includes(name)) return 70;
  }

  // 3. Shared words. Scaled by how much of the phrase is accounted for, so
  //    "chicken breast" prefers "Chicken breast" over plain "Chicken".
  const nameTokens = new Set(names.flatMap((name) => meaningfulTokens(name)));
  const overlap = targetTokens.filter((token) => nameTokens.has(token)).length;
  if (overlap === 0) return 0;

  return (overlap / targetTokens.length) * 50 + overlap;
};

/** Remove an item by identity. */
export const removeItem = (items: DraftItem[], target: DraftItem): DraftItem[] =>
  items.filter((item) => item !== target);

/** Replace an item in place, preserving its position in the meal. */
export const replaceItem = (
  items: DraftItem[],
  target: DraftItem,
  replacement: DraftItem,
): DraftItem[] => items.map((item) => (item === target ? replacement : item));

/**
 * Merge a newly resolved item into the draft.
 *
 * Saying "add another egg" when eggs are already there should read as three
 * eggs, not as two separate egg entries — so an identical food is accumulated
 * rather than appended. Different units are left as separate entries, since
 * "100 g of rice" and "1 cup of rice" cannot be added without a conversion the
 * user did not ask for.
 */
export const addItem = (items: DraftItem[], incoming: DraftItem): DraftItem[] => {
  const existingIndex = items.findIndex(
    (item) =>
      item.foodId !== null &&
      item.foodId === incoming.foodId &&
      item.unit === incoming.unit,
  );

  if (existingIndex === -1) return [...items, incoming];

  const existing = items[existingIndex];
  const quantity = existing.quantity + incoming.quantity;
  const grams = existing.grams + incoming.grams;

  const merged: DraftItem = {
    ...existing,
    quantity,
    grams,
    servingLabel: incoming.servingLabel.replace(
      /^[\d.]+/,
      Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1),
    ),
    nutrients: {
      calories: Math.round(existing.nutrients.calories + incoming.nutrients.calories),
      protein: round1(existing.nutrients.protein + incoming.nutrients.protein),
      carbs: round1(existing.nutrients.carbs + incoming.nutrients.carbs),
      fat: round1(existing.nutrients.fat + incoming.nutrients.fat),
      fiber: round1(existing.nutrients.fiber + incoming.nutrients.fiber),
      sugar: round1(existing.nutrients.sugar + incoming.nutrients.sugar),
      sodium: round1(existing.nutrients.sodium + incoming.nutrients.sodium),
    },
  };

  return items.map((item, index) => (index === existingIndex ? merged : item));
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Items the user should be asked about before the meal is saved. */
export const needsConfirmation = (items: DraftItem[], threshold: number): DraftItem[] =>
  items.filter((item) => item.foodId === null || item.confidence < threshold);
