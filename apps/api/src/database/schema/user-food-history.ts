import { pgTable, uuid, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { foods } from './foods';
import { mealTypeEnum } from './meals';

/**
 * What each user actually eats. One row per user+food, bumped on every log —
 * this is the signal behind "recent foods" and the meal-time suggestions.
 *
 * Deliberately an upserted counter rather than an append-only event log: the
 * suggestion features only ever need the latest use and a frequency, and a
 * counter keeps that a single indexed read instead of an aggregation.
 */
export const userFoodHistory = pgTable(
  'user_food_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),

    lastUsed: timestamp('last_used').defaultNow().notNull(),
    usageCount: integer('usage_count').notNull().default(1),

    /**
     * Which meal this food is usually eaten at. Drives the time-of-day
     * suggestions ("coffee and eggs" at breakfast, not at dinner).
     */
    lastMealType: mealTypeEnum('last_meal_type'),
  },
  (table) => ({
    userFoodIdx: uniqueIndex('user_food_history_user_food_idx').on(table.userId, table.foodId),
    // Serves the "recent foods" list directly, newest first.
    recentIdx: index('user_food_history_recent_idx').on(table.userId, table.lastUsed.desc()),
    frequentIdx: index('user_food_history_frequent_idx').on(table.userId, table.usageCount.desc()),
  }),
);

export type UserFoodHistory = typeof userFoodHistory.$inferSelect;
export type NewUserFoodHistory = typeof userFoodHistory.$inferInsert;
