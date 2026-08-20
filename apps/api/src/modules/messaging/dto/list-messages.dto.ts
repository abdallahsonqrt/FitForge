import { z } from 'zod';

export const DEFAULT_MESSAGE_PAGE_SIZE = 30;
export const MAX_MESSAGE_PAGE_SIZE = 100;

/**
 * `GET /conversations/:id/messages?limit=30&cursor=…`
 *
 * Query strings arrive as an untyped string map, so this is parsed with
 * `parseOrThrow` rather than attached as a pipe — see `common/zod`.
 */
export const listMessagesSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MESSAGE_PAGE_SIZE)
    .default(DEFAULT_MESSAGE_PAGE_SIZE),
  /** Opaque token from a previous page's `nextCursor`. */
  cursor: z.string().min(1).optional(),
});

export type ListMessagesDto = z.infer<typeof listMessagesSchema>;
