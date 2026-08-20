import { z } from 'zod';
import {
  programVisibilitySchema,
  slugSchema,
  trainingGoalSchema,
  trainingLevelSchema,
  trainingLocationSchema,
  uuidSchema,
} from './coach-profile.dto';

/**
 * Coach program-builder validation for `/coaches/me/programs`.
 *
 * `coachId` is deliberately absent from every schema below. Ownership comes from
 * the authenticated caller's coach profile, never from the request body — a
 * client that could name the owning coach could publish programs under someone
 * else's storefront.
 */

/** Mirrors `subscription_tier`: which membership covers this program. */
const programTierSchema = z.enum(['free', 'pro', 'elite', 'starter', 'coach', 'pro_coaching']);

export const createProgramSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  difficulty: trainingLevelSchema.optional(),
  tier: programTierSchema.optional(),
  /** New programs start as a draft; publishing is an explicit, separate action. */
  visibility: programVisibilitySchema.default('draft'),
  durationWeeks: z.coerce.number().int().min(1).max(104).optional(),
  sport: z.string().trim().max(100).optional(),

  // ─── Eligibility, mirroring the athlete's onboarding answers ───
  targetGoals: z.array(trainingGoalSchema).max(8).optional(),
  targetLevels: z.array(trainingLevelSchema).max(3).optional(),
  requiredEquipment: z.array(slugSchema).max(40).optional(),
  trainingLocations: z.array(trainingLocationSchema).max(3).optional(),

  /** Null means the program is covered by the platform tier rather than sold alone. */
  priceCents: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
});

export type CreateProgramDto = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = createProgramSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

export type UpdateProgramDto = z.infer<typeof updateProgramSchema>;

