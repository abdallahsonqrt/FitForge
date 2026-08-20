import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { exerciseEquipment } from './exercise-equipment';

/**
 * The equipment catalogue — barbell, dumbbells, cable machine, bodyweight.
 *
 * `isBodyweight` lets "what can I do with no kit?" be a single indexed filter
 * instead of a hard-coded name check.
 */
export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stable filter key, e.g. `cable-machine`. */
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  /** True for "Bodyweight" and other no-equipment entries. */
  isBodyweight: boolean('is_bodyweight').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const equipmentRelations = relations(equipment, ({ many }) => ({
  exercises: many(exerciseEquipment),
}));

export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
