import { pgTable, uuid, varchar, real, index, timestamp } from 'drizzle-orm/pg-core';
import { meals } from './meals';
import { foods } from './foods';
import { servingUnitEnum } from './food-servings';

/**
 * One food within a meal.
 *
 * The nutrition columns are a *snapshot*, computed at log time from the food's
 * per-100 g figures and this row's `grams`. They are stored rather than derived
 * on read so that correcting a catalogue entry — or a provider revising its
 * data — never silently rewrites what someone ate last month.
 *
 * `foodId` keeps the link back to the catalogue for editing ("make the chicken
 * 200 g" has to rescale from the original per-100 g basis) and is nullable so a
 * food the user described but we could not resolve is still loggable.
 */
export const mealItems = pgTable(
  'meal_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),

    /** Catalogue entry this came from. Null when logged as free text. */
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),

    /** Name as shown to the user — the catalogue name, or what they typed. */
    name: varchar('name', { length: 255 }).notNull(),

    // ─── Portion ───────────────────────────────────────────
    /** How many `unit`s. "2 slices" -> quantity 2, unit 'slice'. */
    quantity: real('quantity').notNull().default(1),
    unit: servingUnitEnum('unit').notNull().default('serving'),
    /** Resolved weight. The single number every macro below was scaled from. */
    grams: real('grams').notNull().default(0),

    // ─── Nutrition snapshot for `grams` ────────────────────
    calories: real('calories').notNull().default(0),
    protein: real('protein').notNull().default(0),
    carbs: real('carbs').notNull().default(0),
    fat: real('fat').notNull().default(0),
    fiber: real('fiber').notNull().default(0),
    sugar: real('sugar').notNull().default(0),
    sodium: real('sodium').notNull().default(0),

    /** Human label for the portion, e.g. "2 slices (60 g)". */
    servingSize: varchar('serving_size', { length: 100 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    mealIdx: index('meal_items_meal_idx').on(table.mealId),
    foodIdx: index('meal_items_food_idx').on(table.foodId),
  }),
);

export type MealItem = typeof mealItems.$inferSelect;
export type NewMealItem = typeof mealItems.$inferInsert;
