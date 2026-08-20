import { z } from 'zod';
import { FOOD_CATEGORIES, SERVING_UNITS } from '../types';

/** ISO 639-1, optionally with a region tag ("ar", "en-GB"). */
const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[A-Za-z]{2})?$/, 'Use a two-letter language code, e.g. "en" or "ar".')
  // Only the base language selects a translation; the region is display-only.
  .transform((value) => value.slice(0, 2).toLowerCase());

export const foodCategorySchema = z.enum(FOOD_CATEGORIES);
export const servingUnitSchema = z.enum(SERVING_UNITS);

export const searchFoodSchema = z.object({
  query: z.string().trim().min(2, 'Enter at least two characters.').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  language: languageSchema.optional(),
  category: foodCategorySchema.optional(),
});

export type SearchFoodDto = z.infer<typeof searchFoodSchema>;

export const autocompleteSchema = z.object({
  // One character is enough here — autocomplete should react from the first key.
  query: z.string().trim().min(1, 'Enter at least one character.').max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  language: languageSchema.optional(),
});

export type AutocompleteDto = z.infer<typeof autocompleteSchema>;

export const browseCategorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  language: languageSchema.optional(),
});

export type BrowseCategoryDto = z.infer<typeof browseCategorySchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  language: languageSchema.optional(),
});

export type ListQueryDto = z.infer<typeof listQuerySchema>;

export const foodIdSchema = z.string().uuid('That is not a valid food id.');

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export const recordUsageSchema = z.object({
  mealType: mealTypeSchema.optional(),
});

export type RecordUsageDto = z.infer<typeof recordUsageSchema>;

/**
 * Portion the client wants nutrition for. `amount` + `unit` describe the
 * portion; the server converts to grams using the food's own conversions.
 */
export const portionSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero.').max(100000),
  unit: servingUnitSchema.default('g'),
});

export type PortionDto = z.infer<typeof portionSchema>;
