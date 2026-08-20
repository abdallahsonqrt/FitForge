import { pgTable, uuid, timestamp, date, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const waterLogs = pgTable(
  'water_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    amountMl: integer('amount_ml').notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // Looked up by exact (user, date) on every dashboard load.
    userDateIdx: index('water_logs_user_date_idx').on(table.userId, table.date),
  }),
);
