import {
  bigint,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Cost ledger (S0-4). See docs/stage-0-plan.md, S0-4, and design-doc "8. Cost tracking".

/** One row per Claude Code `api_request` event. `request_id` is unique, so a resent batch adds nothing. */
export const tokenEvents = pgTable(
  "token_events",
  {
    requestId: text("request_id").primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    sessionId: text("session_id").notNull().default(""),
    // Tags from OTEL_RESOURCE_ATTRIBUTES. A missing tag is stored as "" and named in missing_tags.
    project: text("project").notNull().default(""),
    client: text("client").notNull().default(""),
    agent: text("agent").notNull().default(""),
    sliceId: text("slice_id").notNull().default(""),
    missingTags: text("missing_tags").array().notNull().default([]),
    model: text("model").notNull().default(""),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).notNull().default(0),
    cacheCreationTokens: bigint("cache_creation_tokens", { mode: "number" }).notNull().default(0),
    // API-equivalent price. On Max this is notional; the ledger marks it `allocated`.
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("token_events_occurred_at_idx").on(t.occurredAt)],
);

/** Daily cost per project, agent and model, rebuilt from token_events. Columns follow the design doc. */
export const costLedger = pgTable(
  "cost_ledger",
  {
    date: date("date").notNull(),
    project: text("project").notNull(),
    client: text("client").notNull(),
    agent: text("agent").notNull(),
    model: text("model").notNull(),
    source: text("source").notNull(),
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 14, scale: 6 }).notNull(),
    basis: text("basis", { enum: ["billed", "estimated", "allocated"] }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cost_ledger_row_idx").on(
      t.date,
      t.project,
      t.client,
      t.agent,
      t.model,
      t.source,
      t.category,
    ),
  ],
);

/** Raw OTLP metric batches, kept only to cross-check the ledger. Keyed by a hash of the body. */
export const otelMetricBatches = pgTable("otel_metric_batches", {
  sha256: text("sha256").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload").notNull(),
});
