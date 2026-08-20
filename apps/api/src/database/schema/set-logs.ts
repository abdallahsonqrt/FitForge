import { pgTable, uuid, integer, real, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workoutLogs } from './workout-logs';
import { exercises } from './exercises';

/**
 * One row per set the athlete actually completed during a session.
 *
 * `workout_logs` records that a session happened and how long it took; the reps
 * and load per set live here. The active-workout screen collected both and had
 * nowhere to send them, so every set a user logged was discarded on save.
 *
 * `exerciseId` is `set null` rather than `cascade`: deleting an exercise from
 * the catalogue must not erase somebody's training history.
 */
export const setLogs = pgTable(
  'set_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workoutLogId: uuid('workout_log_id')
      .notNull()
      .references(() => workoutLogs.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
    /** 1-based position within the exercise, as shown in the UI. */
    setNumber: integer('set_number').notNull(),
    reps: integer('reps'),
    /** Always stored metric; the client converts for display. */
    weightKg: real('weight_kg'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // Sets are only ever read as "all sets for this log".
    workoutLogIdx: index('set_logs_workout_log_idx').on(table.workoutLogId),
  }),
);

export const setLogsRelations = relations(setLogs, ({ one }) => ({
  workoutLog: one(workoutLogs, {
    fields: [setLogs.workoutLogId],
    references: [workoutLogs.id],
  }),
  exercise: one(exercises, { fields: [setLogs.exerciseId], references: [exercises.id] }),
}));

export type SetLog = typeof setLogs.$inferSelect;
export type NewSetLog = typeof setLogs.$inferInsert;
