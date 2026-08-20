import { z } from 'zod';
import { FOOD_CATEGORIES, SERVING_UNITS } from '../types';

/**
 * `POST /foods/custom`.
 *
 * Nutrition is given per 100 g, matching how the catalogue stores everything —
 * so a custom food scales to any portion exactly like a seeded or ingested one,
 * with no special-casing anywhere downstream.
 */

const gramsField = (max: number) => z.number().min(0).max(max);

export const customFoodSchema = z.object({
  name: z.string().trim().min(2, 'Give the food a name.').max(255),
  brand: z.string().trim().max(255).optional(),
  category: z.enum(FOOD_CATEGORIES).default('other'),

  /** Per 100 g. Calories are derived from the macros when left out. */
  calories: gramsField(900).optional(),
  protein: gramsField(100).default(0),
  carbs: gramsField(100).default(0),
  fat: gramsField(100).default(0),
  fiber: gramsField(100).default(0),
  sugar: gramsField(100).default(0),
  sodium: gramsField(100_000).default(0),

  imageUrl: z.string().url().max(2000).optional(),

  /**
   * Named portions. Without at least one, the food falls back to category
   * averages for "1 piece" — fine for an apple, poor for a plate of mansaf.
   */
  servings: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        amount: z.number().positive().default(1),
        unit: z.enum(SERVING_UNITS).default('serving'),
        gramsPerUnit: z.number().positive().max(10_000),
        isDefault: z.boolean().optional(),
      }),
    )
    .max(10)
    .optional(),

  /** Localised names, e.g. `[{ language: 'ar', name: 'مسخن' }]`. */
  translations: z
    .array(
      z.object({
        language: z.string().trim().length(2, 'Use a two-letter language code.').toLowerCase(),
        name: z.string().trim().min(1).max(255),
      }),
    )
    .max(10)
    .optional(),

  /**
   * Admin-only. Adds the food to the shared catalogue rather than the creator's
   * private list — how regional dishes the providers do not carry get in.
   * Silently ignored for non-admins rather than rejected, so a client that sends
   * it does not break.
   */
  shared: z.boolean().default(false),
});

export type CustomFoodDto = z.infer<typeof customFoodSchema>;
