import { pgTable, uuid, integer, index, real, text, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workoutDays } from './workout-days';
import { exercises } from './exercises';

/**
 * One prescribed exercise inside a session.
 *
 * The original four columns (`sets`, `reps`, `restSeconds`, `orderIndex`) could
 * only express "3 × 10, rest 90". Real programming is written as ranges
 * ("8–12"), as time ("30s hold", "60s farmer carry"), with a tempo, an RPE
 * target, and a line of coaching text — so a coach building a program here had
 * no way to say what they actually meant.
 *
 * `reps` is therefore nullable now: a 30-second plank has a duration and no rep
 * count, and storing `0` or `1` to satisfy a NOT NULL would be a lie every
 * consumer would have to un-learn. The 44 pre-existing rows all carry a rep
 * count and are untouched — nullable widens what may be stored, it does not
 * invalidate anything already there.
 *
 * How the prescription is read, in order:
 *   `durationSeconds` → "hold/work for N seconds"
 *   `repsMin`/`repsMax` → "8–12 reps"
 *   `reps` → "10 reps"
 *   none of the above → whatever `notes` says ("AMRAP", "to failure")
 *
 * They are separate nullable columns rather than one free-text field because the
 * athlete app has to count sets and time rests against them.
 */
export const workoutExercises = pgTable(
  'workout_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dayId: uuid('day_id').notNull().references(() => workoutDays.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    sets: integer('sets').notNull(),
    /** Fixed rep target. Null when the set is prescribed as a range or by time. */
    reps: integer('reps'),
    /** Inclusive rep range, used instead of `reps` for "8–12". */
    repsMin: integer('reps_min'),
    repsMax: integer('reps_max'),
    /** Work time per set, for holds, carries and intervals. */
    durationSeconds: integer('duration_seconds'),
    restSeconds: integer('rest_seconds').notNull().default(60),
    /** Eccentric-pause-concentric-pause, written the way coaches write it: "3-1-1-0". */
    tempo: varchar('tempo', { length: 15 }),
    /** Rate of perceived exertion target, 1–10 in half steps. */
    rpe: real('rpe'),
    /** Coaching cue for this exercise in this session. */
    notes: text('notes'),
    orderIndex: integer('order_index').notNull(),
  },
  (table) => ({
    // Every read of this table is "the exercises of this day, in order" — the
    // plan detail screen and the builder both. Postgres does not index a foreign
    // key for you, so without this each session render is a sequential scan.
    dayIdx: index('workout_exercises_day_idx').on(table.dayId, table.orderIndex),
  }),
);

export const workoutExercisesRelations = relations(workoutExercises, ({ one }) => ({
  day: one(workoutDays, { fields: [workoutExercises.dayId], references: [workoutDays.id] }),
  exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
}));

export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type NewWorkoutExercise = typeof workoutExercises.$inferInsert;
