-- AI nutrition logging.
--
-- Turns `meal_items` from a flat nutrition snapshot into a portion that stays
-- linked to the food catalogue, so a logged item can be rescaled ("make the
-- chicken 200 g") without re-parsing the original sentence. Adds the draft state
-- that gives a conversation its memory between turns.

DO $$ BEGIN
 CREATE TYPE "public"."meal_source" AS ENUM('manual', 'ai', 'quick');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ─── meals ────────────────────────────────────────────────
ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "source" "meal_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "fiber" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "sugar" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "sodium" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meals_user_date_idx" ON "meals" USING btree ("user_id","date" DESC);--> statement-breakpoint

-- ─── meal_items ───────────────────────────────────────────
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "food_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "quantity" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "unit" "serving_unit" DEFAULT 'serving' NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "grams" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "fiber" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "sugar" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "sodium" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint

-- The original table required these; items logged as free text legitimately have none.
ALTER TABLE "meal_items" ALTER COLUMN "calories" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "meal_items" ALTER COLUMN "protein" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "meal_items" ALTER COLUMN "carbs" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "meal_items" ALTER COLUMN "fat" SET DEFAULT 0;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_items_meal_idx" ON "meal_items" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_items_food_idx" ON "meal_items" USING btree ("food_id");--> statement-breakpoint

-- ─── foods: user-created entries ──────────────────────────
-- No foreign key to `users`: a food stays in the catalogue when its author
-- leaves, and orphaning it into the shared pool would silently make a private
-- entry public. Ownership is enforced in the query, not by the constraint.
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foods_created_by_idx" ON "foods" USING btree ("created_by");--> statement-breakpoint

-- ─── ai_conversations ─────────────────────────────────────
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "meal_type" "meal_type" DEFAULT 'snack' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "draft_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "pending_question" jsonb;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "meal_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversations_user_date_idx" ON "ai_conversations" USING btree ("user_id","date" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id","created_at");
