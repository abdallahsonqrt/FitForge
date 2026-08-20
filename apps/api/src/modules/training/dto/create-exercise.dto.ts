import { z } from 'zod';

/**
 * Exercise metadata validation.
 *
 * Media is *not* part of these payloads: a video is uploaded to
 * `POST /exercises/:id/videos`, never described in JSON. Keeping the two apart is
 * what stops a client from claiming a video exists at a URL nobody uploaded.
 */

export const difficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const muscleRoleSchema = z.enum(['primary', 'secondary', 'stabilizer']);

/** Lowercase, hyphenated, no leading or trailing hyphen. */
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase, hyphenated slug, e.g. "barbell-bench-press".');

/** An ordered list of short coaching lines (steps, tips, mistakes). */
const coachingList = (max: number) =>
  z.array(z.string().trim().min(1).max(500)).max(max).default([]);

/**
 * Muscles may be given as ids or slugs — a seeding script has ids, a human
 * writing JSON has slugs. Both resolve to the same catalogue row.
 */
const catalogueRef = z.union([z.string().uuid(), slugSchema]);

export const exerciseMuscleInputSchema = z.object({
  muscle: catalogueRef,
  role: muscleRoleSchema.default('primary'),
});

export const exerciseEquipmentInputSchema = z.object({
  equipment: catalogueRef,
  isRequired: z.boolean().default(true),
});

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  /** Derived from the name when omitted. */
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  category: catalogueRef.optional(),
  difficulty: difficultySchema.default('beginner'),

  instructions: coachingList(30),
  tips: coachingList(20),
  commonMistakes: coachingList(20),

  /**
   * Muscles accept the plain-slug shorthand as well as the object form, so
   * `["chest", {"muscle": "triceps", "role": "secondary"}]` is valid.
   */
  primaryMuscles: z.array(catalogueRef).max(10).default([]),
  secondaryMuscles: z.array(catalogueRef).max(15).default([]),
  stabilizerMuscles: z.array(catalogueRef).max(15).default([]),
  equipment: z.array(catalogueRef).max(10).default([]),

  defaultSets: z.coerce.number().int().min(1).max(20).default(3),
  defaultReps: z.coerce.number().int().min(1).max(500).default(10),
  defaultRestSeconds: z.coerce.number().int().min(0).max(900).default(90),

  isPublished: z.boolean().default(true),
});

export type CreateExerciseDto = z.infer<typeof createExerciseSchema>;

/** Every field optional; omitted relations are left alone rather than cleared. */
export const updateExerciseSchema = createExerciseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateExerciseDto = z.infer<typeof updateExerciseSchema>;

/**
 * Library browsing. `muscle`, `equipment` and `category` take slugs — the stable
 * keys a client can hard-code into filter chips.
 */
export const listExercisesSchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  category: slugSchema.optional(),
  muscle: slugSchema.optional(),
  equipment: slugSchema.optional(),
  difficulty: difficultySchema.optional(),
  /** Admin-only; ignored for everyone else. */
  includeUnpublished: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListExercisesDto = z.infer<typeof listExercisesSchema>;

export const exerciseIdSchema = z.string().uuid('That is not a valid exercise id.');

// ─── Taxonomy ───────────────────────────────────────────────

export const createCategorySchema = z.object({
  slug: slugSchema.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  orderIndex: z.coerce.number().int().min(0).max(999).default(0),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const createMuscleSchema = z.object({
  slug: slugSchema.optional(),
  name: z.string().trim().min(1).max(120),
  scientificName: z.string().trim().max(160).optional(),
  region: z.enum(['upper', 'core', 'lower', 'full_body']).default('upper'),
});

export type CreateMuscleDto = z.infer<typeof createMuscleSchema>;

export const createEquipmentSchema = z.object({
  slug: slugSchema.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  isBodyweight: z.boolean().default(false),
});

export type CreateEquipmentDto = z.infer<typeof createEquipmentSchema>;

/** `Barbell Bench Press` → `barbell-bench-press`. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}
