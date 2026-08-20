CREATE INDEX IF NOT EXISTS "weight_logs_user_date_idx" ON "weight_logs" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "measurements_user_date_idx" ON "measurements" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "water_logs_user_date_idx" ON "water_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "step_logs_user_date_idx" ON "step_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_badges_user_idx" ON "user_badges" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_badges_user_badge_unique" ON "user_badges" USING btree ("user_id","badge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workout_logs_user_completed_idx" ON "workout_logs" USING btree ("user_id","completed_at" DESC NULLS LAST);