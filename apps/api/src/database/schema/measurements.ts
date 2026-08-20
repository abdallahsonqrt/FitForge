import { pgTable, uuid, date, real, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const measurements = pgTable(
  'measurements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    chestCm: real('chest_cm'),
    armsCm: real('arms_cm'),
    waistCm: real('waist_cm'),
    legsCm: real('legs_cm'),
    date: date('date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index('measurements_user_date_idx').on(table.userId, table.date.desc()),
  }),
);
