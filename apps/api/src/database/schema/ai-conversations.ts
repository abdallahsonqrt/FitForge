import { pgTable, uuid, text, timestamp, jsonb, date, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { meals, mealTypeEnum } from './meals';

export const aiConversationStatusEnum = pgEnum('ai_conversation_status', [
  'active',
  'needs_clarification',
  'completed',
]);
export const aiMessageRoleEnum = pgEnum('ai_message_role', ['user', 'assistant']);

/**
 * One conversational meal-logging session.
 *
 * The conversation carries a *draft*: the items resolved so far and the question
 * currently awaiting an answer. That draft is what makes "add a banana" three
 * turns later mean anything — the model is given the draft alongside the recent
 * transcript, so pronouns and omissions resolve against real state rather than
 * against whatever it can infer from the text.
 *
 * `mealId` is set once the draft is committed. After that the same conversation
 * keeps working and edits apply to the saved meal, which is what lets "actually
 * make that 200 g" work after the meal is already in the log.
 */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    status: aiConversationStatusEnum('status').notNull().default('active'),

    /** Meal slot the draft targets. Inferred from the clock, overridable by the user. */
    mealType: mealTypeEnum('meal_type').notNull().default('snack'),

    /** Resolved items in the draft — see `DraftItem` in the nutrition module. */
    draftItems: jsonb('draft_items').notNull().default([]),

    /** The clarification awaiting an answer, when status is `needs_clarification`. */
    pendingQuestion: jsonb('pending_question'),

    /** The committed meal, once the draft has been logged. */
    mealId: uuid('meal_id').references(() => meals.id, { onDelete: 'set null' }),

    /** @deprecated Superseded by the `ai_messages` table. Retained, unused. */
    messages: jsonb('messages').default([]).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // "The user's most recent conversation for today" — the resume lookup.
    userDateIdx: index('ai_conversations_user_date_idx').on(table.userId, table.date.desc()),
  }),
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: aiMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // Transcript replay is always "this conversation, in order".
    conversationIdx: index('ai_messages_conversation_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  meal: one(meals, { fields: [aiConversations.mealId], references: [meals.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export type AiConversation = typeof aiConversations.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
