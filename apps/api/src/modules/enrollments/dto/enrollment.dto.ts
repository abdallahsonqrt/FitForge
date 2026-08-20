import { z } from 'zod';

/**
 * Enrollment validation.
 *
 * `athleteUserId` is absent by design: an athlete enrols themselves, and the id
 * comes from the token. Accepting it in the body would let anyone enrol anyone
 * else with a coach.
 */

const uuid = z.string().uuid('That is not a valid id.');

/** Mirrors the `enrollment_status` Postgres enum. */
export const enrollmentStatusSchema = z.enum([
  'pending',
  'active',
  'paused',
  'completed',
  'canceled',
]);

export type EnrollmentStatusDto = z.infer<typeof enrollmentStatusSchema>;

export const createEnrollmentSchema = z.object({
  coachId: uuid,
  /** The program to start on. Nullable: a coach can be engaged before a plan is chosen. */
  planId: uuid.nullable().optional(),
  /** How the athlete arrived, for funnel reporting. */
  source: z.enum(['onboarding', 'directory', 'invite', 'admin']).optional(),
});

export type CreateEnrollmentDto = z.infer<typeof createEnrollmentSchema>;

/**
 * `PATCH /enrollments/:id`.
 *
 * Status and program are the only mutable fields. `currentWeek` advances from
 * logged workouts rather than from a client asserting its own progress.
 */
export const updateEnrollmentSchema = z
  .object({
    status: enrollmentStatusSchema.optional(),
    planId: uuid.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

export type UpdateEnrollmentDto = z.infer<typeof updateEnrollmentSchema>;

export const listEnrollmentsSchema = z.object({
  status: enrollmentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListEnrollmentsDto = z.infer<typeof listEnrollmentsSchema>;

export const enrollmentIdSchema = uuid;
