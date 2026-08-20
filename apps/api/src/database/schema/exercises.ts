import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { difficultyEnum } from './enums';
import { exerciseCategories } from './exercise-categories';
import { exerciseMuscles } from './exercise-muscles';
import { exerciseEquipment } from './exercise-equipment';
import { exerciseVideos, exerciseImages } from './exercise-media';

/**
 * The exercise library.
 *
 * Everything with its own identity is a table of its own — category, muscles,
 * equipment, videos, images — so the same muscle or piece of kit is one row that
 * many exercises point at. The three coaching lists below stay as ordered JSON
 * arrays instead: a step, a tip and a mistake are never referenced from
 * elsewhere, never filtered on, and only ever read as a whole with their
 * exercise, so giving each its own row and join would buy nothing.
 */
export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable, URL-safe key derived from the name, e.g. `barbell-bench-press`. */
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    /** One or two sentences on what the movement is and what it is for. */
    description: text('description'),

    categoryId: uuid('category_id').references(() => exerciseCategories.id, {
      onDelete: 'set null',
    }),
    difficulty: difficultyEnum('difficulty').notNull().default('beginner'),

    /** Ordered "how to perform" steps. */
    instructions: jsonb('instructions').$type<string[]>().notNull().default([]),
    /** Coaching cues that improve the lift. */
    tips: jsonb('tips').$type<string[]>().notNull().default([]),
    /** The errors to call out — what people get wrong, and why it matters. */
    commonMistakes: jsonb('common_mistakes').$type<string[]>().notNull().default([]),

    /**
     * Prescription to show when the exercise is viewed outside a plan. Inside a
     * plan, `workout_exercises` overrides all three.
     */
    defaultSets: integer('default_sets').notNull().default(3),
    defaultReps: integer('default_reps').notNull().default(10),
    defaultRestSeconds: integer('default_rest_seconds').notNull().default(90),

    /** Drafts stay out of the app until an admin publishes them. */
    isPublished: boolean('is_published').notNull().default(true),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // The library list is "published exercises, alphabetical" — a covered scan.
    publishedNameIdx: index('exercises_published_name_idx').on(table.isPublished, table.name),
    categoryIdx: index('exercises_category_idx').on(table.categoryId),
    difficultyIdx: index('exercises_difficulty_idx').on(table.difficulty),
    // NOTE: `name` also carries a GIN/gin_trgm_ops index for fuzzy search, which
    // the Drizzle DSL cannot express. It is created in `0003_exercise_media.sql`
    // and deliberately absent here — declaring it as a plain btree would make
    // drizzle-kit swap the real index for a useless one on the next generate.
  }),
);

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  category: one(exerciseCategories, {
    fields: [exercises.categoryId],
    references: [exerciseCategories.id],
  }),
  muscles: many(exerciseMuscles),
  equipment: many(exerciseEquipment),
  videos: many(exerciseVideos),
  images: many(exerciseImages),
}));

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
