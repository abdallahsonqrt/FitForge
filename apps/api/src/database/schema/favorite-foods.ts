import { pgTable, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { foods } from './foods';

/**
 * Explicitly starred foods. Kept separate from `user_food_history` because the
 * two answer different questions: history is inferred from behaviour and decays
 * in relevance, a favourite is a deliberate choice that should stay pinned even
 * if it hasn't been eaten in a month.
 */
export const favoriteFoods = pgTable(
  'favorite_foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userFoodIdx: uniqueIndex('favorite_foods_user_food_idx').on(table.userId, table.foodId),
    userIdx: index('favorite_foods_user_idx').on(table.userId, table.createdAt.desc()),
  }),
);

export type FavoriteFood = typeof favoriteFoods.$inferSelect;
export type NewFavoriteFood = typeof favoriteFoods.$inferInsert;
