import { z } from 'zod';

export const logStepsSchema = z.object({
  count: z.number().int().nonnegative(),
  date: z.string().datetime(),
});

export type LogStepsDto = z.infer<typeof logStepsSchema>;
