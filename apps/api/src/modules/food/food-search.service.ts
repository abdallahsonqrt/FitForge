import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FoodCatalogService, Candidate } from './food-catalog.service';
import { UsdaProvider } from './providers/usda.provider';
import { OpenFoodFactsProvider } from './providers/open-food-facts.provider';
import { SearchCache } from './search/search-cache';
import { detectLanguage, normalize } from './search/normalize';
import { expandQuery, toProviderQuery } from './search/lexicon';
import { dedupeKey, scoreCandidate, UserAffinity } from './search/ranking';
import {
  FoodCategory,
  FoodResult,
  FoodSearchResponse,
  FoodSuggestion,
  hasNutrition,
} from './types';
import { groupResults } from './normalization/grouping';
import { ProviderResult, providerFailed } from './providers/provider-result';
import { FoodPersonalizationService } from './food-personalization.service';

/**
 * How many good local results are enough to skip the network entirely. Below
 * this the catalogue is treated as having a gap worth filling from a provider.
 */
const LOCAL_SUFFICIENT_RESULTS = 8;

/** Candidates are over-fetched, then scored and trimmed to the requested page. */
const CANDIDATE_MULTIPLIER = 4;
const MIN_CANDIDATES = 60;

/** Below this a result is noise the trigram index happened to catch. */
const MIN_SCORE = 0.08;

/**
 * How many pages deep the cached pool runs. Wide enough that a user's history
 * can promote a food from well outside the first page, small enough that the
 * cache stays cheap.
 */
const POOL_MULTIPLIER = 3;

const SEARCH_TTL_MS = 5 * 60 * 1000;
const SUGGEST_TTL_MS = 10 * 60 * 1000;
/** Long: the flag flips only when a user creates their first custom food. */
const CUSTOM_FLAG_TTL_MS = 30 * 60 * 1000;

/**
 * The strongest score across every phrasing the query was searched under.
 *
 * The SQL matches on the translated terms too, so an Arabic query legitimately
 * finds a row named "Chicken" — but scoring only the raw "دجاج" compares Arabic
 * characters against an English name and returns near-zero for a perfect match.
 * That made relevance ordering meaningless for non-Latin queries, pushed real
 * matches under `MIN_SCORE`, and left `strongLocalHits` permanently below its
 * threshold so every Arabic search hit the providers even on a warm catalogue.
 */
const bestScore = (terms: string[], candidate: Candidate, affinity?: UserAffinity): number =>
  Math.max(...terms.map((term) => scoreCandidate(term, candidate, affinity)));

export interface SearchOptions {
  query: string;
  limit: number;
  language?: string;
  category?: FoodCategory;
  userId?: string;
}

/**
 * Search policy: local-first, with external providers filling the gaps.
 *
 * The local catalogue answers almost everything after warm-up, so the common
 * path is one indexed query and no network at all. When a term genuinely isn't
 * covered, USDA and Open Food Facts are consulted *and their answers are written
 * into the catalogue*, so the same term is local from then on. That ingestion is
 * the whole reason this is fast at steady state, and why it scales: the network
 * cost is paid once per food across all users, not once per search.
 */
@Injectable()
export class FoodSearchService {
  private readonly logger = new Logger(FoodSearchService.name);

  /** A missing API key is a deployment fault; report it once, not per search. */
  private warnedUsdaUnconfigured = false;

  constructor(
    private readonly catalog: FoodCatalogService,
    private readonly usda: UsdaProvider,
    private readonly openFoodFacts: OpenFoodFactsProvider,
    private readonly cache: SearchCache,
    private readonly personalization: FoodPersonalizationService,
  ) {}

  async search(options: SearchOptions): Promise<FoodSearchResponse> {
    const query = options.query.trim();
    if (normalize(query).length < 2) return { results: [], groups: [], ungrouped: [] };

    const language = options.language ?? detectLanguage(query);

    // Favourite flags are applied after the cached ranking, so two users can
    // share one cached candidate list. Private custom foods would break that —
    // but only for the few people who have created any, so the cache is
    // namespaced per user just for them and stays shared for everyone else.
    const viewerId = (await this.hasCustomFoods(options.userId)) ? options.userId : undefined;
    const scope = viewerId ? `u:${viewerId}` : 'shared';
    const cacheKey = `search:${normalize(query)}:${options.limit}:${language}:${options.category ?? 'all'}:${scope}`;

    const cached = this.cache.get<Candidate[]>(cacheKey);
    if (cached) {
      return this.finalize(cached, query, options, language, [query, ...expandQuery(query)]);
    }

    // Search the query as typed *and* its translations, so "دجاج" reaches an
    // entry stored only as "Chicken" even before any Arabic alias exists for it.
    const terms = [query, ...expandQuery(query)];
    const candidateLimit = Math.max(options.limit * CANDIDATE_MULTIPLIER, MIN_CANDIDATES);

    let candidates = await this.catalog.findCandidates(
      terms,
      candidateLimit,
      options.category,
      viewerId,
    );

    const strongLocalHits = candidates.filter(
      (candidate) => bestScore(terms, candidate) >= 0.3,
    ).length;

    if (strongLocalHits < LOCAL_SUFFICIENT_RESULTS) {
      const ingested = await this.fetchAndIngest(query, options.limit);
      if (ingested.length > 0) {
        candidates = [...candidates, ...ingested];
      }
    }

    const pool = this.rankPool(candidates, query, options.limit * POOL_MULTIPLIER, terms);

    // Never cache an empty result: a genuine "no matches" is cheap to recompute,
    // while a transient provider outage would otherwise be pinned for the TTL.
    if (pool.length > 0) {
      this.cache.set(cacheKey, pool, SEARCH_TTL_MS);
    }

    return this.finalize(pool, query, options, language, terms);
  }

