import { pgTable, uuid, integer, pgEnum, primaryKey, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { exercises } from './exercises';
import { muscles } from './muscles';

/**
 * How hard a muscle works in a movement. `primary` is what the exercise trains,
 * `secondary` assists, `stabilizer` only holds position.
 */
export const muscleRoleEnum = pgEnum('muscle_role', ['primary', 'secondary', 'stabilizer']);

/**
 * Exercise ⇄ muscle, carrying the role of each muscle in the lift.
 *
 * The composite primary key means a muscle appears at most once per exercise, so
 * "chest is both primary and secondary on the bench press" is unrepresentable.
 */
export const exerciseMuscles = pgTable(
  'exercise_muscles',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    muscleId: uuid('muscle_id')
      .notNull()
      .references(() => muscles.id, { onDelete: 'cascade' }),
    role: muscleRoleEnum('role').notNull().default('primary'),
    /** Display order within a role, so the listed muscles read in a deliberate order. */
    orderIndex: integer('order_index').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.exerciseId, table.muscleId] }),
    // Drives "every exercise that trains the lats", the muscle-filter query.
    muscleRoleIdx: index('exercise_muscles_muscle_role_idx').on(table.muscleId, table.role),
  }),
);

export const exerciseMusclesRelations = relations(exerciseMuscles, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseMuscles.exerciseId],
    references: [exercises.id],
  }),
  muscle: one(muscles, {
    fields: [exerciseMuscles.muscleId],
    references: [muscles.id],
  }),
}));

export type ExerciseMuscle = typeof exerciseMuscles.$inferSelect;
export type NewExerciseMuscle = typeof exerciseMuscles.$inferInsert;
