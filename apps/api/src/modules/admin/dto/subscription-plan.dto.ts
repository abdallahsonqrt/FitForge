import { z } from 'zod';

/**
 * `POST|PUT /admin/plans` — the subscription-plan catalogue.
 *
 * These routes previously took `@Body() data: any` straight into
 * `.values(data)` / `.set(data)`, which allowed mass assignment of `id` and
 * `createdAt` and accepted a negative price or an unknown tier. Admin-only, but
 * the sibling `POST /plans` already validates, so this was an inconsistency
 * rather than a deliberate escape hatch.
 *
 * Every field maps to a column on `subscription_plans`; `id` and `createdAt` are
 * deliberately absent so they stay database-assigned.
 */
export const createSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(1).max(255),
  tier: z.enum(['free', 'pro', 'elite', 'starter', 'coach', 'pro_coaching']),
  /** Stored in cents, so a whole number and never negative. */
  priceCents: z.number().int().min(0).default(0),
  deviceLimit: z.number().int().min(1).default(1),
  aiLogLimit: z.number().int().min(0).default(5),
  coachAccess: z.enum(['none', 'messaging', 'priority']).default('none'),
  formReviews: z.boolean().default(false),
  scheduledCheckIns: z.boolean().default(false),
});

/** A PUT that carries only the fields being changed; rejects an empty body. */
export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type CreateSubscriptionPlanDto = z.infer<typeof createSubscriptionPlanSchema>;
export type UpdateSubscriptionPlanDto = z.infer<typeof updateSubscriptionPlanSchema>;
