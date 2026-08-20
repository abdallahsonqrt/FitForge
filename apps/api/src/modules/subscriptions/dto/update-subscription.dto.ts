import { z } from 'zod';

export const UpdateSubscriptionDtoSchema = z.object({
  planId: z.string().uuid(),
});

export type UpdateSubscriptionDto = z.infer<typeof UpdateSubscriptionDtoSchema>;
