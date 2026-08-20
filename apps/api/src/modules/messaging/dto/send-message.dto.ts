import { z } from 'zod';

const MAX_BODY_LENGTH = 4000;
const MAX_URL_LENGTH = 2048;

/**
 * `POST /conversations/:id/messages`.
 *
 * The schema checks only shape: what each `kind` actually requires, and which
 * kinds an end user may author at all, is decided by `MessagingService` so that
 * one rule governs both the HTTP route and any internal caller. `kind` therefore
 * accepts every value of the Postgres enum here and is rejected later — a
 * request asking for `system` gets an explicit refusal rather than a generic
 * "invalid enum value".
 */
export const sendMessageSchema = z.object({
  kind: z
    .enum(['text', 'form_review_request', 'form_review_video', 'system', 'ai_summary'])
    .default('text'),
  body: z.string().trim().max(MAX_BODY_LENGTH).optional(),
  attachmentUrl: z.string().url().max(MAX_URL_LENGTH).optional(),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;
