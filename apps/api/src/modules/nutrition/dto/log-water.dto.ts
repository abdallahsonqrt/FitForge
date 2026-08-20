import { z } from 'zod';

export const logWaterSchema = z.object({
  amountMl: z.number().positive(),
  date: z.string().datetime(),
});

export type LogWaterDto = z.infer<typeof logWaterSchema>;
