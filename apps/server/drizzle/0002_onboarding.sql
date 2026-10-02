ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- People who already have hours are past first run; only new users see the welcome.
UPDATE "users" SET "onboarded_at" = now()
WHERE EXISTS (SELECT 1 FROM "timecards" WHERE "timecards"."user_id" = "users"."id");
