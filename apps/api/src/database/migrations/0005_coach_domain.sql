-- The coach domain.
--
-- Adds the coach side of the product: a coach's profile, the programs they own
-- (`workout_plans` gains `coach_id`, a visibility state and eligibility columns),
-- the weeks a program is structured into, the enrollment that joins an athlete
-- to a coach, and the messaging thread between them. `users` gains the athlete
-- fields matching compares against, and `subscription_plans` gains the coach
-- entitlements a tier buys.
--
-- Nothing existing is dropped or narrowed. `workout_plans.user_id` stays
-- nullable so personal and system plans are unaffected, `workout_days.week_id`
-- is nullable so plans written before programs keep working without a backfill,
-- and both enum extensions below only append.
--
-- Requires Postgres 12+: drizzle's migrator runs every pending migration in one
-- transaction, and `ALTER TYPE … ADD VALUE` inside a transaction block is only
-- allowed from 12 onward. The added values are deliberately not referenced
-- anywhere later in this file, which the same rule forbids.

-- ─── Types ────────────────────────────────────────────────
DO $$ BEGIN
 CREATE TYPE "public"."training_location" AS ENUM('home', 'gym', 'outdoors');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."coach_access_level" AS ENUM('none', 'messaging', 'priority');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."coach_verification_status" AS ENUM('pending', 'verified', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."program_visibility" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enrollment_status" AS ENUM('pending', 'active', 'paused', 'completed', 'canceled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."message_kind" AS ENUM('text', 'form_review_request', 'form_review_video', 'system', 'ai_summary');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ─── Enum values ──────────────────────────────────────────
-- Appended, never replaced: `trainer` on `role` and `pro`/`elite` on
-- `subscription_tier` stay because rows reference them and removing a value from
-- a Postgres enum is destructive. Each is its own statement, ahead of everything
-- else, and `IF NOT EXISTS` keeps a re-run harmless.
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'coach';--> statement-breakpoint
ALTER TYPE "subscription_tier" ADD VALUE IF NOT EXISTS 'starter';--> statement-breakpoint
ALTER TYPE "subscription_tier" ADD VALUE IF NOT EXISTS 'coach';--> statement-breakpoint
ALTER TYPE "subscription_tier" ADD VALUE IF NOT EXISTS 'pro_coaching';--> statement-breakpoint

-- ─── Tables ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "coach_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"headline" varchar(255),
	"bio" text,
	"specialties" text[],
	"supported_goals" fitness_goal[],
	"supported_levels" experience_level[],
	"supported_equipment" text[],
	"training_locations" training_location[],
	"languages" text[],
	"timezone" varchar(64),
	"years_experience" integer,
	"credentials" jsonb,
	"verification_status" "coach_verification_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"response_time_hours" integer,
	"monthly_price_cents" integer,
	"client_capacity" integer,
	"accepting_clients" boolean DEFAULT true NOT NULL,
	"rating_avg" real,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"title" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_user_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"plan_id" uuid,
	"status" "enrollment_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"current_week" integer DEFAULT 1 NOT NULL,
	"source" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_user_id" uuid NOT NULL,
	"coach_user_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" text,
	"attachment_url" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sport" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "training_location" "training_location";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "available_equipment" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "injuries_notes" text;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "coach_access" "coach_access_level" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "form_reviews" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "scheduled_check_ins" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "coach_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "visibility" "program_visibility" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "duration_weeks" integer;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "sport" varchar(100);--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "target_goals" fitness_goal[];--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "target_levels" experience_level[];--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "required_equipment" text[];--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "training_locations" training_location[];--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "price_cents" integer;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_days" ADD COLUMN IF NOT EXISTS "week_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_weeks" ADD CONSTRAINT "program_weeks_plan_id_workout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_coach_id_coach_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coach_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_plan_id_workout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_profiles_directory_idx" ON "coach_profiles" USING btree ("verification_status","accepting_clients","rating_avg");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_weeks_plan_week_idx" ON "program_weeks" USING btree ("plan_id","week_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_athlete_idx" ON "enrollments" USING btree ("athlete_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_coach_idx" ON "enrollments" USING btree ("coach_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_pair_idx" ON "conversations" USING btree ("athlete_user_id","coach_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_coach_inbox_idx" ON "conversations" USING btree ("coach_user_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_athlete_inbox_idx" ON "conversations" USING btree ("athlete_user_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_coach_id_coach_profiles_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coach_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_days" ADD CONSTRAINT "workout_days_week_id_program_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."program_weeks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workout_plans_coach_idx" ON "workout_plans" USING btree ("coach_id","visibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workout_plans_visibility_idx" ON "workout_plans" USING btree ("visibility");