CREATE TABLE "shared_projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shared_projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"number" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	CONSTRAINT "shared_projects_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "shared_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shared_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"number" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	CONSTRAINT "shared_tasks_project_number" UNIQUE("project_id","number")
);
--> statement-breakpoint
ALTER TABLE "shared_tasks" ADD CONSTRAINT "shared_tasks_project_id_shared_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."shared_projects"("id") ON DELETE cascade ON UPDATE no action;