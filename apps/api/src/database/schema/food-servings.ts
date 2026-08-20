import {
  pgTable,
  uuid,
  varchar,
  real,
  boolean,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { foods } from './foods';

/**
 * Units a portion can be expressed in. `g`/`kg`/`ml`/`l` are measured directly;
 * the rest are counted ("2 slices") and only convert to grams via the
 * `gramsPerUnit` recorded on the serving row.
 */
export const servingUnitEnum = pgEnum('serving_unit', [
  'g',
  'kg',
  'ml',
  'l',
  'cup',
  'piece',
  'slice',
  'tablespoon',
  'teaspoon',
  'serving',
]);

/**
 * Named portions for a food — "1 breast", "1 cup, diced", "2 tbsp".
 *
 * `gramsPerUnit` is the bridge back to the per-100 g figures on `foods`: a
 * portion of `amount` × `unit` weighs `amount * gramsPerUnit` grams, and macros
 * scale from there. Storing the conversion per food rather than globally is what
 * lets "1 cup" mean 240 g of milk and 158 g of rice.
 */
export const foodServings = pgTable(
  'food_servings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),

    /** Display label, e.g. "1 medium banana" or "1 cup, cooked". */
    servingName: varchar('serving_name', { length: 120 }).notNull(),
    /** How many `unit`s this serving is. "2 slices" -> amount 2, unit 'slice'. */
    amount: real('amount').notNull().default(1),
    unit: servingUnitEnum('unit').notNull().default('g'),
    /** Grams in a single `unit`. The only thing that makes macros computable. */
    gramsPerUnit: real('grams_per_unit').notNull(),

    /** The portion preselected when the food is opened. At most one per food. */
    isDefault: boolean('is_default').notNull().default(false),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    foodIdx: index('food_servings_food_idx').on(table.foodId),
  }),
);

export type FoodServing = typeof foodServings.$inferSelect;
export type NewFoodServing = typeof foodServings.$inferInsert;
