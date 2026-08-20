import { z } from 'nestjs-zod/z';

/**
 * The kit an athlete can claim during onboarding. Slugs mirror `equipment.slug`
 * so matching an athlete against a coach or a program stays a plain string
 * comparison rather than a join.
 *
 * The list is pinned here rather than read from the `equipment` table because
 * the two answer different questions. `equipment` is the *exercise* catalogue —
 * it only contains rows some seeded exercise references — whereas an athlete
 * routinely owns kit (a kettlebell, resistance bands) or has access (a full gym)
 * that no catalogued exercise names yet. Validating against a `select slug from
 * equipment` would reject those legitimate answers, and would also make
 * onboarding fail outright in any environment where the catalogue has not been
 * seeded. Slugs that do exist in the catalogue are spelled identically to it.
 */
export const EQUIPMENT_SLUGS = [
  'bodyweight',
  'pull-up-bar',
  'parallel-bars',
  'dumbbells',
  'barbell',
  'kettlebell',
  'resistance-bands',
  'bench',
  'gym-access',
] as const;

export type EquipmentSlug = (typeof EQUIPMENT_SLUGS)[number];

/** Matches `users.training_location` / the `training_location` pg enum. */
export const TRAINING_LOCATIONS = ['home', 'gym', 'outdoors'] as const;

/** Shortest and longest session length worth offering a program for. */
export const MIN_SESSION_MINUTES = 10;
export const MAX_SESSION_MINUTES = 240;

/**
 * The columns coach and program matching compares against, shared by the
 * onboarding and profile-update DTOs.
 *
 * Every field is optional: onboarding may be submitted partially, and a client
 * built before these steps existed must keep working unchanged.
 */
export const athleteProfileFields = {
  /**
   * Free-form sport or interest — `calisthenics`, `powerlifting`, `boxing`. The
   * app sends slugs so the value stays stable enough to match on, but the column
   * is free text and is not constrained to a fixed list here.
   */
  sport: z.string().trim().min(1).max(100).optional(),
  trainingLocation: z.enum(TRAINING_LOCATIONS).optional(),
  availableEquipment: z
    .array(z.enum(EQUIPMENT_SLUGS))
    .max(EQUIPMENT_SLUGS.length)
    .refine((slugs) => new Set(slugs).size === slugs.length, {
      message: 'availableEquipment must not repeat a slug',
    })
    .optional(),
  sessionDurationMinutes: z
    .number()
    .int()
    .min(MIN_SESSION_MINUTES)
    .max(MAX_SESSION_MINUTES)
    .optional(),
  /** Health data — stored so a coach can see it, never surfaced publicly. */
  injuriesNotes: z.string().trim().max(2000).optional(),
};
