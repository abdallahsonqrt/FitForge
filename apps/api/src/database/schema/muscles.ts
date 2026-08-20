import { pgTable, uuid, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { exerciseMuscles } from './exercise-muscles';

/** Coarse anatomical region, used to group the muscle picker and body-map filters. */
export const bodyRegionEnum = pgEnum('body_region', ['upper', 'core', 'lower', 'full_body']);

/**
 * The muscle catalogue. One row per muscle the library can target, referenced by
 * `exercise_muscles` — so renaming "Quadriceps" or adding a new muscle is a
 * single update rather than a text migration across every exercise.
 */
export const muscles = pgTable(
  'muscles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable filter key, e.g. `lats`. */
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Anatomical name shown as a subtitle, e.g. "Latissimus dorsi". */
    scientificName: varchar('scientific_name', { length: 160 }),
    region: bodyRegionEnum('region').notNull().default('upper'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    regionIdx: index('muscles_region_idx').on(table.region),
  }),
);

export const musclesRelations = relations(muscles, ({ many }) => ({
  exercises: many(exerciseMuscles),
}));

export type Muscle = typeof muscles.$inferSelect;
export type NewMuscle = typeof muscles.$inferInsert;
