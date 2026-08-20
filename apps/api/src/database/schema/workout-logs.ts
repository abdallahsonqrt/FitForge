import { pgTable, uuid, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { workoutPlans } from './workout-plans';
import { setLogs } from './set-logs';

export const workoutLogs = pgTable(
  'workout_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => workoutPlans.id, { onDelete: 'set null' }),
    durationSeconds: integer('duration_seconds'),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  },
  (table) => ({
    // Read by workout history and, per client, by the coach dashboard's recent
    // activity feed -- which scanned this table once per dashboard load.
    userCompletedIdx: index('workout_logs_user_completed_idx').on(
      table.userId,
      table.completedAt.desc(),
    ),
  }),
);

export const workoutLogsRelations = relations(workoutLogs, ({ one, many }) => ({
  user: one(users, { fields: [workoutLogs.userId], references: [users.id] }),
  plan: one(workoutPlans, { fields: [workoutLogs.planId], references: [workoutPlans.id] }),
  sets: many(setLogs),
}));