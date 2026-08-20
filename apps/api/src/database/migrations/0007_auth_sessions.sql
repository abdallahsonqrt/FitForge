-- Auth sessions: case-insensitive identities, one row per device, no stale tokens.
--
-- Three things happen here, in this order because each depends on the one before:
--
--   1. Email addresses are normalised to `trim(lower(...))` and any address that
--      existed twice under different casing is disambiguated, so that
--   2. a unique index on `lower(email)` can be created — the database guarantee
--      behind `AuthService`'s normalisation, without which two accounts for one
--      address can still be raced into existence.
--   3. Session rows are reset: refresh tokens issued before this migration were
--      signed with `JWT_SECRET` and carry no `typ`/`sid`/`jti` claims, so the new
--      `refresh()` cannot verify them. They are dead credentials; leaving them
--      would only consume slots against the 5-device cap.
--
-- Hand-written rather than generated: drizzle's DSL expresses neither a data
-- backfill nor a functional (`lower(...)`) index. The `devices_user_device_idx`
-- statement at the bottom is the generated part.

-- ─── 1. Normalise emails, disambiguating case-only duplicates ─────────
--
-- Within a group of addresses that differ only by case, the oldest row keeps the
-- address (it is the account people have actually been using) and every later
-- row gets a `+dupN` sub-address tag. Nothing is deleted: a renamed account is
-- still reachable by a support query, whereas a deleted one is gone. Anyone
-- affected recovers the address through password reset once the duplicate is
-- merged by hand.
-- Renaming runs first and on its own: `users_email_unique` is a plain,
-- non-deferrable constraint, so a single UPDATE that both lowercased the winner
-- and renamed the loser would trip it mid-statement on whichever row Postgres
-- happened to rewrite first.
WITH ranked AS (
  SELECT
    "id",
    trim(lower("email")) AS normalized,
    row_number() OVER (PARTITION BY trim(lower("email")) ORDER BY "created_at", "id") AS rn
  FROM "users"
)
UPDATE "users" AS u
-- `regexp_replace` without the `g` flag rewrites the first `@` only, which is
-- the separator: the local part may not contain an unquoted `@`.
SET "email" = regexp_replace(r.normalized, '@', '+dup' || r.rn || '@')
FROM ranked r
WHERE u."id" = r."id" AND r.rn > 1;
--> statement-breakpoint

UPDATE "users" SET "email" = trim(lower("email")) WHERE "email" <> trim(lower("email"));
--> statement-breakpoint

-- ─── 2. One account per address, regardless of case ───────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users" (lower("email"));--> statement-breakpoint

-- ─── 3. Drop sessions holding pre-rotation refresh tokens ─────────────
-- Rows registered for push notifications carry no refresh token and are kept.
DELETE FROM "devices" WHERE "refresh_token" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "devices_user_device_idx" ON "devices" USING btree ("user_id","device_id");