  /** Fast prefix suggestions for the search box. */
  async autocomplete(
    query: string,
    limit: number,
    language?: string,
    userId?: string,
  ): Promise<FoodSuggestion[]> {
    const trimmed = query.trim();
    if (normalize(trimmed).length < 1) return [];

    const resolvedLanguage = language ?? detectLanguage(trimmed);
    const viewerId = (await this.hasCustomFoods(userId)) ? userId : undefined;
    const cacheKey = `suggest:${normalize(trimmed)}:${limit}:${resolvedLanguage}:${
      viewerId ? `u:${viewerId}` : 'shared'
    }`;

    const cached = this.cache.get<FoodSuggestion[]>(cacheKey);
    if (cached) return cached;

    const terms = [trimmed, ...expandQuery(trimmed)];
    const suggestions = await this.catalog.suggest(terms, limit, resolvedLanguage, viewerId);

    if (suggestions.length > 0) {
      this.cache.set(cacheKey, suggestions, SUGGEST_TTL_MS);
    }

    return suggestions;
  }

  /** One food by catalogue id. */
  async findById(id: string, options: { language?: string; userId?: string } = {}) {
    const candidate = await this.catalog.findById(id, options.userId);
    if (!candidate) {
      throw new NotFoundException('That food could not be found.');
    }

    const [result] = await this.catalog.hydrate([candidate], {
      language: options.language ?? 'en',
      userId: options.userId,
    });
    return result;
  }

  async browseCategory(
    category: FoodCategory,
    limit: number,
    options: { language?: string; userId?: string } = {},
  ): Promise<FoodResult[]> {
    const candidates = await this.catalog.findByCategory(category, limit, options.userId);
    return this.catalog.hydrate(candidates, {
      language: options.language ?? 'en',
      userId: options.userId,
    });
  }

  /** A user's own custom foods. */
  async customFoods(userId: string, limit = 50): Promise<FoodResult[]> {
    const candidates = await this.catalog.findCustomFor(userId, limit);
    return this.catalog.hydrate(candidates, { language: 'en', userId });
  }

