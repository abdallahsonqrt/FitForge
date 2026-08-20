import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { enrollments } from './enrollments';
import { messages } from './messages';

/**
 * One thread per athlete↔coach pair.
 *
 * The pair is unique, not the enrollment: a client who finishes a program,
 * pauses, and comes back keeps a single continuous history rather than starting
 * a new thread each time. `enrollmentId` records which enrollment opened the
 * thread and is `set null` on delete so the conversation survives it.
 *
 * Both sides are `users.id` rather than one being a `coach_profiles.id` — the
 * sender of a message is an account, and keeping both columns in the same
 * namespace is what lets `messages.sender_user_id` be checked against either
 * participant with one comparison.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteUserId: uuid('athlete_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    coachUserId: uuid('coach_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Enrollment that opened the thread, when there was one. */
    enrollmentId: uuid('enrollment_id').references(() => enrollments.id, { onDelete: 'set null' }),
    /** Denormalised from `messages` so the inbox sorts without touching the message table. */
    lastMessageAt: timestamp('last_message_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // One thread per pair — the guard that stops a second thread being opened.
    pairIdx: uniqueIndex('conversations_pair_idx').on(table.athleteUserId, table.coachUserId),
    // The coach's inbox: their threads, most recently active first.
    coachInboxIdx: index('conversations_coach_inbox_idx').on(
      table.coachUserId,
      table.lastMessageAt.desc(),
    ),
    // The athlete's inbox.
    athleteInboxIdx: index('conversations_athlete_inbox_idx').on(
      table.athleteUserId,
      table.lastMessageAt.desc(),
    ),
  }),
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  athlete: one(users, { fields: [conversations.athleteUserId], references: [users.id] }),
  coach: one(users, { fields: [conversations.coachUserId], references: [users.id] }),
  enrollment: one(enrollments, {
    fields: [conversations.enrollmentId],
    references: [enrollments.id],
  }),
  messages: many(messages),
}));

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
