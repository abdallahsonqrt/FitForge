import { pgTable, uuid, varchar, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users, fitnessGoalEnum, experienceLevelEnum } from './users';
import { tierEnum } from './subscriptions';
import { workoutDays } from './workout-days';
import { difficultyEnum, trainingLocationEnum } from './enums';
import { coachProfiles } from './coach-profiles';
import { programWeeks } from './program-weeks';

/**
 * A training program.
 *
 * The same table serves three kinds of row, distinguished by which owner column
 * is set: a coach-authored program (`coachId`), a user's own plan (`userId`), and
 * a platform/system plan (neither). Both owner columns stay nullable for that
 * reason — a coach program has no single owning user.
 *
 * The eligibility columns (`targetGoals`, `targetLevels`, `requiredEquipment`,
 * `trainingLocations`) mirror the athlete columns on `users` and the supported
 * columns on `coach_profiles`, so recommending a program is an array comparison
 * rather than bespoke logic per field.
 */

/**
 * Publication state of a coach program. Only `published` programs are
 * discoverable; `draft` is the coach's workspace and `archived` keeps existing
 * enrollments working without accepting new ones.
 */
export const programVisibilityEnum = pgEnum('program_visibility', [
  'draft',
  'published',
  'archived',
]);

export const workoutPlans = pgTable(
  'workout_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owner for a personal plan. Null for coach programs and system plans. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Authoring coach. `set null` rather than cascade so a departing coach never
     * deletes programs athletes are mid-way through.
     */
    coachId: uuid('coach_id').references(() => coachProfiles.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    difficulty: difficultyEnum('difficulty'),
    tier: tierEnum('tier').notNull().default('free'),

    visibility: programVisibilityEnum('visibility').notNull().default('draft'),
    /** Length of the program in weeks; null for open-ended plans. */
    durationWeeks: integer('duration_weeks'),
    /** Sport or interest this program is for, matched against `users.sport`. */
    sport: varchar('sport', { length: 100 }),

    // ─── Eligibility, mirroring the athlete and coach columns ───
    targetGoals: fitnessGoalEnum('target_goals').array(),
    targetLevels: experienceLevelEnum('target_levels').array(),
    /** Equipment slugs the athlete must have, matching `equipment.slug`. */
    requiredEquipment: text('required_equipment').array(),
    trainingLocations: trainingLocationEnum('training_locations').array(),

    /** Standalone price. Null means the program is covered by the platform tier. */
    priceCents: integer('price_cents'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // The coach workspace listing: this coach's programs grouped by state.
    coachIdx: index('workout_plans_coach_idx').on(table.coachId, table.visibility),
    // Program discovery scans published rows only.
    visibilityIdx: index('workout_plans_visibility_idx').on(table.visibility),
  }),
);

export const workoutPlansRelations = relations(workoutPlans, ({ one, many }) => ({
  coach: one(coachProfiles, { fields: [workoutPlans.coachId], references: [coachProfiles.id] }),
  user: one(users, { fields: [workoutPlans.userId], references: [users.id] }),
  weeks: many(programWeeks),
  days: many(workoutDays),
}));

export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type NewWorkoutPlan = typeof workoutPlans.$inferInsert;
