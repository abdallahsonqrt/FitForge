import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Enums shared by more than one table.
 *
 * Declaring a pgEnum twice would have drizzle-kit emit two `CREATE TYPE`
 * statements for the same Postgres type, so anything reused lives here and is
 * imported — never re-declared.
 */

/** Applies to both a workout plan and a single exercise. */
export const difficultyEnum = pgEnum('difficulty', ['beginner', 'intermediate', 'advanced']);

/**
 * Where training happens.
 *
 * Held by three tables so coach matching is a straight comparison: the athlete
 * records the one place they train (`users.training_location`), the coach and the
 * program each record the set they support (`coach_profiles.training_locations`,
 * `workout_plans.training_locations`).
 */
export const trainingLocationEnum = pgEnum('training_location', ['home', 'gym', 'outdoors']);
