import { pgTable, uuid, timestamp, date, real, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const weightLogs = pgTable(
  'weight_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    weightKg: real('weight_kg').notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // Every read is "this user's logs, newest first" -- progress.service.ts and
    // the coach client detail. Without this it is a sequential scan.
    userDateIdx: index('weight_logs_user_date_idx').on(table.userId, table.date.desc()),
  }),
);
