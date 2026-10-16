import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

const schemaDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(schemaDir + name, "utf8")) as object;
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const intake = ajv.compile(load("intake-proposal.schema.json"));
const ba = ajv.compile(load("ba-proposal.schema.json"));

const claim = {
  words: "Urgent requests sit in the same queue as everything else.",
  location: "L12",
  claim_type: "fact",
  trust: "strong",
  quote: "verbatim",
  said_by: "SH-01",
};

describe("intake proposal", () => {
  it("accepts a claim with a speaker, and one held as pending", () => {
    expect(intake({ source: "SRC-001", claims: [claim, { ...claim, said_by: null }] })).toBe(true);
  });

  it("accepts known flags and rejects unknown ones", () => {
    expect(intake({ source: "SRC-001", claims: [{ ...claim, flags: ["suspicious_content"] }] })).toBe(true);
    expect(intake({ source: "SRC-001", claims: [{ ...claim, flags: ["looks_odd"] }] })).toBe(false);
  });

  it.each(["words", "location", "claim_type", "trust", "quote", "said_by"])("rejects a claim without %s", (k) => {
    const c: Record<string, unknown> = { ...claim };
    delete c[k];
    expect(intake({ source: "SRC-001", claims: [c] })).toBe(false);
  });

  it("rejects an ID the agent made up for the claim itself", () => {
    expect(intake({ source: "SRC-001", claims: [{ ...claim, id: "CLM-0001" }] })).toBe(false);
  });

  it("accepts the measure claim type", () => {
    expect(intake({ source: "SRC-001", claims: [{ ...claim, claim_type: "measure" }] })).toBe(true);
  });
});

describe("BA proposal", () => {
  const br = {
    title: "Priority items are identified at submission without human judgement",
    value: "Urgent requests stop waiting behind routine ones.",
    priority: "must",
    owner: "SH-01",
    evidence: ["CLM-0001"],
  };

  it("accepts a BR and a parked ask", () => {
    expect(ba({ brs: [br], parked: [{ ask: "A kanban board", reason: "A solution, no evidence of need", question: "What goes wrong today?" }] })).toBe(true);
  });

  it("rejects a BR with no evidence", () => {
    expect(ba({ brs: [{ ...br, evidence: [] }], parked: [] })).toBe(false);
  });

  it("rejects evidence that is not a claim", () => {
    expect(ba({ brs: [{ ...br, evidence: ["BR-01"] }], parked: [] })).toBe(false);
  });
});
