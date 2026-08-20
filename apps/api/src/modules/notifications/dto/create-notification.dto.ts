import { z } from 'zod';

export const CreateNotificationDtoSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string().default('general'),
  userId: z.string(),
});

export type CreateNotificationDto = z.infer<typeof CreateNotificationDtoSchema>;
