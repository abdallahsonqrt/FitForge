-- Session rows stop holding usable credentials.
--
-- `devices.refresh_token` held the raw JWT. A refresh token is a seven-day
-- credential for the account it belongs to, so anything that could read that one
-- column — a backup, a read replica, a logged query, an ORM dump, an SQL
-- injection anywhere in the product — walked away with a working session for
-- every signed-in user. The column now holds `sha256(token)` in hex: enough to
-- answer "is this the token I issued?", useless to anyone who reads it.
--
-- The column keeps its name. Renaming it to `refresh_token_hash` would be
-- clearer in isolation, but it is referenced by name from the regression suites
-- that guard this behaviour, and a rename buys nothing the TypeScript property
-- name (`refreshTokenHash`) and the comment below do not. Drizzle maps the two.
--
-- Existing rows cannot be migrated: the stored value is the plaintext token, and
-- hashing it in place would preserve exactly the credential this change is meant
-- to destroy for anyone who already has a copy of the old table. Every session
-- holding one is therefore dropped and its owner signs in again — the same
-- treatment, and the same reasoning, as `0007_auth_sessions.sql`.
--
-- Hand-written: drizzle's DSL expresses neither a data purge nor a column
-- comment, and the column type is unchanged so `generate` sees nothing to emit.

DELETE FROM "devices" WHERE "refresh_token" IS NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "devices"."refresh_token" IS
  'SHA-256 digest (hex) of the session''s current refresh token — never the token itself. Mapped as devices.refreshTokenHash in src/database/schema/devices.ts; compare with refreshTokenMatches() in modules/auth/auth.contract.ts.';--> statement-breakpoint

COMMENT ON COLUMN "devices"."device_id" IS
  'Client-generated identifier for the physical device, shared by sign-in and push registration. Not a push token: push addresses live in push_token.';--> statement-breakpoint

COMMENT ON COLUMN "devices"."push_token" IS
  'APNs/FCM/Expo push address for this device. An attribute of the row, never its identity.';
