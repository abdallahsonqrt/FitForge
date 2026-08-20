import { z } from 'zod';

export const LogMeasurementDtoSchema = z.object({
  bodyPart: z.enum(['chest', 'arms', 'waist', 'legs']),
  value: z.number().positive(),
  unit: z.enum(['cm', 'in']).default('cm'),
  date: z.string().datetime().optional(),
});

export type LogMeasurementDto = z.infer<typeof LogMeasurementDtoSchema>;
