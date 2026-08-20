import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workoutPlans } from './workout-plans';
import { workoutExercises } from './workout-exercises';
import { programWeeks } from './program-weeks';

export const workoutDays = pgTable('workout_days', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => workoutPlans.id, { onDelete: 'cascade' }),
  /**
   * Week this day belongs to, for coach programs. Nullable: plans written before
   * programs existed have days hanging directly off `plan_id`, and they keep
   * working untouched.
   */
  weekId: uuid('week_id').references(() => programWeeks.id, { onDelete: 'cascade' }),
  dayName: varchar('day_name', { length: 100 }).notNull(),
  orderIndex: integer('order_index').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workoutDaysRelations = relations(workoutDays, ({ one, many }) => ({
  plan: one(workoutPlans, { fields: [workoutDays.planId], references: [workoutPlans.id] }),
  week: one(programWeeks, { fields: [workoutDays.weekId], references: [programWeeks.id] }),
  exercises: many(workoutExercises),
}));

export type WorkoutDay = typeof workoutDays.$inferSelect;
export type NewWorkoutDay = typeof workoutDays.$inferInsert;
