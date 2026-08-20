import { FoodResult, FoodGroup } from '../types';
import { groupLabelFor } from './canonical-foods';

/**
 * Collapsing a result page into families.
 *
 * A search for "egg" legitimately matches a dozen rows — whole, white, yolk,
 * fried, boiled, each from two providers. Flat, that reads as noise and buries
 * whatever the user wanted. Grouped, it reads as one answer ("Eggs") with the
 * variants underneath, which is the shape every fitness app uses and the one
 * people can actually scan.
 */

/** Below this a "group" is just a row with a header, which helps nobody. */
const MIN_GROUP_SIZE = 2;

const titleCase = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Split a ranked result list into groups plus the ungrouped remainder.
 *
 * Input order is the ranking and is preserved throughout: groups appear in the
 * order of their best member, and members keep their relative order. Grouping
 * only ever *rearranges* what ranking chose — it never promotes a weak result by
 * attaching it to a strong family.
 */
export const groupResults = (
  results: FoodResult[],
): { groups: FoodGroup[]; ungrouped: FoodResult[] } => {
  const byKey = new Map<string, FoodResult[]>();

  for (const result of results) {
    // A food with no group key has not been normalised; it can only stand alone.
    const key = result.groupKey;
    if (!key) continue;

    const bucket = byKey.get(key) ?? [];
    bucket.push(result);
    byKey.set(key, bucket);
  }

  const groups: FoodGroup[] = [];
  const groupedIds = new Set<string>();

  // Map preserves insertion order, which is the ranking order of each group's
  // first (best) member — so no explicit sort is needed.
  for (const [key, items] of byKey) {
    if (items.length < MIN_GROUP_SIZE) continue;

    // Every member is claimed, not just the ones a client might show first.
    // Truncating here used to leave members 7+ outside `groupedIds`, so they
    // fell through into `ungrouped` and were rendered a second time below their
    // own group — looking like duplicates. How many to reveal at once is a
    // presentation decision, and it belongs to whoever is drawing the list.
    for (const item of items) groupedIds.add(item.id);

    groups.push({
      key,
      // A curated label ("Eggs") when the group is one we know; otherwise the
      // shortest member name, which is the family's most general wording.
      label: groupLabelFor(key) ?? titleCase(shortestName(items)),
      emoji: items[0].emoji,
      count: items.length,
      items,
    });
  }

  return {
    groups,
    ungrouped: results.filter((result) => !groupedIds.has(result.id)),
  };
};

/**
 * The most general name in a family. "Chicken" is shorter than "Chicken Breast"
 * and is the better header for a group containing both.
 */
const shortestName = (items: FoodResult[]): string =>
  items.reduce((shortest, item) => {
    const candidate = item.shortName || item.displayName;
    return candidate.length < shortest.length ? candidate : shortest;
  }, items[0].shortName || items[0].displayName);
