import { z } from 'zod';

export const LogWeightDtoSchema = z.object({
  weight: z.number().positive(),
  unit: z.enum(['kg', 'lbs']).default('kg'),
  date: z.string().datetime().optional(),
});

export type LogWeightDto = z.infer<typeof LogWeightDtoSchema>;
