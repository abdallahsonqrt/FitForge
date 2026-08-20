import { pgTable, uuid, timestamp, date, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const stepLogs = pgTable(
  'step_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    steps: integer('steps').notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index('step_logs_user_date_idx').on(table.userId, table.date),
  }),
);
