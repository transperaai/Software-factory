// The contracts between F-01's streams (docs/f-01-plan.md, K1 to K9). Types only, plus a few constants.
// Streams build against these; changing one is a plan change, not a stream decision.

// ---------- K1, K2: records ----------

/** A record file as it travels between git, scripts and the index. */
export type RecordFile = { path: string; content: string };

/** The YAML header every record has. Type-specific fields ride along; the JSON Schemas are the full rule. */
export type RecordHeader = {
  id: string;
  type: string;
  title: string;
  status: string;
  version: number;
  created_by: string;
  approval?: string;
  links?: Record<string, string[]>;
  [field: string]: unknown;
};

/** Where an agent run keeps its input bundle and proposal: .factory/runs/<run-id>/. Never committed. */
export const RUN_DIR = ".factory/runs";
/** Where dashboard uploads land before the sorter gives them a SRC ID. */
export const INBOX_DIR = "inbox";
/** Austin's stakeholder record in every project; the approver on APR records. */
export const AUSTIN = "SH-00";

// ---------- K3: agent proposals (schemas/<agent>-proposal.schema.json) ----------

export type ClaimType = "fact" | "opinion" | "ask" | "assumption" | "measure";
export type Trust = "strong" | "medium" | "unverified";

export type ProposedClaim = {
  words: string;
  /** "L42" (line in text.md) or "00:12:40" (timestamp). */
  location: string;
  claim_type: ClaimType;
  trust: Trust;
  quote: "verbatim" | "paraphrase";
  /** null when the speaker isn't certain: the claim is held as pending and can't be evidence. */
  said_by: string | null;
  flags?: string[];
  note?: string;
};

export type IntakeProposal = { source: string; claims: ProposedClaim[] };

export type ProposedBr = {
  title: string;
  value: string;
  priority: "must" | "should" | "could" | "wont";
  owner: string;
  /** Confirmed CLM IDs only; the record writer refuses anything else. */
  evidence: string[];
  body?: string;
};

export type ParkedAsk = { ask: string; reason: string; question: string; evidence?: string[] };

export type BaProposal = { source?: string; brs: ProposedBr[]; parked: ParkedAsk[] };

// ---------- K4: run input bundles (.factory/runs/<run-id>/input.json) ----------

export type Participant = { label: string; stakeholder?: string };

export type IntakeInput = {
  agent: "intake";
  project: string;
  profile: string;
  source: { id: string; source_type: string; date: string; text_path: string; trust: Trust };
  participants: Participant[];
  /** The source text, one numbered turn per line: "L12 [00:12:40] Sarah Kim: ...". */
  text: string;
};

export type BaInput = {
  agent: "ba";
  project: string;
  profile: string;
  source: string;
  claims: Array<{
    id: string;
    words: string;
    said_by: string;
    location: string;
    claim_type: ClaimType;
  }>;
  stakeholders: Array<{ id: string; name: string; role: string; organisation: string }>;
};

// ---------- K5, K6: index and HTTP APIs ----------

export type TraceFindingKind =
  | "schema" // header fails its JSON Schema
  | "dead_link" // a link points at a record that doesn't exist
  | "id_reused" // two files claim the same ID
  | "unconfirmed_evidence" // a BR in review or approved cites a claim that isn't confirmed
  | "changed_after_approval"; // the approved version and the current version differ

export type TraceFinding = {
  kind: TraceFindingKind;
  recordId: string;
  path: string;
  detail: string;
};

/** POST /api/index/sync (INDEX_TOKEN). Replaces the project's index with exactly these files. */
export type IndexSyncRequest = {
  project: string;
  commitSha: string;
  files: RecordFile[];
  findings: TraceFinding[];
};
export type IndexSyncResponse = { records: number; links: number; deleted: number };

/** POST /api/ids (INDEX_TOKEN). maxInTree is the highest number of this prefix in the caller's working tree. */
export type AllocateIdsRequest = {
  project: string;
  prefix: string;
  count: number;
  maxInTree: number;
};
export type AllocateIdsResponse = { ids: string[] };

/** POST /api/index/query (INDEX_TOKEN). Filters are ANDed; header fields match exactly. */
export type IndexQueryRequest = {
  project: string;
  type?: string;
  status?: string;
  confirmation?: string;
  from_source?: string;
};

export type IndexedRecord = {
  id: string;
  type: string;
  title: string;
  status: string;
  version: number;
  path: string;
  header: RecordHeader;
  body: string;
  commit: string;
};
export type IndexQueryResponse = { records: IndexedRecord[] };

export type TraceNode = {
  id: string;
  type: string;
  title: string;
  status: string;
  via?: string;
  children: TraceNode[];
};

// ---------- K8: dashboard cards (computed from the index) ----------

export type Card =
  | {
      kind: "confirm_claims";
      project: string;
      source: string;
      sourceTitle: string;
      claims: string[];
    }
  | {
      kind: "approve";
      project: string;
      record: string;
      type: string;
      title: string;
      version: number;
    }
  | { kind: "broken_link"; project: string; record: string; detail: string };

/**
 * Read side of the index (stream S3 implements it over Postgres). The MCP tools (S4) and the
 * dashboard (S7) use only this, so they can be built and tested against a fake before S3 lands.
 */
export interface IndexQueries {
  getRecord(project: string, id: string): Promise<IndexedRecord | undefined>;
  listRecords(q: IndexQueryRequest): Promise<IndexedRecord[]>;
  search(project: string, text: string, type?: string): Promise<IndexedRecord[]>;
  /** Follows stored links upstream (towards the source and stakeholder). */
  traceUp(project: string, id: string, depth?: number): Promise<TraceNode | undefined>;
  /** Follows reverse links downstream (towards stories, code, releases). */
  traceDown(project: string, id: string, depth?: number): Promise<TraceNode | undefined>;
  cards(project?: string): Promise<Card[]>;
  latestSync(
    project: string,
  ): Promise<
    { commitSha: string; syncedAt: Date; ok: boolean; findings: TraceFinding[] } | undefined
  >;
}

// ---------- K7: MCP read scopes ----------

/**
 * Record types each agent may read through the MCP server, from its spec's Reads and Must not read.
 * The server reads the agent from the X-Factory-Agent header. An agent not listed may read everything.
 */
export const AGENT_READ_SCOPES: Readonly<Record<string, readonly string[]>> = {
  intake: ["source", "stakeholder", "glossary_term", "claim"],
  ba: [
    "source",
    "claim",
    "stakeholder",
    "pain_point",
    "kpi",
    "glossary_term",
    "decision",
    "rule",
    "persona",
    "business_requirement",
  ],
};

// ---------- K9: project workflows started by the dashboard (workflow_dispatch, App token) ----------

export const WORKFLOWS = {
  intake: { file: "intake.yml", inputs: ["inbox_path"] },
  ba: { file: "ba.yml", inputs: ["source"] },
} as const;
