// One definition per ID type in the trace schema (docs/design-doc.md, "ID and trace schema").
// Required fields come from the "Minimum standard" tables in the phase deep-dives.
// generate.ts turns these into JSON Schema files in /schemas. Edit here, then run `pnpm generate`.

export type Json = Record<string, unknown>;

export type LinkSpec = {
  /** ID prefixes this link may point at. */
  targets: string[];
  /** Must be present (non-empty) once the record is in review or approved. */
  required?: boolean;
  /** Also accept acceptance-criterion refs such as US-007#AC2. */
  allowAcRef?: boolean;
  /** Also accept pull request refs such as PR-118 (PRs are not record files). */
  allowPr?: boolean;
  /** Also accept a version suffix such as BR-01@3 (approvals). */
  withVersion?: boolean;
};

export type RecordSpec = {
  prefix: string;
  type: string;
  /** Folder under records/, or null where the trace schema names none yet. */
  folder: string | null;
  description: string;
  /** "lifecycle" for records that are drafted and approved; "work" for items that are opened and closed. */
  statusSet: "lifecycle" | "work";
  /** Overrides the default ID pattern PREFIX-NN. */
  idPattern?: string;
  fields: Record<string, Json>;
  /** Fields that must be present once the record is in review or approved (always, for work items). */
  required: string[];
  /** Fields and links that must be present at every status, drafts included. */
  always?: string[];
  links: Record<string, LinkSpec>;
};

export const LIFECYCLE_STATUSES = ["draft", "review", "approved", "superseded", "retired"] as const;
export const WORK_STATUSES = ["open", "in_progress", "resolved", "closed", "wont_fix"] as const;
/** Lifecycle statuses at which the minimum standard applies ("Missing blocks the gate"). */
export const GATED_STATUSES = ["review", "approved"] as const;

const text = { type: "string", minLength: 1 };
const textList = { type: "array", items: text };
const date = { type: "string", format: "date" };
const numberOrText = { anyOf: [{ type: "number" }, text] };
const priority = { enum: ["must", "should", "could", "wont"] };
const sev = { enum: ["sev1", "sev2", "sev3", "sev4"] };

/** A reference to a stakeholder, used for owner fields. */
export const OWNER_REF = "SH";

