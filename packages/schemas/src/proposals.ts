// Agent proposals (F-01 plan, K3). Agents never write records/: each writes one proposal JSON file,
// .factory/runs/<run-id>/proposal.json, and the record writer allocates IDs and writes the records.
// generate.ts writes these to /schemas as <agent>-proposal.schema.json.
import type { Json } from "./definitions.ts";
import { RECORDS } from "./definitions.ts";
import { SCHEMA_DIALECT } from "./build.ts";

const text = { type: "string", minLength: 1 };
const ref = (prefix: string) => ({ type: "string", pattern: `^${prefix}-\\d{2,}$` });
const field = (type: string, name: string): Json => {
  const spec = RECORDS.find((r) => r.type === type);
  const f = spec?.fields[name];
  if (!f) throw new Error(`No field ${name} on ${type}`);
  return f;
};

/** What the intake agent may flag on a claim. Each flag becomes an attention card in F-02. */
export const INTAKE_FLAGS = [
  "unlabelled_speaker",
  "unclear_author",
  "new_person",
  "conflict",
  "suspicious_content",
  "sensitive_personal",
  "unreadable",
  "term_candidate",
  "rule_candidate",
] as const;

export function buildIntakeProposalSchema(): Json {
  return {
    $schema: SCHEMA_DIALECT,
    $id: "urn:factory:schema:intake-proposal",
    title: "Intake proposal",
    description:
      "Claims the intake agent found in one source. The record writer turns each into a CLM record.",
    type: "object",
    additionalProperties: false,
    required: ["source", "claims"],
    properties: {
      source: ref("SRC"),
      claims: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["words", "location", "claim_type", "trust", "quote", "said_by"],
          properties: {
            words: text,
            location: text,
            claim_type: field("claim", "claim_type"),
            trust: field("claim", "trust"),
            quote: field("claim", "quote"),
            // null when the speaker is not certain: the claim is held as pending.
            said_by: { anyOf: [ref("SH"), { type: "null" }] },
            flags: { type: "array", uniqueItems: true, items: { enum: INTAKE_FLAGS } },
            note: text,
          },
        },
      },
    },
  };
}

export function buildBaProposalSchema(): Json {
  return {
    $schema: SCHEMA_DIALECT,
    $id: "urn:factory:schema:ba-proposal",
    title: "BA proposal",
    description:
      "Business requirements the BA agent drafted from confirmed claims, plus asks it parked. The record writer turns each BR into a BR record in review.",
    type: "object",
    additionalProperties: false,
    required: ["brs", "parked"],
    properties: {
      source: ref("SRC"),
      brs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "value", "priority", "owner", "evidence"],
          properties: {
            title: text,
            value: text,
            priority: field("business_requirement", "priority"),
            owner: ref("SH"),
            evidence: { type: "array", minItems: 1, uniqueItems: true, items: ref("CLM") },
            body: text,
          },
        },
      },
      parked: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["ask", "reason", "question"],
          properties: {
            ask: text,
            reason: text,
            question: text,
            evidence: { type: "array", uniqueItems: true, items: ref("CLM") },
          },
        },
      },
    },
  };
}
