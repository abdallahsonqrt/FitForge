DO $$ BEGIN
 CREATE TYPE "public"."food_category" AS ENUM('fruits', 'vegetables', 'meat', 'seafood', 'dairy', 'grains', 'snacks', 'drinks', 'supplements', 'recipes', 'restaurant', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."food_kind" AS ENUM('generic', 'branded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."food_source" AS ENUM('local', 'usda', 'off');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."serving_unit" AS ENUM('g', 'kg', 'ml', 'l', 'cup', 'piece', 'slice', 'tablespoon', 'teaspoon', 'serving');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"search_name" varchar(255) NOT NULL,
	"brand" varchar(255),
	"category" "food_category" DEFAULT 'other' NOT NULL,
	"kind" "food_kind" DEFAULT 'generic' NOT NULL,
	"source" "food_source" DEFAULT 'local' NOT NULL,
	"external_source_id" varchar(128),
	"calories" real DEFAULT 0 NOT NULL,
	"protein" real DEFAULT 0 NOT NULL,
	"carbs" real DEFAULT 0 NOT NULL,
	"fat" real DEFAULT 0 NOT NULL,
	"fiber" real DEFAULT 0 NOT NULL,
	"sugar" real DEFAULT 0 NOT NULL,
	"sodium" real DEFAULT 0 NOT NULL,
	"serving_grams" real,
	"serving_label" varchar(120),
	"image_url" text,
	"popularity" integer DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"translated_name" varchar(255) NOT NULL,
	"search_name" varchar(255) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_servings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"serving_name" varchar(120) NOT NULL,
	"amount" real DEFAULT 1 NOT NULL,
	"unit" "serving_unit" DEFAULT 'g' NOT NULL,
	"grams_per_unit" real NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_food_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"last_used" timestamp DEFAULT now() NOT NULL,
	"usage_count" integer DEFAULT 1 NOT NULL,
	"last_meal_type" "meal_type"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "favorite_foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_translations" ADD CONSTRAINT "food_translations_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_servings" ADD CONSTRAINT "food_servings_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_food_history" ADD CONSTRAINT "user_food_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_food_history" ADD CONSTRAINT "user_food_history_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorite_foods" ADD CONSTRAINT "favorite_foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorite_foods" ADD CONSTRAINT "favorite_foods_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "foods_source_ref_idx" ON "foods" USING btree ("source","external_source_id") WHERE "foods"."external_source_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foods_category_idx" ON "foods" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foods_popularity_idx" ON "foods" USING btree ("popularity" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "food_translations_unique_idx" ON "food_translations" USING btree ("food_id","language","search_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_translations_food_idx" ON "food_translations" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_translations_language_idx" ON "food_translations" USING btree ("language");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_servings_food_idx" ON "food_servings" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_food_history_user_food_idx" ON "user_food_history" USING btree ("user_id","food_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_food_history_recent_idx" ON "user_food_history" USING btree ("user_id","last_used" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_food_history_frequent_idx" ON "user_food_history" USING btree ("user_id","usage_count" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "favorite_foods_user_food_idx" ON "favorite_foods" USING btree ("user_id","food_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "favorite_foods_user_idx" ON "favorite_foods" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- ─────────────────────────────────────────────────────────────────────────────
-- Search indexes.
--
-- Hand-written because neither `gin_trgm_ops` nor generated tsvector columns are
-- expressible in the Drizzle schema DSL. They are intentionally absent from
-- `src/database/schema/*.ts` so drizzle-kit never tries to replace them with
-- plain btree indexes on a later generate.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigram matching: powers typo tolerance (`search_name % 'chikcen'`), infix
-- matching and prefix autocomplete (`LIKE 'chi%'`) from a single index. A plain
-- btree could serve only the last of those.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "foods_search_name_trgm_idx"
  ON "foods" USING gin ("search_name" gin_trgm_ops);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "food_translations_search_name_trgm_idx"
  ON "food_translations" USING gin ("search_name" gin_trgm_ops);--> statement-breakpoint

-- Full-text search over the same normalised text. Trigram similarity compares
-- whole strings, so it dilutes on long multi-word queries ("grilled chicken
-- breast"); a tsquery matches token-wise and stays precise. Both run as OR
-- branches of one query and each is index-backed.
--
-- The 'simple' dictionary is deliberate: no stemming and no stopword list, so
-- Arabic and English tokens are treated alike and "tea" is not discarded.
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("search_name", ''))) STORED;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "foods_search_vector_idx"
  ON "foods" USING gin ("search_vector");--> statement-breakpoint

ALTER TABLE "food_translations" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("search_name", ''))) STORED;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "food_translations_search_vector_idx"
  ON "food_translations" USING gin ("search_vector");
