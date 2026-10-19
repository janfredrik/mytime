CREATE TABLE "catalog_projects" (
	"id" integer PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_tasks" (
	"project_id" integer NOT NULL,
	"id" integer NOT NULL,
	"number" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "catalog_tasks_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "catalog_tasks" ADD CONSTRAINT "catalog_tasks_project_id_catalog_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."catalog_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_projects_number" ON "catalog_projects" USING btree ("number");