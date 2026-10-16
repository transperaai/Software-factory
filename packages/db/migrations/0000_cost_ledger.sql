CREATE TABLE "cost_ledger" (
	"date" date NOT NULL,
	"project" text NOT NULL,
	"client" text NOT NULL,
	"agent" text NOT NULL,
	"model" text NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 6) NOT NULL,
	"basis" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otel_metric_batches" (
	"sha256" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_events" (
	"request_id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"agent" text DEFAULT '' NOT NULL,
	"slice_id" text DEFAULT '' NOT NULL,
	"missing_tags" text[] DEFAULT '{}' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_creation_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cost_ledger_row_idx" ON "cost_ledger" USING btree ("date","project","client","agent","model","source","category");--> statement-breakpoint
CREATE INDEX "token_events_occurred_at_idx" ON "token_events" USING btree ("occurred_at");