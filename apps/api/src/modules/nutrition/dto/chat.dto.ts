import { z } from 'zod';
import { mealTypeSchema, dateSchema } from './log-meal.dto';

/** `POST /nutrition/chat` */
export const chatSchema = z.object({
  message: z.string().trim().min(1, 'Say what you ate.').max(1000),

  /**
   * Continues an existing conversation. Omitted on the first turn — the service
   * then resumes today's open conversation if there is one, so the client does
   * not have to track the id to get follow-up context.
   */
  conversationId: z.string().uuid('conversationId must be a valid conversation id.').optional(),

  /** Overrides the slot inferred from the clock. */
  mealType: mealTypeSchema.optional(),

  /** The client's local day, so a late-night log lands on the right date. */
  date: dateSchema.optional(),

  /**
   * Commit the draft as soon as it is unambiguous, rather than returning it for
   * confirmation. The mobile logger sets this; a review-before-save UI would not.
   */
  autoCommit: z.boolean().default(true),
});

export type ChatDto = z.infer<typeof chatSchema>;

/** `POST /nutrition/chat/:id/commit` — save the draft the user has been building. */
export const commitSchema = z.object({
  mealType: mealTypeSchema.optional(),
  date: dateSchema.optional(),
});

export type CommitDto = z.infer<typeof commitSchema>;
