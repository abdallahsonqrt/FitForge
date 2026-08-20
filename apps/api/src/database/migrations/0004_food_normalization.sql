-- Food normalisation layer.
--
-- Adds the reader-facing projection of a food alongside the provider's own name.
-- `foods.name` stays exactly as the source wrote it — "Eggs, Grade A, Large, egg
-- whole" — and the columns below carry what a person should actually see:
-- "Whole Egg", 🥚, grouped under "Eggs".
--
-- Every column is derived at write time by `normalization/food-normalizer.ts`,
-- not computed per query: search results are read far more often than foods are
-- ingested, and storing the result is what lets ranking sort on name simplicity
-- without recomputing it for every candidate.
--
-- Hand-written, matching 0002 and 0003. drizzle-kit's snapshot history stops at
-- 0001, so `generate` would re-emit the whole exercise refactor on top of this.

-- ─── Columns ──────────────────────────────────────────────

ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "display_name" varchar(255);--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "short_name" varchar(80);--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "keywords" text[];--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "search_keywords" varchar(512);--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "emoji" varchar(16);--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "group_key" varchar(80);--> statement-breakpoint

-- Existing rows are left `false` on purpose: their display fields are null until
-- the backfill (`npm run db:normalize`) runs the normaliser over them. Reads
-- fall back to `name` in the meantime, so the catalogue keeps working throughout.
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "normalized" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- ─── Indexes ──────────────────────────────────────────────

-- Collapsing a result page into families reads every member of a group.
CREATE INDEX IF NOT EXISTS "foods_group_key_idx" ON "foods" USING btree ("group_key");--> statement-breakpoint

-- Partial: the backfill's only question is "what is still unnormalised?", and
-- once the catalogue is caught up this index is nearly empty and nearly free.
CREATE INDEX IF NOT EXISTS "foods_normalized_idx"
  ON "foods" USING btree ("normalized") WHERE "normalized" = false;--> statement-breakpoint

-- Keywords are the second way into a food: they carry the reader-facing name and
-- its aliases, so "whole egg" matches a row whose own name is the USDA wording.
-- Same trigram opclass as `search_name`, and matched in the same table scan.
CREATE INDEX IF NOT EXISTS "foods_search_keywords_trgm_idx"
  ON "foods" USING gin ("search_keywords" gin_trgm_ops);
