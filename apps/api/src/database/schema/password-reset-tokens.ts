import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * Outstanding password-reset tokens.
 *
 * The row holds a **sha256 digest**, never the token itself — the same rule the
 * `devices.refresh_token_hash` column follows. A database dump therefore does
 * not hand out working reset links, and the token exists in exactly one place:
 * the message sent to the address on file.
 *
 * Rows are kept after use rather than deleted so a consumed token is
 * distinguishable from one that never existed; `used_at` is what makes a token
 * single-use.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** sha256 hex of the issued token — 64 characters. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    /** Set the moment the token is redeemed; a second attempt finds it non-null. */
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    // The redeem path looks a token up by its digest and nothing else.
    tokenHashIdx: index('password_reset_tokens_hash_idx').on(table.tokenHash),
    // Requesting a new token invalidates the user's outstanding ones.
    userIdx: index('password_reset_tokens_user_idx').on(table.userId),
  }),
);

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
