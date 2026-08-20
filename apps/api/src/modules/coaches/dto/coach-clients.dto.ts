import { z } from 'zod';

/**
 * Query validation for the coach's view of a client.
 *
 * There is no `athleteUserId` in any body here — it is a path parameter, and it
 * is checked against a live enrollment server-side before anything is read. A
 * body field would add a second place to get that wrong.
 */

/**
 * How much history the client detail screen pulls per series.
 *
 * Capped low on purpose: this is the "how are they doing" screen, not an export.
 * A coach with fifty clients opening it repeatedly should not be able to pull
 * years of logs by asking for them.
 */
export const clientDetailSchema = z.object({
  /** Rows per series — weight, measurements, workouts each get this many. */
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ClientDetailDto = z.infer<typeof clientDetailSchema>;

export const dashboardSchema = z.object({
  /** How many recent requests and activity entries to include. */
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type DashboardDto = z.infer<typeof dashboardSchema>;
