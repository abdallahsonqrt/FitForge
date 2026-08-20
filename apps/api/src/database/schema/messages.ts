import { pgTable, uuid, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { conversations } from './conversations';

/**
 * A single message in an athlete↔coach thread.
 *
 * `kind` is what lets the thread carry more than chat: a coach's request for a
 * form-check video, the athlete's reply video, a platform notice, and the AI's
 * summary of a week all live in the same ordered transcript, and the client
 * renders each differently. `body` doubles as the caption for the media kinds.
 */
export const messageKindEnum = pgEnum('message_kind', [
  'text',
  'form_review_request',
  'form_review_video',
  'system',
  'ai_summary',
]);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Author. `system` and `ai_summary` rows carry the account they were generated for. */
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: messageKindEnum('kind').notNull().default('text'),
    body: text('body'),
    /** Resolved URL of an attached video or image; the bytes live in object storage. */
    attachmentUrl: text('attachment_url'),
    /** Null until the other participant opens the thread past this message. */
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // Transcript replay and unread counts are both "this conversation, in order".
    conversationIdx: index('messages_conversation_idx').on(table.conversationId, table.createdAt),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
