-- A week now counts as delivered when it is exported (the official system is the source of truth).
UPDATE "timecards" SET "status" = CASE
	WHEN "last_exported_at" IS NULL THEN 'draft'
	WHEN "updated_at" > "last_exported_at" THEN 'changed'
	ELSE 'exported'
END;--> statement-breakpoint
ALTER TABLE "timecards" DROP COLUMN "submitted_at";
