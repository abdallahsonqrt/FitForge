import {
  pgTable,
  uuid,
  varchar,
  date,
  real,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { mealItems } from './meal-items';

export const mealTypeEnum = pgEnum('meal_type', ['breakfast', 'lunch', 'dinner', 'snack']);

/** How the meal got logged — lets the client badge AI entries and aids analytics. */
export const mealSourceEnum = pgEnum('meal_source', ['manual', 'ai', 'quick']);

/**
 * A logged meal. The macro columns are the sum of its `meal_items` and are
 * maintained by the service on every write, so reading a day's totals never
 * requires joining and aggregating the items.
 */
export const meals = pgTable(
  'meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: mealTypeEnum('type').notNull(),
    source: mealSourceEnum('source').notNull().default('manual'),

    // Rolled up from `meal_items`.
    calories: real('calories').notNull().default(0),
    protein: real('protein').notNull().default(0),
    carbs: real('carbs').notNull().default(0),
    fat: real('fat').notNull().default(0),
    fiber: real('fiber').notNull().default(0),
    sugar: real('sugar').notNull().default(0),
    sodium: real('sodium').notNull().default(0),

    date: date('date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Serves both "today" and the history range scan, newest first.
    userDateIdx: index('meals_user_date_idx').on(table.userId, table.date.desc()),
  }),
);

export const mealsRelations = relations(meals, ({ one, many }) => ({
  user: one(users, { fields: [meals.userId], references: [users.id] }),
  items: many(mealItems),
}));

export const mealItemsRelations = relations(mealItems, ({ one }) => ({
  meal: one(meals, { fields: [mealItems.mealId], references: [meals.id] }),
}));

export type Meal = typeof meals.$inferSelect;
export type NewMeal = typeof meals.$inferInsert;
