import { z } from 'zod';

/**
 * `POST /conversations` — open (or re-open) the caller's thread with a coach.
 *
 * A coach can be named either way round because both ids are in circulation: the
 * directory lists `coach_profiles.id`, while anything that already knows the
 * account — an enrollment, a previous thread — holds the `users.id`. Exactly one
 * must be given, so an inconsistent pair can never be silently resolved to one
 * of the two.
 */
export const startConversationSchema = z
  .object({
    /** `users.id` of the coach. */
    coachUserId: z.string().uuid().optional(),
    /** `coach_profiles.id`, as returned by the coach directory. */
    coachId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.coachUserId) !== Boolean(value.coachId), {
    message: 'Provide exactly one of coachUserId or coachId.',
    path: ['coachUserId'],
  });

export type StartConversationDto = z.infer<typeof startConversationSchema>;
