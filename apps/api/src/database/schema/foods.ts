import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const foodCategoryEnum = pgEnum('food_category', [
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
]);

/** Where the record came from. `local` is our own curated catalogue. */
export const foodSourceEnum = pgEnum('food_source', ['local', 'usda', 'off']);

/**
 * A curated whole food ("Bananas, raw") vs a branded packaged product. Searching
 * a plain ingredient should surface generics first, so this drives ranking.
 */
export const foodKindEnum = pgEnum('food_kind', ['generic', 'branded']);

/**
 * The canonical food catalogue. Every row is stored per 100 g so entries from
 * different sources are directly comparable and any serving can be derived by
 * scaling — see `food_servings` for the named portions.
 *
 * Rows arriving from an external provider are written here on first sight, which
 * is what turns a cold cross-network lookup into a local index hit next time.
 */
export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The provider's own name, kept verbatim for reference and re-normalisation
     * — "Eggs, Grade A, Large, egg whole". Never shown to a user.
     */
    name: varchar('name', { length: 255 }).notNull(),
    /** Lowercased, de-accented, Arabic-normalised `name` — what search matches against. */
    searchName: varchar('search_name', { length: 255 }).notNull(),
    brand: varchar('brand', { length: 255 }),

    // ─── Normalisation layer ───────────────────────────────
    // Derived from `name` at write time, never at read time: search results are
    // read far more often than foods are ingested, and storing the result keeps
    // ranking able to sort on name simplicity without recomputing it per query.

    /** The name a user actually sees — "Whole Egg". */
    displayName: varchar('display_name', { length: 255 }),
    /** Compact label for chips and dense lists — "Egg". */
    shortName: varchar('short_name', { length: 80 }),
    /** Extra terms this food should be findable by, beyond its own name. */
    keywords: text('keywords').array(),
    /**
     * Normalised `keywords`, space-joined. An app-maintained projection for the
     * same reason as `search_name`: it is what the trigram index matches on, and
     * `array_to_string` is only STABLE, so a generated column is not an option.
     */
    searchKeywords: varchar('search_keywords', { length: 512 }),
    /** Icon shown on the result card — "🥚". */
    emoji: varchar('emoji', { length: 16 }),
    /**
     * Buckets near-identical foods so search can present "Eggs" once with its
     * variants nested, instead of eleven flat rows of egg.
     */
    groupKey: varchar('group_key', { length: 80 }),
    /**
     * Whether the fields above have been derived yet. Ingested rows land
     * unnormalised when a write races the normaliser, and the backfill job uses
     * this to find them.
     */
    normalized: boolean('normalized').notNull().default(false),

    category: foodCategoryEnum('category').notNull().default('other'),
    kind: foodKindEnum('kind').notNull().default('generic'),
    source: foodSourceEnum('source').notNull().default('local'),
    /** Provider-native id (USDA fdcId, Open Food Facts barcode). Null for local rows. */
    externalSourceId: varchar('external_source_id', { length: 128 }),

    // ─── Nutrition, per 100 g ──────────────────────────────
    calories: real('calories').notNull().default(0),
    protein: real('protein').notNull().default(0),
    carbs: real('carbs').notNull().default(0),
    fat: real('fat').notNull().default(0),
    fiber: real('fiber').notNull().default(0),
    sugar: real('sugar').notNull().default(0),
    sodium: real('sodium').notNull().default(0),

    // ─── Default serving ───────────────────────────────────
    /** Grams in the serving the provider states, when it states one. */
    servingGrams: real('serving_grams'),
    /** Human label for that serving, e.g. "1 cup (240 g)". */
    servingLabel: varchar('serving_label', { length: 120 }),

    imageUrl: text('image_url'),

    /**
     * Who added this food, for user-created entries. Null means it belongs to
     * the shared catalogue — seeded, ingested from a provider, or created by an
     * admin. Search shows a user their own foods plus the shared ones, so one
     * person's "Mum's maqluba" never turns up in someone else's results.
     */
    createdBy: uuid('created_by'),

    /**
     * The popularity score used in ranking: a usage counter, bumped every time
     * anyone logs this food, seeded with a hand-tuned value for staples. Lets
     * "Chicken breast" outrank a coincidental branded match without
     * special-casing anything in the query.
     */
    popularity: integer('popularity').notNull().default(0),
    /** Curated rows are trusted; ingested rows are provisional until reviewed. */
    verified: boolean('verified').notNull().default(false),

    /**
     * Set when a human has corrected this row by hand.
     *
     * Ingestion re-upserts a provider record every time a search touches it, so
     * without this flag any correction is silently reverted the next time
     * somebody searches that term — the fix would appear to work and then quietly
     * undo itself. Rows carrying it keep their own values and only have
     * `updated_at` touched.
     */
    manuallyEdited: boolean('manually_edited').notNull().default(false),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // One row per external record — the guard that makes provider ingestion idempotent.
    sourceRefIdx: uniqueIndex('foods_source_ref_idx')
      .on(table.source, table.externalSourceId)
      .where(sql`${table.externalSourceId} is not null`),
    categoryIdx: index('foods_category_idx').on(table.category),
    // "My custom foods", and the visibility predicate on every search.
    createdByIdx: index('foods_created_by_idx').on(table.createdBy),
    // Cheap ordering for "browse a category" and for breaking relevance ties.
    popularityIdx: index('foods_popularity_idx').on(table.popularity.desc()),
    // Collapsing a result page into groups reads every member of a group.
    groupKeyIdx: index('foods_group_key_idx').on(table.groupKey),
    // The backfill job's only query: find what still needs normalising.
    normalizedIdx: index('foods_normalized_idx')
      .on(table.normalized)
      .where(sql`${table.normalized} = false`),
    // NOTE: `search_name` is indexed with GIN/gin_trgm_ops and there is a
    // full-text index over name+brand. Neither opclass is expressible in the
    // Drizzle DSL, so both are created directly in the migration SQL and are
    // deliberately absent here — listing them as plain btree would make
    // drizzle-kit replace the real indexes with useless ones on the next
    // generate. See `0001_food_search.sql`.
  }),
);

export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
