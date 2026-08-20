import { pgTable, uuid, integer, boolean, primaryKey, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { exercises } from './exercises';
import { equipment } from './equipment';

/**
 * Exercise ⇄ equipment.
 *
 * `isRequired` separates the kit you cannot do the lift without (a barbell for a
 * back squat) from the optional extras (a belt, a bench), which is what lets the
 * "equipment I have" filter stay accurate instead of over-excluding.
 */
export const exerciseEquipment = pgTable(
  'exercise_equipment',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    isRequired: boolean('is_required').notNull().default(true),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.exerciseId, table.equipmentId] }),
    // Drives "every exercise I can do with dumbbells".
    equipmentIdx: index('exercise_equipment_equipment_idx').on(
      table.equipmentId,
      table.isRequired,
    ),
  }),
);

export const exerciseEquipmentRelations = relations(exerciseEquipment, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseEquipment.exerciseId],
    references: [exercises.id],
  }),
  equipment: one(equipment, {
    fields: [exerciseEquipment.equipmentId],
    references: [equipment.id],
  }),
}));

export type ExerciseEquipment = typeof exerciseEquipment.$inferSelect;
export type NewExerciseEquipment = typeof exerciseEquipment.$inferInsert;
