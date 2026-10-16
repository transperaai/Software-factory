CREATE TABLE "eval_results" (
	"run_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"passed" boolean NOT NULL,
	"score" numeric(5, 4) NOT NULL,
	"rules" jsonb NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"error" text,
	"model" text DEFAULT '' NOT NULL,
	"cost_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "eval_results_run_id_case_id_pk" PRIMARY KEY("run_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"kit_version" text NOT NULL,
	"git_sha" text NOT NULL,
	"trigger" text NOT NULL,
	"cases_total" integer NOT NULL,
	"cases_passed" integer NOT NULL,
	"cost_usd" numeric(14, 6) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_runs_agent_started_idx" ON "eval_runs" USING btree ("agent","started_at");