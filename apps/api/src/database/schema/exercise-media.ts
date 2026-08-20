import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  real,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { exercises } from './exercises';
import { users } from './users';

/**
 * Exercise media metadata.
 *
 * Bytes never enter Postgres. Every row here is a *pointer* — the provider that
 * holds the object plus the key that identifies it — and the object itself lives
 * in the bucket. That split is what lets the video be served straight from
 * Cloudflare's edge while the database stays small enough to index.
 *
 * `storageKey` is the durable identity; `publicUrl` is a cache of what the key
 * resolves to under the current public base URL and is null for private objects,
 * whose URLs are signed per request. Moving to another provider therefore means
 * copying objects and rewriting `provider`/`publicUrl` — the keys, and every
 * foreign key pointing at them, survive untouched.
 */

/** Which storage backend holds the object. Only the app's configured provider writes new rows. */
export const storageProviderEnum = pgEnum('storage_provider', ['r2', 's3', 'gcs', 'external']);

/**
 * Whether the object is world-readable at a stable URL or reachable only through
 * a short-lived signed URL.
 */
export const mediaVisibilityEnum = pgEnum('media_visibility', ['public', 'private']);

/**
 * Lifecycle of an upload. A row is `pending` from the moment a direct-upload URL
 * is issued, `processing` while the server probes it and cuts a thumbnail, and
 * only `ready` rows are ever served to the app.
 */
export const mediaStatusEnum = pgEnum('media_status', [
  'pending',
  'processing',
  'ready',
  'failed',
]);

/** `primary` is the instructional demo; `preview` is the short muted loop used in lists. */
export const exerciseVideoKindEnum = pgEnum('exercise_video_kind', [
  'primary',
  'preview',
  'alternate_angle',
]);

export const exerciseImageKindEnum = pgEnum('exercise_image_kind', [
  'thumbnail',
  'poster',
  'preview_gif',
  'illustration',
]);

// ─── Images ─────────────────────────────────────────────────

/**
 * Stills and animated previews: video thumbnails, posters, preview GIFs and
 * anatomical illustrations.
 *
 * Video thumbnails live here rather than as a URL column on the video so that a
 * thumbnail is a first-class object with its own storage key — which is what
 * makes replacing or deleting one able to clean up the bytes it left behind.
 */
export const exerciseImages = pgTable(
  'exercise_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),

    kind: exerciseImageKindEnum('kind').notNull().default('thumbnail'),

    provider: storageProviderEnum('provider').notNull().default('r2'),
    /** Object key inside the bucket — the identity the storage layer addresses. */
    storageKey: text('storage_key').notNull(),
    visibility: mediaVisibilityEnum('visibility').notNull().default('public'),
    /** Resolved URL for public objects; null when the object is private. */
    publicUrl: text('public_url'),

    width: integer('width'),
    height: integer('height'),
    fileSize: bigint('file_size', { mode: 'number' }),
    mimeType: varchar('mime_type', { length: 100 }),
    /** Hex SHA-256 of the uploaded bytes — integrity check and duplicate detection. */
    checksumSha256: varchar('checksum_sha256', { length: 64 }),

    /** Accessibility label for screen readers. */
    altText: varchar('alt_text', { length: 255 }),
    orderIndex: integer('order_index').notNull().default(0),
    status: mediaStatusEnum('status').notNull().default('ready'),

    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // One row per stored object: the guard that keeps deletes and re-uploads honest.
    storageKeyIdx: uniqueIndex('exercise_images_storage_key_idx').on(table.storageKey),
    // "Every image for this exercise, grouped by kind, in display order."
    exerciseKindIdx: index('exercise_images_exercise_kind_idx').on(
      table.exerciseId,
      table.kind,
      table.orderIndex,
    ),
  }),
);

// ─── Videos ─────────────────────────────────────────────────

/**
 * One stored video per row. An exercise may have several: the main demo, a short
 * muted preview loop, and alternate camera angles.
 *
 * Dimensions are recorded because the client needs the aspect ratio *before* the
 * first frame arrives — that is what stops the player from jumping between
 * portrait and landscape once playback starts.
 */
export const exerciseVideos = pgTable(
  'exercise_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),

    kind: exerciseVideoKindEnum('kind').notNull().default('primary'),
    /** Human label for alternate angles, e.g. "Side view". */
    label: varchar('label', { length: 120 }),

    provider: storageProviderEnum('provider').notNull().default('r2'),
    storageKey: text('storage_key').notNull(),
    visibility: mediaVisibilityEnum('visibility').notNull().default('public'),
    publicUrl: text('public_url'),

    /**
     * Poster frame for this video. `set null` on delete so removing a thumbnail
     * never takes the video with it.
     */
    thumbnailImageId: uuid('thumbnail_image_id').references(() => exerciseImages.id, {
      onDelete: 'set null',
    }),

    durationSeconds: real('duration_seconds'),
    width: integer('width'),
    height: integer('height'),
    fileSize: bigint('file_size', { mode: 'number' }),
    mimeType: varchar('mime_type', { length: 100 }),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),

    status: mediaStatusEnum('status').notNull().default('pending'),
    /** Why processing failed, surfaced to the admin who uploaded it. */
    errorMessage: text('error_message'),

    orderIndex: integer('order_index').notNull().default(0),

    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Set when the bytes actually landed in the bucket, not when the row was created. */
    uploadedAt: timestamp('uploaded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    storageKeyIdx: uniqueIndex('exercise_videos_storage_key_idx').on(table.storageKey),
    // The exercise screen's lookup: this exercise's ready videos, best first.
    exerciseKindIdx: index('exercise_videos_exercise_kind_idx').on(
      table.exerciseId,
      table.kind,
      table.orderIndex,
    ),
    // Lets the sweep for abandoned direct uploads scan by state, not by table.
    statusIdx: index('exercise_videos_status_idx').on(table.status, table.createdAt),
  }),
);

// ─── Relations ──────────────────────────────────────────────

export const exerciseImagesRelations = relations(exerciseImages, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseImages.exerciseId],
    references: [exercises.id],
  }),
  uploadedBy: one(users, {
    fields: [exerciseImages.uploadedById],
    references: [users.id],
  }),
}));

export const exerciseVideosRelations = relations(exerciseVideos, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseVideos.exerciseId],
    references: [exercises.id],
  }),
  thumbnail: one(exerciseImages, {
    fields: [exerciseVideos.thumbnailImageId],
    references: [exerciseImages.id],
  }),
  uploadedBy: one(users, {
    fields: [exerciseVideos.uploadedById],
    references: [users.id],
  }),
}));

export type ExerciseVideo = typeof exerciseVideos.$inferSelect;
export type NewExerciseVideo = typeof exerciseVideos.$inferInsert;
export type ExerciseImage = typeof exerciseImages.$inferSelect;
export type NewExerciseImage = typeof exerciseImages.$inferInsert;
