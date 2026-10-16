CREATE TABLE "records" (
	"project" text NOT NULL,
	"record_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"path" text NOT NULL,
	"header" jsonb NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"commit_sha" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "records_project_record_id_pk" PRIMARY KEY("project","record_id")
);
