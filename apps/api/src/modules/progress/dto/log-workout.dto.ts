import { z } from 'zod';

/**
 * One completed set. `reps` and `weightKg` are optional because a bodyweight
 * exercise has no load, and a user may tick a set off without filling either in
 * — the row still records that the set was done.
 */
const setLogSchema = z.object({
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().positive(),
  reps: z.number().int().nonnegative().max(1000).optional(),
  weightKg: z.number().nonnegative().max(1000).optional(),
});

export const logWorkoutSchema = z.object({
  planId: z.string().uuid().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  completedAt: z.string().datetime().optional(),
  /**
   * The sets completed in this session. Optional so existing clients that post
   * only a summary keep working; capped so one request cannot insert unbounded
   * rows.
   */
  sets: z.array(setLogSchema).max(200).optional(),
});

export type LogWorkoutDto = z.infer<typeof logWorkoutSchema>;
export type SetLogInput = z.infer<typeof setLogSchema>;
