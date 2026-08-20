import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, boolean, pgEnum, date, real } from 'drizzle-orm/pg-core';
// `text(...).array()` makes the inferred table type mention drizzle's `Column`,
// which declaration emit cannot name unless the file references it directly.
import type { Column } from 'drizzle-orm';
import { trainingLocationEnum } from './enums';

export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const fitnessGoalEnum = pgEnum('fitness_goal', ['weight_loss', 'muscle_gain', 'maintenance', 'endurance']);
export const experienceLevelEnum = pgEnum('experience_level', ['beginner', 'intermediate', 'advanced']);
export const activityLevelEnum = pgEnum('activity_level', ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active']);
export const unitSystemEnum = pgEnum('unit_system', ['metric', 'imperial']);
/**
 * `trainer` is legacy and predates the coach-centric model — `coach` supersedes
 * it. It stays because dropping a value from a Postgres enum is destructive and
 * existing rows may still carry it; new coaches get `coach`.
 */
export const roleEnum = pgEnum('role', ['user', 'admin', 'trainer', 'coach']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  avatarUrl: text('avatar_url'),
  gender: genderEnum('gender'),
  dateOfBirth: date('date_of_birth'),
  heightCm: real('height_cm'),
  weightKg: real('weight_kg'),
  fitnessGoal: fitnessGoalEnum('fitness_goal'),
  experienceLevel: experienceLevelEnum('experience_level'),
  activityLevel: activityLevelEnum('activity_level'),
  dietPreferences: jsonb('diet_preferences'),
  workoutFrequency: integer('workout_frequency'),

  // ─── Athlete profile: what coach/program matching compares against ───
  /** Free-form sport or interest: calisthenics, bodybuilding, powerlifting, running, boxing, football… */
  sport: varchar('sport', { length: 100 }),
  /** Where this athlete trains — matched against a coach's or program's supported locations. */
  trainingLocation: trainingLocationEnum('training_location'),
  /** Equipment slugs, matching `equipment.slug` — the athlete's kit, not a catalogue join. */
  availableEquipment: text('available_equipment').array(),
  /** Preferred session length; programs longer than this are a poor match. */
  sessionDurationMinutes: integer('session_duration_minutes'),
  /** Injuries and limitations, shown to the coach. Health data — treat as private. */
  injuriesNotes: text('injuries_notes'),

  unitSystem: unitSystemEnum('unit_system').default('metric'),
  language: varchar('language', { length: 10 }).default('en'),
  role: roleEnum('role').default('user'),
  onboardingComplete: boolean('onboarding_complete').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
