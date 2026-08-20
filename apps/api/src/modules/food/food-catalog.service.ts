import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, inArray, sql, SQL } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DB_CONNECTION } from '../../database/database.provider';
import {
  FoodCategory,
  FoodKind,
  FoodResult,
  FoodSource,
  FoodSuggestion,
  Nutrients,
  ServingUnit,
  roundNutrients,
  withDerivedCalories,
} from './types';
import { ExternalFood } from './providers/provider.types';
import { escapeLike, normalize } from './search/normalize';
import { Scorable } from './search/ranking';
import { buildServingOptions, defaultGramsFor } from './search/servings';
import { keywordsToSearchBlob, normalizeFood } from './normalization/food-normalizer';

/**
 * On re-ingest, take the provider's value unless a human has edited this row.
 *
 * `column` is the raw SQL column name because both sides of the CASE are raw:
 * `excluded` is the row Postgres would have inserted, and `foods` is the row
 * already stored.
 */
const keepIfEdited = (column: string): SQL =>
  sql.raw(`case when foods.manually_edited then foods.${column} else excluded.${column} end`);

/** A candidate row straight out of Postgres, before application-side scoring. */
export interface Candidate extends Scorable {
  id: string;
  name: string;
  brand: string | null;
  category: FoodCategory;
  source: FoodSource;
  imageUrl: string | null;
  per100g: Nutrients;
  servingGrams: number | null;
  servingLabel: string | null;
  // ─── Normalisation, when the row has been through it ───
  shortName: string | null;
  emoji: string | null;
  groupKey: string | null;
}

/**
 * Raw shape of a candidate row. The index signature satisfies Drizzle's
 * `execute<T>` constraint, which requires an indexable record.
 */
interface CandidateRow extends Record<string, unknown> {
  id: string;
  name: string;
  search_name: string;
  brand: string | null;
  category: FoodCategory;
  kind: FoodKind;
  source: FoodSource;
  image_url: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  serving_grams: number | null;
  serving_label: string | null;
  popularity: number;
  verified: boolean;
  similarity: number;
  display_name: string | null;
  short_name: string | null;
  emoji: string | null;
  group_key: string | null;
  normalized: boolean;
}

/** A hand-created food, as accepted by `createCustom`. */
export interface CustomFoodInput {
  name: string;
  brand?: string | null;
  category: FoodCategory;
  per100g: Nutrients;
  servingGrams?: number | null;
  servingLabel?: string | null;
  imageUrl?: string | null;
  /** Null puts the food in the shared catalogue; a user id keeps it private. */
  createdBy: string | null;
  verified: boolean;
  popularity?: number;
  servings?: {
    name: string;
    amount: number;
    unit: ServingUnit;
    gramsPerUnit: number;
    isDefault?: boolean;
  }[];
  translations?: { language: string; name: string }[];
}

/**
 * Everything that touches the local `foods` catalogue: candidate retrieval,
 * hydration into API shapes, and ingestion of external records.
 *
 * The search *policy* (which sources to consult, how to rank, when to fall back)
 * lives in `FoodSearchService`. This class only knows how to read and write.
 */
@Injectable()
export class FoodCatalogService {
  private readonly logger = new Logger(FoodCatalogService.name);

  constructor(@Inject(DB_CONNECTION) private readonly db: NodePgDatabase<typeof schema>) {}

