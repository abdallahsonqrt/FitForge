import { normalize, tokenize } from './normalize';

/**
 * Relevance scoring, applied on top of whatever Postgres returns.
 *
 * The database narrows millions of rows to a few hundred candidates cheaply
 * (trigram + prefix + full-text). It cannot express *which* of those a person
 * actually meant — trigram similarity alone ranks "Egg noodles" above "Egg,
 * whole, raw" for the query "egg", because it compares whole strings and the
 * shorter one wins on length ratio. That judgement happens here.
 */

export interface Scorable {
  /** Normalised name the match was found on. */
  searchName: string;
  kind: 'generic' | 'branded';
  popularity: number;
  verified: boolean;
  /** Trigram similarity from Postgres, 0–1. */
  similarity: number;
  /** The reader-facing name, when the food has been normalised. */
  displayName?: string | null;
  /** The compact label, e.g. "Egg" for a food stored as "Egg, whole, raw". */
  shortName?: string | null;
  /** True when a curated rule named this food, rather than the heuristic. */
  curated?: boolean;
}

/** What this user has eaten before, for the history signal. */
export interface UserAffinity {
  /** Times this user has logged the food. */
  usageCount: number;
  /** Days since they last logged it, or null if never. */
  daysSinceUsed: number | null;
  isFavorite: boolean;
}

/**
 * Weights are ordered by how strongly each signal predicts intent. Exactness
 * dominates because a user typing a food's full name almost always wants that
 * food; the rest only separate otherwise-equivalent candidates.
 *
 * `history` sits deliberately below the match signals but above global
 * popularity: what *you* eat predicts what you are searching for far better than
 * what everyone eats, yet neither should override actually typing a food's name.
 */
const WEIGHTS = {
  exact: 1.0,
  prefix: 0.75,
  wordPrefix: 0.55,
  allTokens: 0.45,
  similarity: 0.35,
  history: 0.3,
  favorite: 0.1,
  generic: 0.12,
  verified: 0.06,
  popularity: 0.1,
  simplicity: 0.12,
};

/**
 * The highest score actually reachable, and therefore the divisor that makes the
 * result a true 0–1.
 *
 * `exact`, `prefix` and `wordPrefix` are mutually exclusive — a candidate earns
 * exactly one of them — so summing all three into the divisor made a perfect
 * match top out at 0.667 while being documented as 0–1, and left the tuned
 * thresholds sitting at odd fractions of the real range.
 */
const MAX_SCORE =
  Object.entries(WEIGHTS)
    .filter(([name]) => name !== 'prefix' && name !== 'wordPrefix')
    .reduce((sum, [, weight]) => sum + weight, 0);

/** Half-life of the recency term, in days. */
const RECENCY_HALF_LIFE_DAYS = 21;

/**
 * How strongly a user's own history points at this food, 0–1.
 *
 * Frequency and recency multiply rather than add: a food eaten fifty times last
 * year is not what you are looking for today, and neither is one eaten once this
 * morning. Something has to be both habitual and current to win on history
 * alone.
 */
const historyScore = (affinity: UserAffinity | undefined): number => {
  if (!affinity || affinity.usageCount <= 0) return 0;

  // Diminishing returns: the 20th log says little more than the 10th.
  const frequency = affinity.usageCount / (affinity.usageCount + 8);

  const recency =
    affinity.daysSinceUsed === null
      ? 0.5
      : Math.pow(0.5, affinity.daysSinceUsed / RECENCY_HALF_LIFE_DAYS);

  return frequency * recency;
};

/**
 * How simple a name is to read, 0–1.
 *
 * "Whole Egg" should beat "Eggs, Grade A, Large, egg whole" even when both refer
 * to the same food, because the simpler name is the one a person recognises.
 * Measured on the display name when normalisation has produced one — that is the
 * string the user actually reads.
 */
