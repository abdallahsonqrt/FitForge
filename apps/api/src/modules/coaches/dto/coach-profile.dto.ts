import { z } from 'zod';

/**
 * Coach profile validation.
 *
 * The schemas here are the write boundary for `coach_profiles`. Zod strips
 * unknown keys, which is what stops a coach from posting
 * `{ verificationStatus: 'verified' }` or a rating alongside their bio — those
 * columns are set by admin review and by the reviews system, never by the
 * subject of the review.
 */

/** Mirrors the `fitness_goal` Postgres enum. */
export const trainingGoalSchema = z.enum([
  'weight_loss',
  'muscle_gain',
  'maintenance',
  'endurance',
]);

/** Mirrors the `experience_level` Postgres enum. */
export const trainingLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

/** Mirrors the `training_location` Postgres enum. */
export const trainingLocationSchema = z.enum(['home', 'gym', 'outdoors']);

/** Mirrors the `program_visibility` Postgres enum. */
export const programVisibilitySchema = z.enum(['draft', 'published', 'archived']);

/** Lowercase, hyphenated. Shared by specialty and equipment slugs so they stay joinable. */
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase, hyphenated slug, e.g. "pull-up-bar".');

/** ISO 639-1 and friends: "en", "ar", "pt-BR". */
export const languageSchema = z.string().trim().min(2).max(10);

export const uuidSchema = z.string().uuid('That is not a valid id.');

/**
 * Certifications, stored as JSON on the profile. `documentUrl` is the proof the
 * admin reviews and is never returned to the public directory.
 */
export const coachCredentialSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  documentUrl: z.string().trim().url().max(2000).optional(),
});

/**
 * Everything a coach may set on their own profile.
 *
 * Every field is optional: a coach fills their storefront in over time, and a
 * PATCH that touches only `acceptingClients` must not require the whole object.
 */
export const coachProfileInputSchema = z.object({
  headline: z.string().trim().min(1).max(255).optional(),
  bio: z.string().trim().max(5000).optional(),
  specialties: z.array(slugSchema).max(20).optional(),

  supportedGoals: z.array(trainingGoalSchema).max(8).optional(),
  supportedLevels: z.array(trainingLevelSchema).max(3).optional(),
  supportedEquipment: z.array(slugSchema).max(40).optional(),
  trainingLocations: z.array(trainingLocationSchema).max(3).optional(),

  languages: z.array(languageSchema).max(10).optional(),
  timezone: z.string().trim().max(64).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(80).optional(),
  credentials: z.array(coachCredentialSchema).max(20).optional(),

  responseTimeHours: z.coerce.number().int().min(1).max(336).optional(),
  monthlyPriceCents: z.coerce.number().int().min(0).max(1_000_000).optional(),
  /** Null is allowed and means uncapped. */
  clientCapacity: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
  acceptingClients: z.boolean().optional(),
});

export type CoachProfileInputDto = z.infer<typeof coachProfileInputSchema>;

/**
 * `POST /coaches/apply`. A headline is required because an application with
 * nothing in it gives the reviewing admin nothing to review.
 */
export const applyAsCoachSchema = coachProfileInputSchema.extend({
  headline: z.string().trim().min(1).max(255),
});

export type ApplyAsCoachDto = z.infer<typeof applyAsCoachSchema>;

/** `PATCH /coaches/me`. Rejects `{}` rather than issuing a no-op UPDATE. */
export const updateCoachProfileSchema = coachProfileInputSchema.refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update.',
);

export type UpdateCoachProfileDto = z.infer<typeof updateCoachProfileSchema>;
