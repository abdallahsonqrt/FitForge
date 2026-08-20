-- Exercise media, normalised.
--
-- Replaces the three free-text columns on `exercises` (`muscle_group`,
-- `equipment`, `video_url`) with catalogue tables and join tables, plus
-- dedicated metadata tables for the objects held in the storage bucket.
--
-- Videos and images are never stored in Postgres. `exercise_videos` and
-- `exercise_images` hold the provider, the object key and the shape of the file;
-- the bytes stay in Cloudflare R2 (or whatever provider replaces it, at which
-- point only `provider`/`public_url` change — the keys and every foreign key
-- pointing at them survive).
--
-- The legacy columns are backfilled into the new tables before being dropped, so
-- an existing library keeps its muscle and equipment data.

-- ─── Types ────────────────────────────────────────────────
DO $$ BEGIN
 CREATE TYPE "public"."body_region" AS ENUM('upper', 'core', 'lower', 'full_body');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."muscle_role" AS ENUM('primary', 'secondary', 'stabilizer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."storage_provider" AS ENUM('r2', 's3', 'gcs', 'external');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."media_visibility" AS ENUM('public', 'private');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."media_status" AS ENUM('pending', 'processing', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."exercise_video_kind" AS ENUM('primary', 'preview', 'alternate_angle');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."exercise_image_kind" AS ENUM('thumbnail', 'poster', 'preview_gif', 'illustration');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ─── Catalogues ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exercise_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_categories_order_idx" ON "exercise_categories" USING btree ("order_index");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "muscles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"scientific_name" varchar(160),
	"region" "body_region" DEFAULT 'upper' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "muscles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "muscles_region_idx" ON "muscles" USING btree ("region");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_bodyweight" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint

-- ─── exercises ────────────────────────────────────────────
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "slug" varchar(160);--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "category_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "difficulty" "difficulty" DEFAULT 'beginner' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "instructions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "tips" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "default_sets" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "default_reps" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "default_rest_seconds" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "is_published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint

-- Slug from the existing name: lowercase, non-alphanumerics collapsed to single
-- hyphens. Uniqueness is settled by appending a counter to any duplicates.
UPDATE "exercises"
SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'))
WHERE "slug" IS NULL;--> statement-breakpoint

WITH ranked AS (
  SELECT "id", "slug", row_number() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS rn
  FROM "exercises"
)
UPDATE "exercises" e
SET "slug" = ranked."slug" || '-' || ranked.rn
FROM ranked
WHERE e."id" = ranked."id" AND ranked.rn > 1;--> statement-breakpoint

ALTER TABLE "exercises" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercises" ADD CONSTRAINT "exercises_slug_unique" UNIQUE("slug");
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN duplicate_table THEN null;
END $$;
--> statement-breakpoint

-- Free-text instructions were newline-separated steps; keep them as an ordered array.
UPDATE "exercises"
SET "instructions" = coalesce(
      (
        SELECT jsonb_agg(to_jsonb(btrim(step)) ORDER BY ordinality)
        FROM unnest(string_to_array("description", E'\n')) WITH ORDINALITY AS t(step, ordinality)
        WHERE btrim(step) <> ''
      ),
      '[]'::jsonb
    )
WHERE "instructions" = '[]'::jsonb AND "description" IS NOT NULL AND position(E'\n' in "description") > 0;--> statement-breakpoint

-- ─── Join tables ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exercise_muscles" (
	"exercise_id" uuid NOT NULL,
	"muscle_id" uuid NOT NULL,
	"role" "muscle_role" DEFAULT 'primary' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exercise_muscles_exercise_id_muscle_id_pk" PRIMARY KEY("exercise_id","muscle_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_muscles_muscle_role_idx" ON "exercise_muscles" USING btree ("muscle_id","role");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "exercise_equipment" (
	"exercise_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exercise_equipment_exercise_id_equipment_id_pk" PRIMARY KEY("exercise_id","equipment_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_equipment_equipment_idx" ON "exercise_equipment" USING btree ("equipment_id","is_required");--> statement-breakpoint

-- ─── Media ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exercise_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"kind" "exercise_image_kind" DEFAULT 'thumbnail' NOT NULL,
	"provider" "storage_provider" DEFAULT 'r2' NOT NULL,
	"storage_key" text NOT NULL,
	"visibility" "media_visibility" DEFAULT 'public' NOT NULL,
	"public_url" text,
	"width" integer,
	"height" integer,
	"file_size" bigint,
	"mime_type" varchar(100),
	"checksum_sha256" varchar(64),
	"alt_text" varchar(255),
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "media_status" DEFAULT 'ready' NOT NULL,
	"uploaded_by_id" uuid,
	"uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_images_storage_key_idx" ON "exercise_images" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_images_exercise_kind_idx" ON "exercise_images" USING btree ("exercise_id","kind","order_index");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "exercise_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"kind" "exercise_video_kind" DEFAULT 'primary' NOT NULL,
	"label" varchar(120),
	"provider" "storage_provider" DEFAULT 'r2' NOT NULL,
	"storage_key" text NOT NULL,
	"visibility" "media_visibility" DEFAULT 'public' NOT NULL,
	"public_url" text,
	"thumbnail_image_id" uuid,
	"duration_seconds" real,
	"width" integer,
	"height" integer,
	"file_size" bigint,
	"mime_type" varchar(100),
	"checksum_sha256" varchar(64),
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"uploaded_by_id" uuid,
	"uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_videos_storage_key_idx" ON "exercise_videos" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_videos_exercise_kind_idx" ON "exercise_videos" USING btree ("exercise_id","kind","order_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_videos_status_idx" ON "exercise_videos" USING btree ("status","created_at");--> statement-breakpoint

-- ─── Foreign keys ─────────────────────────────────────────
DO $$ BEGIN
 ALTER TABLE "exercises" ADD CONSTRAINT "exercises_category_id_exercise_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."exercise_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_muscle_id_muscles_id_fk" FOREIGN KEY ("muscle_id") REFERENCES "public"."muscles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_equipment" ADD CONSTRAINT "exercise_equipment_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_equipment" ADD CONSTRAINT "exercise_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_images" ADD CONSTRAINT "exercise_images_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_images" ADD CONSTRAINT "exercise_images_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_videos" ADD CONSTRAINT "exercise_videos_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_videos" ADD CONSTRAINT "exercise_videos_thumbnail_image_id_exercise_images_id_fk" FOREIGN KEY ("thumbnail_image_id") REFERENCES "public"."exercise_images"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_videos" ADD CONSTRAINT "exercise_videos_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ─── Backfill from the legacy columns ─────────────────────
-- `muscle_group` and `equipment` held one free-text value each. Promote the
-- distinct values to catalogue rows, then link them.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'muscle_group'
  ) THEN
    INSERT INTO "muscles" ("slug", "name")
    SELECT DISTINCT ON (slug) slug, name
    FROM (
      SELECT
        trim(both '-' from regexp_replace(lower("muscle_group"), '[^a-z0-9]+', '-', 'g')) AS slug,
        initcap("muscle_group") AS name
      FROM "exercises"
      WHERE "muscle_group" IS NOT NULL AND btrim("muscle_group") <> ''
    ) candidates
    WHERE slug <> ''
    ON CONFLICT ("slug") DO NOTHING;

    INSERT INTO "exercise_muscles" ("exercise_id", "muscle_id", "role")
    SELECT e."id", m."id", 'primary'
    FROM "exercises" e
    JOIN "muscles" m
      ON m."slug" = trim(both '-' from regexp_replace(lower(e."muscle_group"), '[^a-z0-9]+', '-', 'g'))
    WHERE e."muscle_group" IS NOT NULL AND btrim(e."muscle_group") <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'equipment'
  ) THEN
    INSERT INTO "equipment" ("slug", "name", "is_bodyweight")
    SELECT DISTINCT ON (slug) slug, name, is_bodyweight
    FROM (
      SELECT
        trim(both '-' from regexp_replace(lower("equipment"), '[^a-z0-9]+', '-', 'g')) AS slug,
        "equipment" AS name,
        lower("equipment") = 'bodyweight' AS is_bodyweight
      FROM "exercises"
      WHERE "equipment" IS NOT NULL AND btrim("equipment") <> ''
    ) candidates
    WHERE slug <> ''
    ON CONFLICT ("slug") DO NOTHING;

    INSERT INTO "exercise_equipment" ("exercise_id", "equipment_id")
    SELECT e."id", q."id"
    FROM "exercises" e
    JOIN "equipment" q
      ON q."slug" = trim(both '-' from regexp_replace(lower(e."equipment"), '[^a-z0-9]+', '-', 'g'))
    WHERE e."equipment" IS NOT NULL AND btrim(e."equipment") <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  -- A stored URL is an object someone else hosts: record it as an `external`
  -- video so nothing is lost, and leave it for an admin to re-upload to R2.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'video_url'
  ) THEN
    INSERT INTO "exercise_videos" (
      "exercise_id", "kind", "provider", "storage_key", "visibility",
      "public_url", "status", "uploaded_at"
    )
    SELECT "id", 'primary', 'external', 'legacy/' || "id"::text, 'public',
           "video_url", 'ready', "created_at"
    FROM "exercises"
    WHERE "video_url" IS NOT NULL AND btrim("video_url") <> ''
    ON CONFLICT ("storage_key") DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint

-- Exercise media has moved to its own tables; `media` is now user-owned only.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media' AND column_name = 'exercise_id'
  ) THEN
    DELETE FROM "media" WHERE "exercise_id" IS NOT NULL AND "owner_id" IS NULL;
    ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_exercise_id_exercises_id_fk";
    ALTER TABLE "media" DROP COLUMN "exercise_id";
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "exercises" DROP COLUMN IF EXISTS "muscle_group";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN IF EXISTS "equipment";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN IF EXISTS "video_url";--> statement-breakpoint

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "exercises_published_name_idx" ON "exercises" USING btree ("is_published","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_category_idx" ON "exercises" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_difficulty_idx" ON "exercises" USING btree ("difficulty");--> statement-breakpoint

-- Fuzzy name search ("bech pres" → "Bench Press"). pg_trgm ships with Postgres
-- but the extension has to be enabled; the food search migration already does
-- this, so the guard is here only to keep this file independently runnable.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_name_trgm_idx" ON "exercises" USING gin (lower("name") gin_trgm_ops);
