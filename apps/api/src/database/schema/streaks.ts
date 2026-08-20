import { pgTable, uuid, integer, date, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const streaks = pgTable(
  'streaks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    currentStreak: integer('current_streak').default(0).notNull(),
    longestStreak: integer('longest_streak').default(0).notNull(),
    lastActivityDate: date('last_activity_date'),
  },
  (table) => ({
    /**
     * One row per user. `getUserStreak` destructures `[streak]` from an
     * unbounded select, so a duplicate would make the answer depend on
     * whichever row the planner returned first — and the write path upserts
     * on this key.
     */
    userIdx: uniqueIndex('streaks_user_unique').on(table.userId),
  }),
);
