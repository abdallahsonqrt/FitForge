import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { exercises } from './exercises';

/**
 * How the library is browsed — "Push", "Pull", "Legs", "Core", "Cardio".
 *
 * A category is editorial grouping, deliberately separate from muscles: "Push"
 * spans chest, shoulders and triceps, and an exercise belongs to exactly one
 * category but many muscles.
 */
export const exerciseCategories = pgTable(
  'exercise_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** URL/filter-safe identifier, e.g. `upper-push`. The stable key clients filter on. */
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    /** Display order in the browse UI; ties broken by name. */
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orderIdx: index('exercise_categories_order_idx').on(table.orderIndex),
  }),
);

export const exerciseCategoriesRelations = relations(exerciseCategories, ({ many }) => ({
  exercises: many(exercises),
}));

export type ExerciseCategory = typeof exerciseCategories.$inferSelect;
export type NewExerciseCategory = typeof exerciseCategories.$inferInsert;
