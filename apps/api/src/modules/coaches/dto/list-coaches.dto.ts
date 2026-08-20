import { z } from 'zod';
import {
  languageSchema,
  slugSchema,
  trainingGoalSchema,
  trainingLevelSchema,
  trainingLocationSchema,
} from './coach-profile.dto';

/**
 * Coach directory query validation.
 *
 * These arrive as a query string, so everything coerces from text: a repeated
 * `?equipment=a&equipment=b` and a comma-joined `?equipment=a,b` are the same
 * filter, because both are what a client naturally sends from a chip group.
 */

/** Accepts `a,b`, repeated params, or a single value; yields a de-duplicated list. */
const csvList = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(','))
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).min(1).max(20))
    .transform((values) => [...new Set(values)] as z.infer<T>[]);

/** `?acceptingClients=true` — query strings have no booleans. */
const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const listCoachesSchema = z.object({
  /** The athlete's goal — matched against `coach_profiles.supported_goals`. */
  goal: csvList(trainingGoalSchema).optional(),
  level: csvList(trainingLevelSchema).optional(),
  /** Equipment slugs, matched against `coach_profiles.supported_equipment`. */
  equipment: csvList(slugSchema).optional(),
  trainingLocation: csvList(trainingLocationSchema).optional(),
  /** Matched against `coach_profiles.specialties`, where sports live as slugs. */
  sport: csvList(slugSchema).optional(),
  language: csvList(languageSchema).optional(),
  acceptingClients: booleanish.optional(),

  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListCoachesDto = z.infer<typeof listCoachesSchema>;

/** `GET /coaches/recommended?limit=5` — the onboarding recommendation step. */
export const recommendCoachesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type RecommendCoachesDto = z.infer<typeof recommendCoachesSchema>;
