CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hours" numeric(5, 2) DEFAULT 0 NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"time_from" text DEFAULT '' NOT NULL,
	"time_to" text DEFAULT '' NOT NULL,
	CONSTRAINT "time_entries_line_date" UNIQUE("line_id","date")
);
--> statement-breakpoint
CREATE TABLE "timecard_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"timecard_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"project_number" text DEFAULT '' NOT NULL,
	"project_name" text DEFAULT '' NOT NULL,
	"task_number" text DEFAULT '' NOT NULL,
	"task_name" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"last_exported_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timecards_user_week" UNIQUE("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"oid" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"daily_norm_hours" numeric(4, 2) DEFAULT 8 NOT NULL,
	"flex_start_balance" numeric(7, 2) DEFAULT 0 NOT NULL,
	"flex_start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_tenant_oid" UNIQUE("tenant_id","oid")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_line_id_timecard_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."timecard_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_lines" ADD CONSTRAINT "timecard_lines_timecard_id_timecards_id_fk" FOREIGN KEY ("timecard_id") REFERENCES "public"."timecards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_expires_at" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "timecard_lines_timecard" ON "timecard_lines" USING btree ("timecard_id");