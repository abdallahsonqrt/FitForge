import { pgTable, uuid, varchar, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { coachProfiles } from './coach-profiles';
import { workoutPlans } from './workout-plans';

/**
 * The athlete↔coach↔program relationship, and the row every permission check
 * hangs off: a coach may read an athlete's logs, messages and progress only
 * while an enrollment joins them.
 *
 * `planId` is nullable and `set null` on delete because the relationship
 * outlives any single program — a coach can move a client onto a new program, or
 * hold them between programs, without the enrollment (and its history) ending.
 */
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'pending',
  'active',
  'paused',
  'completed',
  'canceled',
]);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteUserId: uuid('athlete_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    coachId: uuid('coach_id')
      .notNull()
      .references(() => coachProfiles.id, { onDelete: 'cascade' }),
    /** Program currently assigned. Null between programs. */
    planId: uuid('plan_id').references(() => workoutPlans.id, { onDelete: 'set null' }),

    status: enrollmentStatusEnum('status').notNull().default('pending'),
    /** Set when the coach accepts and training actually begins, not at request time. */
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    /** 1-based pointer into `program_weeks` — what "today's workout" resolves against. */
    currentWeek: integer('current_week').notNull().default(1),
    /** How the athlete arrived: 'onboarding', 'directory', 'invite', 'admin'. */
    source: varchar('source', { length: 50 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // "My coaches / my program" — read on nearly every athlete request.
    athleteIdx: index('enrollments_athlete_idx').on(table.athleteUserId, table.status),
    // The coach's client list.
    coachIdx: index('enrollments_coach_idx').on(table.coachId, table.status),
  }),
);

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  athlete: one(users, { fields: [enrollments.athleteUserId], references: [users.id] }),
  coach: one(coachProfiles, { fields: [enrollments.coachId], references: [coachProfiles.id] }),
  plan: one(workoutPlans, { fields: [enrollments.planId], references: [workoutPlans.id] }),
}));

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
