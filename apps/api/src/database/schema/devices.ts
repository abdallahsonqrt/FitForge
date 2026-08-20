import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceId: varchar('device_id', { length: 255 }),
    deviceName: varchar('device_name', { length: 255 }),
    platform: varchar('platform', { length: 50 }),
    /**
     * The push-notification address for this device, when it has registered for
     * one. An *attribute* of the device, deliberately not its identity — keying
     * rows on it is what let one phone occupy two rows (one from signing in, one
     * from registering for push) and count twice against the device limit.
     */
    pushToken: text('push_token'),
    /**
     * SHA-256 of the session's current refresh token, hex — never the token.
     *
     * The column keeps its `refresh_token` name (migration `0008` explains why
     * renaming it was not worth the churn); the property does not, so that no
     * caller can mistake it for something presentable to a client. Compare with
     * `refreshTokenMatches()` in `auth.contract.ts`.
     */
    refreshTokenHash: text('refresh_token'),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    lastActive: timestamp('last_active').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    /**
     * One row per (user, device) — a session, not a login event.
     *
     * `AuthService.startSession()` upserts on this index, so signing in again on
     * a device the user already has re-uses its row instead of appending a new
     * one. Without it every login added a row and the device cap then evicted
     * the user's other real devices.
     *
     * Postgres treats NULLs as distinct, so legacy rows carrying no `device_id`
     * are unaffected by the constraint.
     */
    userDeviceIdx: uniqueIndex('devices_user_device_idx').on(table.userId, table.deviceId),
  }),
);
