import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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

// Eval harness (S0-7). See docs/stage-0-plan.md, S0-7.

/** One run of an agent's eval suite. The runner makes the ID, so storing a results file twice adds nothing. */
export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid("id").primaryKey(),
    agent: text("agent").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    // Where the run came from: kit version, the factory commit it ran against, and what started it.
    kitVersion: text("kit_version").notNull(),
    gitSha: text("git_sha").notNull(),
    trigger: text("trigger").notNull(),
    casesTotal: integer("cases_total").notNull(),
    casesPassed: integer("cases_passed").notNull(),
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eval_runs_agent_started_idx").on(t.agent, t.startedAt)],
);

/** One scored case within a run. `rules` holds each rule's outcome. */
export const evalResults = pgTable(
  "eval_results",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull(),
    passed: boolean("passed").notNull(),
    score: numeric("score", { precision: 5, scale: 4 }).notNull(),
    rules: jsonb("rules").notNull(),
    reply: text("reply").notNull().default(""),
    error: text("error"),
    model: text("model").notNull().default(""),
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.runId, t.caseId] })],
);

// Record index (spike 3; the real index sync is F-01). One row per record file in a project repo.
// Git stays the record: this is a copy for agents to query by ID, rebuilt from the repo.
export const records = pgTable(
  "records",
  {
    project: text("project").notNull(),
    recordId: text("record_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull().default(""),
    status: text("status").notNull().default(""),
    path: text("path").notNull(),
    header: jsonb("header").notNull(),
    body: text("body").notNull().default(""),
    commitSha: text("commit_sha").notNull().default(""),
    // F-01 index (plan K5). version is the header's version; deleted_at is set when a sync no longer finds the file.
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.project, t.recordId] }),
    index("records_project_type_status_idx").on(t.project, t.type, t.status),
  ],
);

// F-01 index (docs/f-01-plan.md, K5). Rebuilt from git by index sync; git stays the record.

/**
 * One row per link, stored as written: on the downstream record, pointing upstream.
 * Reverse links are a query on to_id, never stored twice. to_version is set for versioned refs (BR-01@2).
 */
export const recordLinks = pgTable(
  "record_links",
  {
    project: text("project").notNull(),
    fromId: text("from_id").notNull(),
    linkType: text("link_type").notNull(),
    toId: text("to_id").notNull(),
    toVersion: integer("to_version"),
  },
  (t) => [
    primaryKey({ columns: [t.project, t.fromId, t.linkType, t.toId] }),
    index("record_links_to_idx").on(t.project, t.toId),
  ],
);

/** One row per index sync: which commit, how many records, and the trace checker's findings. */
export const indexSyncs = pgTable(
  "index_syncs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    project: text("project").notNull(),
    commitSha: text("commit_sha").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    recordCount: integer("record_count").notNull(),
    ok: boolean("ok").notNull(),
    // TraceFinding[] from @factory/records.
    findings: jsonb("findings").notNull().default([]),
  },
  (t) => [index("index_syncs_project_synced_idx").on(t.project, t.syncedAt)],
);

/** The last ID handed out per project and prefix, so parallel agent runs never get the same ID. */
export const idCounters = pgTable(
  "id_counters",
  {
    project: text("project").notNull(),
    prefix: text("prefix").notNull(),
    last: integer("last").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.project, t.prefix] })],
);