export const RECORDS: RecordSpec[] = [
  {
    prefix: "SRC",
    type: "source",
    folder: "sources",
    description: "An input stored untouched. The record is records/sources/SRC-NNN/meta.yaml.",
    statusSet: "lifecycle",
    fields: {
      source_type: {
        enum: [
          "transcript",
          "typed_notes",
          "email",
          "document",
          "screenshot",
          "spreadsheet",
          "audio",
          "video",
          "other",
        ],
      },
      date,
      participants: {
        type: "array",
        items: {
          type: "object",
          required: ["label"],
          properties: { label: text, stakeholder: { $ref: "#/$defs/ref_SH" } },
        },
      },
      raw_file: text,
      supplied_by: { $ref: "#/$defs/ref_SH" },
    },
    required: ["source_type", "date", "participants", "raw_file"],
    always: ["source_type", "date", "raw_file"],
    links: {},
  },
  {
    prefix: "CLM",
    type: "claim",
    folder: "claims",
    description: "One claim, rule, term or pain, linked to its exact place in a source.",
    statusSet: "lifecycle",
    fields: {
      words: text,
      location: text,
      claim_type: { enum: ["fact", "opinion", "ask", "assumption"] },
      confirmation: { enum: ["pending", "confirmed", "rejected"] },
    },
    required: ["words", "location", "claim_type", "confirmation"],
    always: ["words", "location", "claim_type", "confirmation", "from_source"],
    links: {
      from_source: { targets: ["SRC"], required: true },
      said_by: { targets: ["SH"] },
    },
  },
  {
    prefix: "SH",
    type: "stakeholder",
    folder: "stakeholders",
    description: "A named person. Scoring fields come later.",
    statusSet: "lifecycle",
    fields: {
      name: text,
      role: text,
      organisation: text,
      aliases: textList,
      email: text,
      approver: { type: "boolean" },
    },
    required: ["name", "role", "organisation"],
    always: ["name", "role", "organisation"],
    links: {},
  },
  {
    prefix: "PP",
    type: "pain_point",
    folder: "pains",
    description: "A pain with a measured baseline.",
    statusSet: "lifecycle",
    fields: {
      felt_by: text,
      measure: text,
      baseline: numberOrText,
      method: text,
      sample: text,
      workaround: text,
    },
    required: ["felt_by", "measure", "baseline", "method", "sample", "workaround"],
    links: { evidence: { targets: ["CLM"], required: true } },
  },
  {
    prefix: "KPI",
    type: "kpi",
    folder: "kpis",
    description: "A success measure, paired leading and lagging.",
    statusSet: "lifecycle",
    fields: {
      kpi_type: { enum: ["leading", "lagging"] },
      baseline: numberOrText,
      target: numberOrText,
      method: text,
      owner: { $ref: "#/$defs/ref_SH" },
      review_date: date,
    },
    required: ["kpi_type", "baseline", "target", "method", "owner", "review_date"],
    links: {
      baseline_of: { targets: ["PP"], required: true },
      pair: { targets: ["KPI"] },
    },
  },
  {
    prefix: "BR",
    type: "business_requirement",
    folder: "brs",
    description: "An outcome the business needs, backed by confirmed evidence. The title is the statement.",
    statusSet: "lifecycle",
    fields: { value: text, priority, owner: { $ref: "#/$defs/ref_SH" } },
    required: ["value", "priority", "owner"],
    links: {
      evidence: { targets: ["CLM", "PP"], required: true },
      // KPIs are set in Discovery before BRs exist, so the BR is downstream and holds this link.
      measured_by: { targets: ["KPI"] },
    },
  },
  {
    prefix: "PER",
    type: "persona",
    folder: "personas",
    description: "A persona built from evidence.",
    statusSet: "lifecycle",
    fields: {
      jobs: textList,
      pains: textList,
      constraints: textList,
      design_implications: textList,
    },
    required: ["jobs", "pains", "constraints", "design_implications"],
    links: { evidence: { targets: ["CLM"] } },
  },
  {
    prefix: "TERM",
    type: "glossary_term",
    folder: "glossary",
    description: "An agreed definition. The title is the term.",
    statusSet: "lifecycle",
    fields: {
      definition: text,
      owner: { $ref: "#/$defs/ref_SH" },
      not_to_be_confused_with: textList,
      system_field: { anyOf: [{ type: "boolean" }, text] },
    },
    required: ["definition", "owner"],
    links: {},
  },
  {
    prefix: "DEC",
    type: "decision",
    folder: "decisions",
    description: "A decision. Append-only: superseded, never deleted.",
    statusSet: "lifecycle",
    fields: { rationale: text },
    required: [],
    links: {
      decided_by: { targets: ["CLM", "SH"], required: true },
      supersedes: { targets: ["DEC"] },
    },
  },
  {
    prefix: "RULE",
    type: "rule",
    folder: "rules",
    description: "A business rule. The title is the statement. Append-only.",
    statusSet: "lifecycle",
    fields: { why: text, owner: { $ref: "#/$defs/ref_SH" }, enforced_in: textList },
    required: ["why", "owner", "enforced_in"],
    links: {
      decided_by: { targets: ["CLM", "SH"], required: true },
      supersedes: { targets: ["RULE"] },
    },
  },
  {
    prefix: "PROC",
    type: "process",
    folder: "processes",
    description: "A To-Be (or As-Is) process. The diagram is in the body.",
    statusSet: "lifecycle",
    fields: { level: { enum: ["L2", "L3", "L4"] }, as_is: { type: "boolean" } },
    required: ["level"],
    links: { serves: { targets: ["BR"] } },
  },
  {
    prefix: "UC",
    type: "use_case",
    folder: "usecases",
    description: "A use case. Flows are in the body; rules are referenced, never restated.",
    statusSet: "lifecycle",
    fields: { actor: text, trigger: text },
    required: ["actor", "trigger"],
    links: { serves: { targets: ["BR"], required: true }, references: { targets: ["RULE"] } },
  },
  {
    prefix: "WF",
    type: "screen",
    folder: "screens",
    description: "A screen in the prototype inventory.",
    statusSet: "lifecycle",
    fields: { route: text },
    required: [],
    links: { realises: { targets: ["UC"], required: true } },
  },
  {
    prefix: "US",
    type: "story",
    folder: "stories",
    description: "A user story with Given/When/Then acceptance criteria.",
    statusSet: "lifecycle",
    fields: {
      story: text,
      priority,
      acceptance_criteria: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id", "given", "when", "then"],
          properties: {
            id: { type: "string", pattern: "^AC\\d+$" },
            given: text,
            when: text,
            then: text,
            kind: { enum: ["happy", "edge", "negative"] },
          },
        },
      },
    },
    required: ["story", "priority", "acceptance_criteria"],
    links: {
      serves: { targets: ["BR", "UC", "PER"], required: true },
      from_screen: { targets: ["WF"] },
    },
  },
  {
    prefix: "FR",
    type: "functional_requirement",
    folder: "frs",
    description: 'A system requirement. The title is "The system shall...".',
    statusSet: "lifecycle",
    fields: {},
    required: [],
    links: { derived_from: { targets: ["US"], required: true }, enforces: { targets: ["RULE"] } },
  },
  {
    prefix: "NFR",
    type: "non_functional_requirement",
    folder: "nfrs",
    description: "A quality target as a number, with how it is verified.",
    statusSet: "lifecycle",
    fields: { category: text, target: numberOrText, unit: text, verification: text },
    required: ["category", "target", "verification"],
    links: {},
  },
  {
    prefix: "ENT",
    type: "entity",
    folder: "data",
    description: "A data entity. Fields carry glossary name, type, validation, source, owner and data class.",
    statusSet: "lifecycle",
    fields: {
      owner: { $ref: "#/$defs/ref_SH" },
      data_class: text,
      fields: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "type"],
          properties: {
            name: text,
            type: text,
            required: { type: "boolean" },
            validation: text,
            source: text,
            owner: { $ref: "#/$defs/ref_SH" },
            data_class: text,
            personal: { type: "boolean" },
          },
        },
      },
    },
    required: ["owner", "data_class"],
    links: { required_by: { targets: ["US", "FR"], required: true } },
  },
  {
    prefix: "INT",
    type: "interface",
    folder: "interfaces",
    description: "An interface to another system, failure path included.",
    statusSet: "lifecycle",
    fields: {
      direction: { enum: ["inbound", "outbound", "both"] },
      trigger: text,
      auth: text,
      error_handling: text,
      sample_payload: text,
    },
    required: ["direction", "trigger", "auth", "error_handling"],
    links: { required_by: { targets: ["US", "FR"], required: true } },
  },
  {
    prefix: "SL",
    type: "slice",
    folder: "slices",
    description: "A vertical slice that fits one fresh agent context.",
    statusSet: "lifecycle",
    fields: { layers: textList, outcome: text, out_of_scope: textList },
    required: ["layers", "outcome"],
    links: { delivers: { targets: ["US"], required: true }, depends_on: { targets: ["SL"] } },
  },
  {
    prefix: "ADR",
    type: "adr",
    folder: "adrs",
    description: "An architecture decision. Context, options and decision are in the body.",
    statusSet: "lifecycle",
    fields: {},
    required: [],
    links: {
      driven_by: { targets: ["NFR", "RULE", "DEC"], required: true },
      supersedes: { targets: ["ADR"] },
    },
  },
  {
    prefix: "THR",
    type: "threat",
    folder: "threats",
    description: "A STRIDE threat at a trust boundary, with its controls.",
    statusSet: "lifecycle",
    fields: {
      stride: {
        enum: [
          "spoofing",
          "tampering",
          "repudiation",
          "information_disclosure",
          "denial_of_service",
          "elevation_of_privilege",
        ],
      },
      boundary: text,
    },
    required: ["stride", "boundary"],
    links: {
      threatens: { targets: ["ENT", "INT"], required: true },
      controlled_by: { targets: ["FR", "NFR", "RULE"], required: true },
    },
  },
  {
    prefix: "SEC",
    type: "security_finding",
    folder: null,
    description: "A security finding, usually drafted from scanner output.",
    statusSet: "work",
    fields: {
      severity: { enum: ["critical", "high", "medium", "low", "info"] },
      tool: text,
      location: text,
    },
    required: ["severity"],
    links: { affects: { targets: ["ENT", "INT", "FR", "THR"] } },
  },
  {
    prefix: "TC",
    type: "test_case",
    folder: null,
    description: "A test, named by the criterion it verifies.",
    statusSet: "lifecycle",
    fields: { kind: { enum: ["unit", "integration", "e2e", "contract", "manual"] }, path: text },
    required: ["kind"],
    links: { verifies: { targets: ["US", "FR", "RULE"], required: true, allowAcRef: true } },
  },
  {
    prefix: "UAT",
    type: "uat_script",
    folder: null,
    description: "A UAT script for Must stories. Steps are in the body.",
    statusSet: "lifecycle",
    fields: {},
    required: [],
    links: { accepts: { targets: ["US"], required: true } },
  },
  {
    prefix: "REL",
    type: "release",
    folder: null,
    description: "A release. The ID carries the version, e.g. REL-1.0.1.",
    statusSet: "lifecycle",
    idPattern: "^REL-\\d+\\.\\d+(?:\\.\\d+)?$",
    fields: { date },
    required: ["date"],
    links: { ships: { targets: ["SL"], required: true, allowPr: true } },
  },
  {
    prefix: "DEF",
    type: "defect",
    folder: null,
    description: "A defect found before release.",
    statusSet: "work",
    fields: { steps: text, expected: text, actual: text, evidence: text, severity: sev },
    required: ["steps", "expected", "actual", "evidence", "severity"],
    links: {
      breaks: { targets: ["US", "FR", "RULE"], required: true },
      found_in: { targets: ["REL", "SL"] },
    },
  },
  {
    prefix: "ISS",
    type: "issue",
    folder: null,
    description: "An issue found after go-live.",
    statusSet: "work",
    fields: { severity: sev },
    required: ["severity"],
    links: {
      found_in: { targets: ["REL"], required: true },
      breaks: { targets: ["US", "FR", "RULE"] },
    },
  },
  {
    prefix: "CR",
    type: "change_request",
    folder: null,
    description: "A requested change to approved records.",
    statusSet: "work",
    fields: { requested_by: { $ref: "#/$defs/ref_SH" }, reason: text },
    required: ["requested_by", "reason"],
    links: { changes: { targets: ["*"] } },
  },
  {
    prefix: "TD",
    type: "tech_debt",
    folder: null,
    description: "A tech debt item with a score.",
    statusSet: "work",
    fields: { score: { type: "number" }, risk: text },
    required: [],
    links: { in: { targets: ["SL", "FR", "ENT", "INT"] } },
  },
  {
    prefix: "APR",
    type: "approval",
    folder: "approvals",
    description: "Who approved which version of which record, in what role, on whose behalf.",
    statusSet: "lifecycle",
    fields: {
      decision: { enum: ["approved", "rejected", "changes_requested"] },
      approver: text,
      role: text,
      on_behalf_of: text,
      date,
      accepted_risks: textList,
      comment: text,
    },
    required: ["decision", "approver", "role", "date"],
    always: ["decision", "approver", "role", "date", "approves"],
    links: { approves: { targets: ["*"], required: true, withVersion: true } },
  },
];

export const PREFIXES = RECORDS.map((r) => r.prefix);