  /**
   * Pull ranking candidates for one or more phrasings of a query.
   *
   * Three matchers run per term because each covers a case the others miss:
   * trigram word-similarity (`%>`) catches typos, a leading `LIKE` catches the
   * autocomplete prefix, and a word-boundary `LIKE` catches "chi" inside
   * "grilled chicken breast". All are served by the same GIN trigram index.
   *
   * `%>` rather than `%` deliberately. `%` compares *whole strings*, so a typo
   * against a multi-word name is diluted below any usable threshold —
   * `similarity('chicken breast raw', 'chikcen')` is 0.17, and raising the
   * threshold to catch that would flood every other query with noise. `%>`
   * compares the query against the closest matching word instead (0.375 here),
   * which is what "typo tolerance" actually means. Threshold is set per
   * connection in `database.provider.ts`.
   *
   * Structured as a UNION of two independent scans rather than a join with the
   * predicates OR'd across both tables. The join form reads more naturally but
   * plans badly: an OR spanning `foods` and `food_translations` cannot be
   * satisfied from either index alone, so Postgres degrades to evaluating the
   * whole join. Splitting them lets each side use its own GIN index and keeps
   * the query sub-linear as the catalogue grows.
   */
  async findCandidates(
    terms: string[],
    limit: number,
    category?: FoodCategory,
    viewerId?: string,
  ): Promise<Candidate[]> {
    const normalizedTerms = [...new Set(terms.map(normalize).filter(Boolean))];
    if (normalizedTerms.length === 0) return [];

    /** Match predicates for one term against a given table alias. */
    const matchersFor = (alias: 'f' | 't'): SQL[] =>
      normalizedTerms.map((term) => {
        const prefix = `${escapeLike(term)}%`;
        const wordPrefix = `% ${escapeLike(term)}%`;
        const column = alias === 'f' ? sql`f.search_name` : sql`t.search_name`;
        const vector = alias === 'f' ? sql`f.search_vector` : sql`t.search_vector`;

        // Full text only earns its branch on multi-word queries: `plainto_tsquery`
        // matches whole tokens, so on a partial word ("chi") it can never hit,
        // and the LIKE and trigram branches already cover that case.
        const fullText = term.includes(' ')
          ? sql` or ${vector} @@ plainto_tsquery('simple', ${term})`
          : sql``;

        // Normalisation-supplied keywords are the other way in: they carry the
        // reader-facing name and its aliases, so "whole egg" finds a row whose
        // own name is "Eggs, Grade A, Large, egg whole". Same table, same scan.
        const keywords =
          alias === 'f'
            ? sql` or f.search_keywords like ${wordPrefix} or f.search_keywords like ${prefix}`
            : sql``;

        return sql`(${column} %> ${term} or ${column} like ${prefix} or ${column} like ${wordPrefix}${fullText}${keywords})`;
      });

    // Similarity is measured against the original phrasing, so a lexicon variant
    // can widen what is *found* without inflating how strongly it scores.
    const [primary] = normalizedTerms;

    const filters = [this.visibilityFilter(viewerId)];
    if (category) filters.push(sql`f.category = ${category}`);
    const where = sql` where ${sql.join(filters, sql` and `)}`;

    const result = await this.db.execute<CandidateRow>(sql`
      with matches as (
        -- Scored the same way it was matched: a typo scores near zero on
        -- whole-string similarity, which would push a legitimate hit under the
        -- minimum score and drop it again after the index had found it.
        select f.id, greatest(
          similarity(f.search_name, ${primary}),
          word_similarity(${primary}, f.search_name)
        ) as sim
        from foods f
        where ${sql.join(matchersFor('f'), sql` or `)}
        union all
        select t.food_id as id, greatest(
          similarity(t.search_name, ${primary}),
          word_similarity(${primary}, t.search_name)
        ) as sim
        from food_translations t
        where ${sql.join(matchersFor('t'), sql` or `)}
      ),
      ranked as (
        -- A food can match on its own name and on several aliases; keep its
        -- single strongest score.
        select id, max(sim) as similarity
        from matches
        group by id
      )
      select
        f.id,
        f.name,
        f.search_name,
        f.brand,
        f.category,
        f.kind,
        f.source,
        f.image_url,
        f.calories, f.protein, f.carbs, f.fat, f.fiber, f.sugar, f.sodium,
        f.serving_grams,
        f.serving_label,
        f.popularity,
        f.verified,
        f.display_name,
        f.short_name,
        f.emoji,
        f.group_key,
        f.normalized,
        r.similarity
      from ranked r
      join foods f on f.id = r.id${where}
      order by r.similarity desc, f.popularity desc
      limit ${limit}
    `);

    return result.rows.map((row) => this.toCandidate(row));
  }

