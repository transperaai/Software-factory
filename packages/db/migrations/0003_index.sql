CREATE TABLE "id_counters" (
	"project" text NOT NULL,
	"prefix" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "id_counters_project_prefix_pk" PRIMARY KEY("project","prefix")
);
--> statement-breakpoint
CREATE TABLE "index_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" text NOT NULL,
	"commit_sha" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"record_count" integer NOT NULL,
	"ok" boolean NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_links" (
	"project" text NOT NULL,
	"from_id" text NOT NULL,
	"link_type" text NOT NULL,
	"to_id" text NOT NULL,
	"to_version" integer,
	CONSTRAINT "record_links_project_from_id_link_type_to_id_pk" PRIMARY KEY("project","from_id","link_type","to_id")
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "index_syncs_project_synced_idx" ON "index_syncs" USING btree ("project","synced_at");--> statement-breakpoint
CREATE INDEX "record_links_to_idx" ON "record_links" USING btree ("project","to_id");--> statement-breakpoint
CREATE INDEX "records_project_type_status_idx" ON "records" USING btree ("project","type","status");