  /** Called after a custom food is created, so it is searchable immediately. */
  invalidateCaches(): void {
    this.cache.invalidatePrefix('search:');
    this.cache.invalidatePrefix('suggest:');
    this.cache.invalidatePrefix('custom:');
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * Whether this user has any private foods, and so needs their own view of the
   * catalogue. Cached hard: it is false for almost everyone, changes only when
   * they create a food, and is checked on every search and keystroke.
   */
  private async hasCustomFoods(userId?: string): Promise<boolean> {
    if (!userId) return false;

    const cacheKey = `custom:${userId}`;
    const cached = this.cache.get<boolean>(cacheKey);
    if (cached !== null) return cached;

    const [own] = await this.catalog.findCustomFor(userId, 1);
    const has = !!own;

    this.cache.set(cacheKey, has, CUSTOM_FLAG_TTL_MS);
    return has;
  }

  /**
   * Query both providers in parallel and store whatever comes back.
   *
   * `allSettled` rather than `all`: one provider being down should degrade the
   * result set, not fail the search. If both fail we simply return what the
   * local catalogue already had — an empty page beats a 503 on a search box.
   */
  private async fetchAndIngest(query: string, limit: number): Promise<Candidate[]> {
    // Providers are English-only, so an Arabic query is translated first.
    const providerQuery = toProviderQuery(query) ?? query;

    const [usdaResult, offResult] = await Promise.allSettled([
      this.usda.search(providerQuery, Math.max(limit * 2, 40)),
      this.openFoodFacts.search(providerQuery, Math.max(limit, 20)),
    ]);

    // `allSettled` guards against an unexpected throw; the providers themselves
    // resolve with a status rather than rejecting, so this is belt-and-braces.
    const usda =
      usdaResult.status === 'fulfilled' ? usdaResult.value : providerFailed();
    const off = offResult.status === 'fulfilled' ? offResult.value : providerFailed();

    this.reportProviderHealth(providerQuery, usda, off);

    const external = [...usda.foods, ...off.foods].filter((food) =>
      hasNutrition(food.per100g),
    );

    if (external.length === 0) return [];

    return this.catalog.ingest(external);
  }

  /**
   * Say out loud when the external half of search is not actually working.
   *
   * This changes nothing about how a failure is handled — the search still
   * degrades to local results either way. It exists because it previously could
   * not be *seen*: an unconfigured API key, an outage and a genuinely unknown
   * food were indistinguishable, so a production instance could run for months
   * with USDA silently switched off.
   *
   * Levels are chosen so the noisy case stays quiet: a provider returning no
   * matches for an obscure term is normal and is not logged at all.
   */
  private reportProviderHealth(query: string, usda: ProviderResult, off: ProviderResult): void {
    const down = [
      usda.status === 'failed' ? 'USDA' : null,
      off.status === 'failed' ? 'Open Food Facts' : null,
    ].filter(Boolean);

    if (down.length === 2) {
      this.logger.error(
        `Both food providers failed for "${query}"; search is running on the local catalogue alone.`,
      );
    } else if (down.length === 1) {
      this.logger.warn(`${down[0]} failed for "${query}"; continuing with the other provider.`);
    }

    // Once per process, not once per search — this is a deployment fault, and
    // repeating it on every keystroke would bury everything else.
    if (usda.status === 'unconfigured' && !this.warnedUsdaUnconfigured) {
      this.warnedUsdaUnconfigured = true;
      this.logger.error(
        'USDA_FDC_API_KEY is not set. The primary food provider is disabled, so searches for ' +
          'foods missing from the local catalogue will return fewer or no results.',
      );
    }
  }

  /**
   * Score against the query alone, drop noise and near-duplicates, and keep a
   * pool a few pages deep.
   *
   * Deliberately stops short of the final page. The user's own history is
   * applied afterwards, and trimming to `limit` here would mean a food they eat
   * daily could never be promoted into view — it would already have been cut.
   * Keeping the pool query-only is also what lets one cache entry serve every
   * user.
   */
  private rankPool(
    candidates: Candidate[],
    query: string,
    poolSize: number,
    terms: string[],
  ): Candidate[] {
    // No score floor here. The pool is shared between users and therefore
    // scored without anyone's history, so cutting at `MIN_SCORE` at this point
    // discarded exactly the rows history exists to rescue — a food you log every
    // day would be gone before `finalize` ever saw it. The floor is applied
    // there instead, once the per-user signal is in. Ordering still uses the
    // query-only score, which is what makes the pool cacheable.
    const scored = candidates
      .map((candidate) => ({ candidate, score: bestScore(terms, candidate) }))
      .sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    const pool: Candidate[] = [];

    for (const { candidate } of scored) {
      if (pool.length >= poolSize) break;
      // A curated row with all-zero macros is a real food — water, black coffee,
      // plain tea. Only an *external* record with no numbers is junk, and that is
      // already filtered before ingestion. Dropping zero-calorie rows here made
      // autocomplete offer "Water" and the search that followed return nothing.
      if (!candidate.verified && !hasNutrition(candidate.per100g)) continue;

      const key = dedupeKey(candidate.name, candidate.brand);
      if (seen.has(key)) continue;

      seen.add(key);
      pool.push(candidate);
    }

    return pool;
  }

  /**
   * Re-rank the shared pool for one user, then hydrate into cards and groups.
   *
   * This is where the four ranking inputs finally come together: relevance and
   * name simplicity were scored into the pool, and the user's history and
   * favourites are layered on here, where they can be per-user without costing
   * the cache.
   */
  private async finalize(
    pool: Candidate[],
    query: string,
    options: SearchOptions,
    language: string,
    terms: string[],
  ): Promise<FoodSearchResponse> {
    const affinities = options.userId
      ? await this.personalization.affinitiesFor(
          options.userId,
          pool.map((candidate) => candidate.id),
        )
      : new Map();

    const scores = new Map(
      pool.map((candidate) => [
        candidate.id,
        bestScore(terms, candidate, affinities.get(candidate.id)),
      ]),
    );

    // The floor goes here, on the history-aware score, so a food the user eats
    // often clears it even when the query alone would not have.
    const ordered = pool
      .filter((candidate) => (scores.get(candidate.id) ?? 0) >= MIN_SCORE)
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
      .slice(0, options.limit);

    const results = await this.catalog.hydrate(ordered, {
      language,
      userId: options.userId,
      scores,
    });

    const { groups, ungrouped } = groupResults(results);
    return { results, groups, ungrouped };
  }
}
