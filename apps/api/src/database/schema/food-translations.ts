import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { foods } from './foods';

/**
 * The translation layer. A food exists once in `foods`; every language it can be
 * found or displayed in is a row here, so adding Arabic (or Turkish, or French)
 * never duplicates a nutrition record.
 *
 * Rows are both *display* names and *search* aliases: several rows may share a
 * language, letting "دجاج", "فراخ" and "صدور دجاج" all resolve to one chicken
 * entry. `isPrimary` picks which one is shown back to the user.
 */
export const foodTranslations = pgTable(
  'food_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),

    /** ISO 639-1: 'en', 'ar', … */
    language: varchar('language', { length: 10 }).notNull(),
    translatedName: varchar('translated_name', { length: 255 }).notNull(),
    /** Normalised form of `translatedName`; what queries actually match against. */
    searchName: varchar('search_name', { length: 255 }).notNull(),

    /** The name shown to a user reading in this language; the rest are aliases. */
    isPrimary: boolean('is_primary').notNull().default(false),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueNameIdx: uniqueIndex('food_translations_unique_idx').on(
      table.foodId,
      table.language,
      table.searchName,
    ),
    foodIdx: index('food_translations_food_idx').on(table.foodId),
    languageIdx: index('food_translations_language_idx').on(table.language),
    // `search_name` carries a GIN/gin_trgm_ops index — the fuzzy entry point for
    // non-English queries — created in the migration SQL for the same reason as
    // on `foods`: drizzle-kit cannot express the opclass.
  }),
);

export type FoodTranslation = typeof foodTranslations.$inferSelect;
export type NewFoodTranslation = typeof foodTranslations.$inferInsert;
