import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workoutPlans } from './workout-plans';
import { workoutDays } from './workout-days';

/**
 * One week of a coach program: the block a coach thinks in ("deload week",
 * "week 4 — intensification") and the unit an athlete's progress is measured in
 * via `enrollments.current_week`.
 *
 * Weeks sit between the plan and its days, but `workout_days.plan_id` stays as
 * it was and `workout_days.week_id` is nullable — every plan that existed before
 * programs keeps its flat list of days and needs no backfill.
 */
export const programWeeks = pgTable(
  'program_weeks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => workoutPlans.id, { onDelete: 'cascade' }),
    /** 1-based position in the program. */
    weekNumber: integer('week_number').notNull(),
    /** Optional label, e.g. "Deload". */
    title: varchar('title', { length: 255 }),
    /** Coach guidance for the week as a whole. */
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // The program outline: this plan's weeks, in order.
    planWeekIdx: index('program_weeks_plan_week_idx').on(table.planId, table.weekNumber),
  }),
);

export const programWeeksRelations = relations(programWeeks, ({ one, many }) => ({
  plan: one(workoutPlans, { fields: [programWeeks.planId], references: [workoutPlans.id] }),
  days: many(workoutDays),
}));

export type ProgramWeek = typeof programWeeks.$inferSelect;
export type NewProgramWeek = typeof programWeeks.$inferInsert;
