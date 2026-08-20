import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const mediaTypeEnum = pgEnum('media_type', ['image', 'video']);

/**
 * User-owned media: avatars and progress photos.
 *
 * Exercise media is *not* here — it lives in `exercise_videos` and
 * `exercise_images`, which carry the storage key, dimensions and upload state
 * that serving a video needs.
 */
export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: mediaTypeEnum('type').notNull(),
  url: text('url').notNull(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const mediaRelations = relations(media, ({ one }) => ({
  owner: one(users, { fields: [media.ownerId], references: [users.id] }),
}));
