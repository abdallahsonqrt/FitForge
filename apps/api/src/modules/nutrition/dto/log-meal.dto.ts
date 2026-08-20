import { z } from 'zod';
import { SERVING_UNITS } from '../../food/types';
import { isDateKey } from '../../../common/pipes/parse-date-param.pipe';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const mealTypeSchema = z.enum(MEAL_TYPES);
export const servingUnitSchema = z.enum(SERVING_UNITS);

/**
 * `YYYY-MM-DD`. Accepts a full ISO timestamp and keeps the date part.
 *
 * The shape check alone is not enough: `2026-13-45` matches the pattern and then
 * reaches a Postgres `date` column, where it becomes a 500. `isDateKey` rejects
 * anything that is not a real calendar day, while still accepting the ones a
 * naive range check gets wrong — `2024-02-29` is valid, `2023-02-29` is not.
 * Refined after the transform, so it judges the sliced value rather than the
 * timestamp it may have arrived as.
 */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be in YYYY-MM-DD format.')
  .transform((value) => value.slice(0, 10))
  .refine(isDateKey, 'Date must be a real calendar date.');

/**
 * One item to log. Either a catalogue `foodId` — the normal path, where the
 * backend looks up the nutrition — or a bare `name` for something off-catalogue,
 * which logs with zero macros rather than a guess.
 */
export const mealItemInputSchema = z
  .object({
    foodId: z.string().uuid('foodId must be a valid food id.').optional(),
    name: z.string().min(1).max(255).optional(),
    quantity: z.number().positive('Quantity must be greater than zero.').default(1),
    unit: servingUnitSchema.default('serving'),
    /** Overrides the unit conversion when the client already knows the weight. */
    grams: z.number().positive().max(10_000).optional(),
  })
  .refine((item) => item.foodId || item.name, {
    message: 'Each item needs either a foodId or a name.',
  });

export type MealItemInput = z.infer<typeof mealItemInputSchema>;

export const logMealSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: mealTypeSchema.default('snack'),
  date: dateSchema.optional(),
  items: z.array(mealItemInputSchema).min(1, 'A meal needs at least one item.').max(50),
});

export type LogMealDto = z.infer<typeof logMealSchema>;

/**
 * The pre-existing `POST /meals` contract: one row of totals, no items. Kept
 * working for the shipped mobile client, whose calculator screen posts macros it
 * has already computed.
 */
export const legacyLogMealSchema = z.object({
  name: z.string().min(1).max(255),
  type: mealTypeSchema.default('snack'),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  date: z
    .string()
    .min(8)
    .transform((value) => value.slice(0, 10)),
});

export type LegacyLogMealDto = z.infer<typeof legacyLogMealSchema>;

/** `GET /nutrition/history?from=…&to=…&limit=…` */
export const historyQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(90).default(30),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '`from` must not be after `to`.',
  });

export type HistoryQueryDto = z.infer<typeof historyQuerySchema>;

/** `GET /nutrition/today?date=…` — `date` lets the client pass its own local day. */
export const dayQuerySchema = z.object({
  date: dateSchema.optional(),
});

export type DayQueryDto = z.infer<typeof dayQuerySchema>;