const simplicityScore = (candidate: Scorable): number => {
  const label = candidate.displayName?.trim() || candidate.searchName;
  const words = label.split(/\s+/).filter(Boolean).length;
  const commas = (label.match(/,/g) ?? []).length;

  // Four words is the comfortable ceiling for a scannable label.
  const brevity = 1 / (1 + Math.max(0, words - 4) / 3);
  // Commas are the signature of a database name leaking through.
  const cleanliness = 1 / (1 + commas);

  // A curated name was written by a person for a person; trust it.
  const curatedBonus = candidate.curated ? 1 : 0.85;

  return brevity * cleanliness * curatedBonus;
};

/**
 * How much of the query the candidate's name is *about*, rather than merely
 * mentioning. "Egg, whole, cooked" leads with the term; "Bagels, egg" and
 * "Potato salad with egg" only carry it as an ingredient — so the earlier the
 * query words appear, the higher the entry sorts.
 */
const positionBonus = (searchName: string, tokens: string[]): number => {
  if (tokens.length === 0) return 0;

  const positions = tokens.map((token) => searchName.indexOf(token));
  if (positions.some((index) => index < 0)) return 0;

  const earliest = Math.min(...positions);
  // Decays smoothly: position 0 scores 1, position 20 scores ~0.33.
  return 1 / (1 + earliest / 10);
};

/**
 * Score a candidate against a query, 0–1.
 *
 * Long names are mildly penalised so "Chicken breast" beats "Chicken breast,
 * rotisserie, skin removed, refrigerated, sliced" — both match every token, but
 * the shorter one is what people mean by the bare query.
 */
export const scoreCandidate = (
  query: string,
  candidate: Scorable,
  affinity?: UserAffinity,
): number => {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(query);
  const name = candidate.searchName;

  /**
   * Every name this food answers to. Exactness is judged against what the food
   * is *called*, not only the provider's raw string — a staple stored as
   * "Egg, whole, raw" is exactly "Egg" to a person, and without this a novelty
   * product literally named "Egg" outranks it on the query "egg".
   */
  const aliases = [
    name,
    normalize(candidate.displayName ?? ''),
    normalize(candidate.shortName ?? ''),
  ].filter(Boolean);

  let score = 0;

  const exactness = Math.max(
    ...aliases.map((alias) => {
      if (alias === normalizedQuery) return WEIGHTS.exact;
      if (alias.startsWith(normalizedQuery)) return WEIGHTS.prefix;
      // Does any word start with the query? Catches "chi" -> "chicken" when the
      // food is stored as "grilled chicken breast".
      return alias.split(' ').some((word) => word.startsWith(normalizedQuery))
        ? WEIGHTS.wordPrefix
        : 0;
    }),
  );
  score += exactness;

  const matchedTokens = tokens.filter((token) => name.includes(token)).length;
  if (tokens.length > 0 && matchedTokens === tokens.length) {
    score += WEIGHTS.allTokens * positionBonus(name, tokens);
  } else if (tokens.length > 0) {
    // Partial credit keeps multi-word queries from collapsing to nothing when
    // one word is a typo the trigram index still caught.
    score += WEIGHTS.allTokens * (matchedTokens / tokens.length) * 0.4;
  }

  score += WEIGHTS.similarity * Math.max(0, Math.min(1, candidate.similarity));

  // ── 2. The user's own history ──
  score += WEIGHTS.history * historyScore(affinity);
  if (affinity?.isFavorite) score += WEIGHTS.favorite;

  if (candidate.kind === 'generic') score += WEIGHTS.generic;
  if (candidate.verified) score += WEIGHTS.verified;

  // ── 3. Global popularity ──
  // Compresses an unbounded counter into 0–1 with diminishing returns, so a
  // wildly popular food can't outrank an exact name match.
  score += WEIGHTS.popularity * (candidate.popularity / (candidate.popularity + 50));

  // ── 4. Simplicity of the name ──
  score += WEIGHTS.simplicity * simplicityScore(candidate);

  return Math.round((score / MAX_SCORE) * 1000) / 1000;
};

/**
 * Drop near-duplicates. Providers return the same food under trivially different
 * names ("Chicken, breast" vs "Chicken breast"), and after normalisation those
 * collapse to the same key — so the first (highest-scoring) one wins.
 */
export const dedupeKey = (name: string, brand: string | null): string =>
  `${normalize(brand ?? '')}|${normalize(name)}`;