  /**
   * Autocomplete. Prefix-only and name-only: it runs on every keystroke, so it
   * trades the fuzzy matching of a full search for a single index range scan.
   */
  async suggest(
    terms: string[],
    limit: number,
    language: string,
    viewerId?: string,
  ): Promise<FoodSuggestion[]> {
    const normalizedTerms = [...new Set(terms.map(normalize).filter(Boolean))];
    if (normalizedTerms.length === 0) return [];

    const matchersFor = (alias: 'f' | 't'): SQL[] =>
      normalizedTerms.map((term) => {
        const prefix = `${escapeLike(term)}%`;
        const wordPrefix = `% ${escapeLike(term)}%`;
        const column = alias === 'f' ? sql`f.search_name` : sql`t.search_name`;
        return sql`(${column} like ${prefix} or ${column} like ${wordPrefix})`;
      });

    const [primary] = normalizedTerms;

    const result = await this.db.execute<{
      id: string;
      name: string;
      brand: string | null;
      category: FoodCategory;
      calories: number;
      normalized_name: string | null;
      short_name: string | null;
      emoji: string | null;
      display_name: string | null;
    }>(sql`
      with matches as (
        select f.id from foods f where ${sql.join(matchersFor('f'), sql` or `)}
        union
        select t.food_id as id from food_translations t
        where ${sql.join(matchersFor('t'), sql` or `)}
      )
      select
        f.id,
        f.name,
        f.brand,
        f.category,
        f.calories,
        f.display_name as normalized_name,
        f.short_name,
        f.emoji,
        max(case when t.language = ${language} and t.is_primary then t.translated_name end)
          as display_name
      from matches m
      join foods f on f.id = m.id
      left join food_translations t on t.food_id = f.id
      where ${this.visibilityFilter(viewerId)}
      group by f.id
      order by
        /* Names that *start* with the term rank first: typing "chi" should offer
           "Chicken breast" before "Sweet chilli sauce". */
        (f.search_name like ${`${escapeLike(primary)}%`}) desc,
        f.popularity desc,
        length(f.search_name) asc
      limit ${limit}
    `);

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      // A translation wins only when the user is reading in another language.
      // English rows are stored as translations too, holding the *provider's*
      // wording — preferring them here would undo normalisation and put
      // "Chicken breast, raw" back in the suggestion list. `hydrate` skips
      // English translations for the same reason; these two must agree.
      displayName:
        (language === 'en' ? null : row.display_name) ?? row.normalized_name ?? row.name,
      shortName: row.short_name ?? row.normalized_name ?? row.name,
      emoji: row.emoji ?? '🍽️',
      brand: row.brand,
      category: row.category,
      calories: Math.round(Number(row.calories) || 0),
    }));
  }

  /**
   * Turn candidates into full API results: attaches servings, the localised
   * display name and the user's favourite flag.
   *
   * Batched deliberately — servings, translations and favourites are three
   * queries for the whole page rather than three per row.
   */
  async hydrate(
    candidates: Candidate[],
    options: { language: string; userId?: string; scores?: Map<string, number> },
  ): Promise<FoodResult[]> {
    if (candidates.length === 0) return [];

    const ids = candidates.map((candidate) => candidate.id);
    const [servingsByFood, namesByFood, favoriteIds] = await Promise.all([
      this.servingsFor(ids),
      this.displayNamesFor(ids, options.language),
      options.userId ? this.favoriteIdsFor(options.userId, ids) : Promise.resolve(new Set<string>()),
    ]);

    return candidates.map((candidate) => {
      const servings = buildServingOptions(
        candidate.category,
        servingsByFood.get(candidate.id) ?? [],
        candidate.servingGrams,
        candidate.servingLabel,
      );

      // Display name, in order of what the reader most wants to see: a name in
      // their own language, then the normalised English one, and only if the
      // food has never been normalised does the raw provider string surface.
      const displayName =
        namesByFood.get(candidate.id) ?? candidate.displayName ?? candidate.name;

      return {
        id: candidate.id,
        name: candidate.name,
        displayName,
        shortName: candidate.shortName ?? displayName,
        emoji: candidate.emoji ?? '🍽️',
        groupKey: candidate.groupKey,
        brand: candidate.brand,
        category: candidate.category,
        kind: candidate.kind,
        source: candidate.source,
        imageUrl: candidate.imageUrl,
        per100g: candidate.per100g,
        servings,
        defaultGrams: defaultGramsFor(servings),
        isFavorite: favoriteIds.has(candidate.id),
        score: options.scores?.get(candidate.id),
      };
    });
  }

  /**
   * A single food by its catalogue id, or null when it doesn't exist — or when
   * `viewerId` may not see it.
   *
   * The visibility check belongs here and not only on the search paths: knowing
   * a UUID is not authorisation, and without it `GET /foods/:id` served another
   * user's private food, `POST /foods/:id/favorite` pinned it into the caller's
   * favourites permanently, and `POST /foods/:id/usage` let anyone inflate its
   * popularity.
   */
  async findById(id: string, viewerId?: string): Promise<Candidate | null> {
    const [row] = await this.db
      .select()
      .from(schema.foods)
      .where(and(eq(schema.foods.id, id), this.ownerFilter(viewerId)))
      .limit(1);
    if (!row) return null;

    return this.fromRow(row);
  }

  async findByIds(ids: string[], viewerId?: string): Promise<Candidate[]> {
    if (ids.length === 0) return [];

    const rows = await this.db
      .select()
      .from(schema.foods)
      .where(and(inArray(schema.foods.id, ids), this.ownerFilter(viewerId)));

    const byId = new Map(
      rows.map((row) => [
        row.id,
        this.fromRow(row),
      ]),
    );

    // Preserve the caller's ordering — recents and favourites arrive pre-sorted.
    return ids.map((id) => byId.get(id)).filter((food): food is Candidate => food !== undefined);
  }

  /**
   * Persist records fetched from a provider and return them as candidates.
   *
   * This is what stops the same external lookup happening twice: the first
   * search for a food pays the network cost, every later one is an index hit.
   * Conflicts on `(source, external_source_id)` refresh the nutrition in place
   * rather than inserting a duplicate.
   */
  async ingest(foods: ExternalFood[]): Promise<Candidate[]> {
    const usable = foods.filter((food) => food.name.trim().length > 0);
    if (usable.length === 0) return [];

    // Providers occasionally return the same id twice in one page; a single
    // INSERT cannot update the same row twice, so collapse first.
    const unique = [...new Map(usable.map((food) => [`${food.source}:${food.externalId}`, food])).values()];

    const values = unique.map((food) => {
      const per100g = roundNutrients(withDerivedCalories(food.per100g));
      // Normalise on the way in, so the reader-facing name is computed once per
      // food rather than on every search that returns it.
      const readable = normalizeFood(food);

      return {
        name: food.name.slice(0, 255),
        searchName: normalize(food.name).slice(0, 255),
        brand: food.brand?.slice(0, 255) ?? null,
        category: food.category,
        kind: food.kind,
        source: food.source,
        externalSourceId: food.externalId.slice(0, 128),
        // Sliced to the column widths as a last line of defence. The
        // normaliser caps these already; a single overflow here would abort the
        // whole multi-row insert and lose the entire provider page.
        displayName: readable.displayName.slice(0, 255),
        shortName: readable.shortName.slice(0, 80),
        keywords: readable.keywords,
        searchKeywords: keywordsToSearchBlob(readable.keywords),
        emoji: readable.emoji,
        groupKey: readable.groupKey,
        normalized: true,
        calories: per100g.calories,
        protein: per100g.protein,
        carbs: per100g.carbs,
        fat: per100g.fat,
        fiber: per100g.fiber,
        sugar: per100g.sugar,
        sodium: per100g.sodium,
        servingGrams: food.servingGrams,
        servingLabel: food.servingLabel?.slice(0, 120) ?? null,
        imageUrl: food.imageUrl,
      };
    });

    try {
      const inserted = await this.db
        .insert(schema.foods)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.foods.source, schema.foods.externalSourceId],
          targetWhere: sql`external_source_id is not null`,
          set: {
            // Guarded field by field on `foods.manually_edited`. A provider
            // record is re-upserted every time a search touches it, so an
            // unguarded SET silently reverted any human correction the next time
            // somebody searched that term — the fix appeared to take, then undid
            // itself with no trace. `excluded` is the incoming row; `foods` is
            // the one already stored.
            name: keepIfEdited('name'),
            searchName: keepIfEdited('search_name'),
            brand: keepIfEdited('brand'),
            category: keepIfEdited('category'),
            calories: keepIfEdited('calories'),
            protein: keepIfEdited('protein'),
            carbs: keepIfEdited('carbs'),
            fat: keepIfEdited('fat'),
            fiber: keepIfEdited('fiber'),
            sugar: keepIfEdited('sugar'),
            sodium: keepIfEdited('sodium'),
            servingGrams: keepIfEdited('serving_grams'),
            servingLabel: keepIfEdited('serving_label'),
            imageUrl: keepIfEdited('image_url'),
            displayName: keepIfEdited('display_name'),
            shortName: keepIfEdited('short_name'),
            keywords: keepIfEdited('keywords'),
            searchKeywords: keepIfEdited('search_keywords'),
            emoji: keepIfEdited('emoji'),
            groupKey: keepIfEdited('group_key'),
            normalized: keepIfEdited('normalized'),
            // Always advanced: it records that the provider was seen again, not
            // that anything about the food changed.
            updatedAt: new Date(),
          },
        })
        .returning();

      await this.attachSuggestedServings(inserted);

      return inserted.map((row) => this.fromRow(row));
    } catch (error) {
      // Ingestion is an optimisation, never a requirement: a failure here must
      // not cost the user their search results.
      this.logger.warn(
        `Failed to ingest ${unique.length} external foods: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return [];
    }
  }

  /** Foods in a category, most popular first — powers the category browser. */
  async findByCategory(
    category: FoodCategory,
    limit: number,
    viewerId?: string,
  ): Promise<Candidate[]> {
    const rows = await this.db
      .select()
      .from(schema.foods)
      .where(
        and(
          eq(schema.foods.category, category),
          // Curated rows, plus the viewer's own custom foods whether or not
          // anyone has reviewed them.
          viewerId
            ? sql`(${schema.foods.verified} = true or ${schema.foods.createdBy} = ${viewerId})`
            : eq(schema.foods.verified, true),
        ),
      )
      .orderBy(sql`${schema.foods.popularity} desc`)
      .limit(limit);

    return rows.map((row) =>
      this.fromRow(row),
    );
  }

  /**
   * Create a food by hand, with its portions and localised names.
   *
   * This is the escape hatch behind `POST /foods/custom`, and the answer to
   * regional dishes the external providers simply do not carry — no amount of
   * querying USDA will produce musakhan. An admin creating one adds it to the
   * shared catalogue (`createdBy: null`, verified), where it then behaves like
   * any seeded food: searchable by everyone, in English or Arabic. A regular
   * user creating one gets a private entry only they can see.
   *
   * Written in a transaction because a food whose servings failed to insert
   * would silently fall back to category-average portions — wrong numbers being
   * worse than an error.
   */
  async createCustom(input: CustomFoodInput): Promise<string> {
    const per100g = roundNutrients(withDerivedCalories(input.per100g));
    const readable = normalizeFood(input);

    return this.db.transaction(async (tx) => {
      const [food] = await tx
        .insert(schema.foods)
        .values({
          name: input.name.slice(0, 255),
          searchName: normalize(input.name).slice(0, 255),
          brand: input.brand?.slice(0, 255) ?? null,
          category: input.category,
          kind: input.brand ? 'branded' : 'generic',
          source: 'local',
          // A hand-typed name is already reader-facing, so normalisation only
          // supplies what the user didn't: the icon, group and keywords.
          displayName: input.name.slice(0, 255),
          shortName: readable.shortName.slice(0, 80),
          keywords: readable.keywords,
          searchKeywords: keywordsToSearchBlob(readable.keywords),
          emoji: readable.emoji,
          groupKey: readable.groupKey,
          normalized: true,
          ...per100g,
          servingGrams: input.servingGrams ?? null,
          servingLabel: input.servingLabel?.slice(0, 120) ?? null,
          imageUrl: input.imageUrl ?? null,
          createdBy: input.createdBy,
          verified: input.verified,
          popularity: input.popularity ?? 0,
        })
        .returning({ id: schema.foods.id });

      // The user's own portions when they gave any, otherwise the normaliser's
      // suggestions — a custom food should never open on a bare "100 g" either.
      const servings = input.servings?.length ? input.servings : readable.servings;

      await tx.insert(schema.foodServings).values(
        servings.map((serving, index) => ({
          foodId: food.id,
          servingName: serving.name.slice(0, 120),
          amount: serving.amount,
          unit: serving.unit,
          gramsPerUnit: serving.gramsPerUnit,
          // Exactly one default per food; the first listed portion wins.
          isDefault: serving.isDefault ?? index === 0,
        })),
      );

      if (input.translations?.length) {
        await tx.insert(schema.foodTranslations).values(
          input.translations.map((translation, index) => ({
            foodId: food.id,
            language: translation.language,
            translatedName: translation.name.slice(0, 255),
            searchName: normalize(translation.name).slice(0, 255),
            isPrimary: index === 0,
          })),
        );
      }

      return food.id;
    });
  }

  /** A user's own custom foods, newest first. */
  async findCustomFor(userId: string, limit: number): Promise<Candidate[]> {
    const rows = await this.db
      .select()
      .from(schema.foods)
      .where(eq(schema.foods.createdBy, userId))
      .orderBy(sql`${schema.foods.createdAt} desc`)
      .limit(limit);

    return rows.map((row) =>
      this.fromRow(row),
    );
  }

  // ─── Internals ────────────────────────────────────────────

  /**
   * Give freshly ingested foods the portions the normaliser suggested.
   *
   * Provider records almost never carry usable serving data, and a food offering
   * only "100 g" is exactly the government-database feel this layer exists to
   * remove — "1 egg" is what a person wants to tap. Only foods with no portions
   * at all are touched, so a re-ingest never duplicates them and never
   * overwrites something curated.
   */
  private async attachSuggestedServings(
    rows: (typeof schema.foods.$inferSelect)[],
  ): Promise<void> {
    if (rows.length === 0) return;

    const ids = rows.map((row) => row.id);
    const existing = await this.db
      .selectDistinct({ foodId: schema.foodServings.foodId })
      .from(schema.foodServings)
      .where(inArray(schema.foodServings.foodId, ids));

    const covered = new Set(existing.map((row) => row.foodId));
    const values = rows
      .filter((row) => !covered.has(row.id))
      .flatMap((row) => {
        const suggested = normalizeFood({
          name: row.name,
          brand: row.brand,
          category: row.category,
          servingGrams: row.servingGrams,
          servingLabel: row.servingLabel,
        }).servings;

        return suggested.map((serving, index) => ({
          foodId: row.id,
          servingName: serving.name.slice(0, 120),
          amount: serving.amount,
          unit: serving.unit,
          gramsPerUnit: serving.gramsPerUnit,
          isDefault: serving.isDefault ?? index === 0,
        }));
      });

    if (values.length === 0) return;

    await this.db.insert(schema.foodServings).values(values);
  }

  /**
   * Restricts a scan to what `viewerId` may see: the shared catalogue plus their
   * own custom entries. An anonymous read sees only the shared catalogue.
   */
  /**
   * The same rule as `visibilityFilter`, for queries built with the Drizzle
   * query builder rather than raw SQL (which has no `f.` table alias).
   */
  private ownerFilter(viewerId?: string): SQL {
    return viewerId
      ? sql`(${schema.foods.createdBy} is null or ${schema.foods.createdBy} = ${viewerId})`
      : sql`${schema.foods.createdBy} is null`;
  }

  private visibilityFilter(viewerId?: string): SQL {
    return viewerId
      ? sql`(f.created_by is null or f.created_by = ${viewerId})`
      : sql`f.created_by is null`;
  }

  private async servingsFor(foodIds: string[]) {
    const rows = await this.db
      .select()
      .from(schema.foodServings)
      .where(inArray(schema.foodServings.foodId, foodIds));

    const byFood = new Map<
      string,
      {
        id: string;
        servingName: string;
        amount: number;
        unit: ServingUnit;
        gramsPerUnit: number;
        isDefault: boolean;
      }[]
    >();

    for (const row of rows) {
      const list = byFood.get(row.foodId) ?? [];
      list.push({
        id: row.id,
        servingName: row.servingName,
        amount: row.amount,
        unit: row.unit,
        gramsPerUnit: row.gramsPerUnit,
        isDefault: row.isDefault,
      });
      byFood.set(row.foodId, list);
    }

    // Default portion first so the picker opens on it.
    for (const list of byFood.values()) {
      list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    }

    return byFood;
  }

  /** Primary translated name per food for the requested language, when one exists. */
  private async displayNamesFor(foodIds: string[], language: string) {
    if (language === 'en') return new Map<string, string>();

    const rows = await this.db
      .select({
        foodId: schema.foodTranslations.foodId,
        translatedName: schema.foodTranslations.translatedName,
      })
      .from(schema.foodTranslations)
      .where(
        and(
          inArray(schema.foodTranslations.foodId, foodIds),
          eq(schema.foodTranslations.language, language),
          eq(schema.foodTranslations.isPrimary, true),
        ),
      );

    return new Map(rows.map((row) => [row.foodId, row.translatedName]));
  }

  private async favoriteIdsFor(userId: string, foodIds: string[]) {
    const rows = await this.db
      .select({ foodId: schema.favoriteFoods.foodId })
      .from(schema.favoriteFoods)
      .where(
        and(
          eq(schema.favoriteFoods.userId, userId),
          inArray(schema.favoriteFoods.foodId, foodIds),
        ),
      );

    return new Set(rows.map((row) => row.foodId));
  }

  /**
   * Adapt a Drizzle row (camelCase) to the shape the raw-SQL path produces
   * (snake_case). One helper rather than a spread at each call site: five copies
   * of this mapping meant five places to forget a newly added column.
   */
  private fromRow(row: typeof schema.foods.$inferSelect): Candidate {
    return this.toCandidate({
      ...row,
      search_name: row.searchName,
      image_url: row.imageUrl,
      serving_grams: row.servingGrams,
      serving_label: row.servingLabel,
      display_name: row.displayName,
      short_name: row.shortName,
      group_key: row.groupKey,
      similarity: 0,
    } as unknown as CandidateRow);
  }

  /** `real` columns arrive as strings over the wire; coerce once, here. */
  private toCandidate(row: CandidateRow): Candidate {
    const num = (value: unknown): number => {
      const parsed = typeof value === 'string' ? Number.parseFloat(value) : (value as number);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return {
      id: row.id,
      name: row.name,
      searchName: row.search_name,
      brand: row.brand,
      category: row.category,
      kind: row.kind,
      source: row.source,
      imageUrl: row.image_url,
      per100g: roundNutrients({
        calories: num(row.calories),
        protein: num(row.protein),
        carbs: num(row.carbs),
        fat: num(row.fat),
        fiber: num(row.fiber),
        sugar: num(row.sugar),
        sodium: num(row.sodium),
      }),
      servingGrams: row.serving_grams === null ? null : num(row.serving_grams),
      servingLabel: row.serving_label,
      popularity: num(row.popularity),
      verified: !!row.verified,
      similarity: num(row.similarity),
      // Ranking reads these to score name simplicity and to judge exactness
      // against what the food is called rather than the provider's raw string.
      displayName: row.display_name,
      curated: !!row.normalized,
      shortName: row.short_name,
      emoji: row.emoji,
      groupKey: row.group_key,
    };
  }
}