/** `?visibility=draft` on the coach's own program list. */
export const listOwnProgramsSchema = z.object({
  visibility: programVisibilitySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListOwnProgramsDto = z.infer<typeof listOwnProgramsSchema>;

// ─── Weeks ──────────────────────────────────────────────────

export const createWeekSchema = z.object({
  /** Defaults to the next free position, so building a program in order needs no bookkeeping. */
  weekNumber: z.coerce.number().int().min(1).max(104).optional(),
  title: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export type CreateWeekDto = z.infer<typeof createWeekSchema>;

export const updateWeekSchema = createWeekSchema.refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update.',
);

export type UpdateWeekDto = z.infer<typeof updateWeekSchema>;

/**
 * Reorder by listing every week id in its new order. A full list rather than a
 * pair of indices, so the result cannot depend on which reorder landed first.
 */
export const reorderWeeksSchema = z.object({
  weekIds: z.array(uuidSchema).min(1).max(104),
});

export type ReorderWeeksDto = z.infer<typeof reorderWeeksSchema>;

// ─── Days within a week ─────────────────────────────────────

export const createWeekDaySchema = z.object({
  dayName: z.string().trim().min(1).max(100),
  orderIndex: z.coerce.number().int().min(0).max(20).optional(),
});

export type CreateWeekDayDto = z.infer<typeof createWeekDaySchema>;

export const updateWeekDaySchema = z
  .object({
    dayName: z.string().trim().min(1).max(100).optional(),
    orderIndex: z.coerce.number().int().min(0).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

export type UpdateWeekDayDto = z.infer<typeof updateWeekDaySchema>;

/**
 * Attach existing plan days to this week, in order. Sets `workout_days.week_id`
 * and rewrites `order_index` to match the given sequence.
 */
export const attachWeekDaysSchema = z.object({
  dayIds: z.array(uuidSchema).min(1).max(21),
});

export type AttachWeekDaysDto = z.infer<typeof attachWeekDaysSchema>;

// ─── Exercises within a day ─────────────────────────────────

/**
 * The prescription for one exercise in one session.
 *
 * The shape mirrors `workout_exercises` after 0009, which exists because the
 * original four NOT NULL columns could only say "3 × 10". A coach writes
 * "8–12 @ RPE 8, tempo 3-1-1-0" or "3 × 30s hold", and the schema now has to let
 * them say exactly one of those things per row without inventing a rep count.
 *
 * `exerciseId` names a row in the global library. It is not re-validated for
 * ownership — the library is shared, and referencing a public exercise is not a
 * privilege. What *is* validated is that it exists and is published, so a
 * program cannot silently reference something athletes will never be shown.
 */
const prescriptionFields = {
  sets: z.coerce.number().int().min(1).max(20),
  /** A fixed rep target. Mutually exclusive with the range below. */
  reps: z.coerce.number().int().min(1).max(500).nullable().optional(),
  repsMin: z.coerce.number().int().min(1).max(500).nullable().optional(),
  repsMax: z.coerce.number().int().min(1).max(500).nullable().optional(),
  /** Work time per set — holds, carries, intervals. */
  durationSeconds: z.coerce.number().int().min(1).max(7200).nullable().optional(),
  restSeconds: z.coerce.number().int().min(0).max(3600).optional(),
  /** "3-1-1-0" — eccentric, pause, concentric, pause. */
  tempo: z
    .string()
    .trim()
    .max(15)
    .regex(/^[0-9X]{1,2}(-[0-9X]{1,2}){2,3}$/i, 'Write a tempo like "3-1-1-0" or "3-0-X-0".')
    .nullable()
    .optional(),
  /** Half steps only: 7.5 is a coaching instruction, 7.53 is a typo. */
  rpe: z.coerce
    .number()
    .min(1)
    .max(10)
    .refine((value) => Number.isInteger(value * 2), 'Use whole or half points, e.g. 8 or 7.5.')
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  orderIndex: z.coerce.number().int().min(0).max(100).optional(),
};

/**
 * A prescription has to say *something* about the work, and it must not say two
 * contradictory things. Enforced here rather than as a database CHECK so the
 * coach gets a sentence they can act on instead of a constraint-violation 500.
 */
const coherentPrescription = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine(
      (value: any) => !(value.reps != null && (value.repsMin != null || value.repsMax != null)),
      'Give either a fixed rep count or a rep range, not both.',
    )
    .refine(
      (value: any) => value.repsMin == null || value.repsMax == null || value.repsMin <= value.repsMax,
      'The low end of the rep range must not exceed the high end.',
    );

export const createDayExerciseSchema = coherentPrescription(
  z
    .object({ exerciseId: uuidSchema, ...prescriptionFields })
    .refine(
      (value) =>
        value.reps != null ||
        value.repsMin != null ||
        value.repsMax != null ||
        value.durationSeconds != null ||
        (value.notes != null && value.notes.length > 0),
      'Say how much work to do: reps, a rep range, a duration, or a note such as "AMRAP".',
    ),
);

export type CreateDayExerciseDto = z.infer<typeof createDayExerciseSchema>;

/**
 * A partial edit. `exerciseId` is absent: swapping which lift a row points at
 * silently rewrites what the athlete has been logging against it, so changing
 * the exercise means deleting the row and adding the new one.
 *
 * Every prescription field accepts `null` explicitly, which is how a coach
 * *clears* one — dropping a rep range in favour of a duration needs a way to say
 * "no longer a range", and an optional-only schema cannot express that.
 */
export const updateDayExerciseSchema = coherentPrescription(
  z
    .object({ ...prescriptionFields, sets: prescriptionFields.sets.optional() })
    .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.'),
);

export type UpdateDayExerciseDto = z.infer<typeof updateDayExerciseSchema>;

/**
 * Reorder by listing every exercise id of the day in its new order — the same
 * contract as `reorderWeeksSchema`, for the same reason: a partial reorder has
 * no single correct interpretation once two clients send one each.
 */
export const reorderDayExercisesSchema = z.object({
  exerciseIds: z.array(uuidSchema).min(1).max(100),
});

export type ReorderDayExercisesDto = z.infer<typeof reorderDayExercisesSchema>;
