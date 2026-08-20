import { z } from 'zod';

/**
 * `POST /plans` — the platform's own catalogue, written by an admin.
 *
 * `tier` is accepted here where it would be a privilege-escalation hole on any
 * other route, because the only caller is `@Roles('admin')`. Coaches author
 * through `/coaches/me/programs`, where the owning coach comes from the token
 * and never from the body.
 */
export const createPlanSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  tier: z.enum(['free', 'pro', 'elite', 'starter', 'coach', 'pro_coaching']).default('free'),
  /**
   * Defaults to `published` rather than `draft`, unlike a coach program. A
   * platform plan has no builder UI and no update route to flip it later, so a
   * draft default would create rows nothing could ever reach. Passing `draft`
   * explicitly still works for staging content.
   */
  visibility: z.enum(['draft', 'published', 'archived']).default('published'),
});

export type CreatePlanDto = z.infer<typeof createPlanSchema>;
