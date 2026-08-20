ALTER TABLE "workout_exercises" ALTER COLUMN "reps" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_exercises" ALTER COLUMN "rest_seconds" SET DEFAULT 60;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "reps_min" integer;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "reps_max" integer;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "tempo" varchar(15);--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "rpe" real;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workout_exercises_day_idx" ON "workout_exercises" USING btree ("day_id","order_index");--> statement-breakpoint
-- Data backfill, not DDL.
--
-- `workout_plans.visibility` arrived in 0005 with a `draft` default and no
-- backfill, so the three platform catalogue plans that predate the coach model
-- have been sitting at `draft` ever since. Nothing noticed, because `/plans`
-- never filtered on visibility — which is the very hole being closed alongside
-- this migration. Filtering to `published` without this statement would empty
-- the athlete catalogue.
--
-- Scoped to platform plans only (no owning user, no authoring coach). A coach's
-- draft stays a draft, and a user's personal plan is theirs regardless.
UPDATE "workout_plans"
   SET "visibility" = 'published'
 WHERE "visibility" = 'draft'
   AND "coach_id" IS NULL
   AND "user_id" IS NULL;
