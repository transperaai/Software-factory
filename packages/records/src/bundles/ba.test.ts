import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { IndexedRecord, RecordHeader } from "../contracts";
import { buildBaInput } from "./ba";

const repo = new URL("../../../../", import.meta.url).pathname;

function claim(n: number, confirmation: string, said_by?: string): RecordHeader {
  return {
    id: `CLM-000${n}`,
    type: "claim",
    title: `Claim ${n}`,
    status: "draft",
    version: 1,
    created_by: "agent:intake",
    words: `words ${n}`,
    location: `L${n}`,
    claim_type: "fact",
    trust: "strong",
    quote: "verbatim",
    confirmation,
    links: { from_source: ["SRC-001"], ...(said_by ? { said_by: [said_by] } : {}) },
  };
}

// JSON is valid YAML, so the test header can be written as JSON.
const md = (h: RecordHeader) => `---\n${JSON.stringify(h)}\n---\n`;

describe("buildBaInput", () => {
  it("offline includes only confirmed claims that have a speaker", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ba-"));
    cpSync(join(repo, "fixtures/f01"), dir, { recursive: true });
    mkdirSync(join(dir, "records/claims"), { recursive: true });
    const all = [
      claim(1, "confirmed", "SH-01"),
      claim(2, "pending", "SH-01"),
      claim(3, "confirmed"),
    ];
    for (const h of all) writeFileSync(join(dir, `records/claims/${h.id}.md`), md(h));

    const input = await buildBaInput({ project: "E2E", profile: "lite", source: "SRC-001", dir });
    expect(input.claims).toEqual([
      { id: "CLM-0001", words: "words 1", said_by: "SH-01", location: "L1", claim_type: "fact" },
    ]);
    expect(input.stakeholders.map((s) => s.id)).toEqual(["SH-00", "SH-01", "SH-02"]);
    expect(input.stakeholders[1]).toEqual({
      id: "SH-01",
      name: "Sarah Kim",
      role: "Operations manager",
      organisation: "Acme Logistics",
    });
  });

  it("online sends the claim query then the stakeholder query", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const rec = (header: RecordHeader): IndexedRecord => ({
      id: header.id,
      type: header.type,
      title: header.title,
      status: header.status,
      version: 1,
      path: "x",
      header,
      body: "",
      commit: "abc",
    });
    const fakeFetch = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { type: string };
      calls.push({ url, body });
      const records =
        body.type === "claim"
          ? [rec(claim(1, "confirmed", "SH-01")), rec(claim(3, "confirmed"))]
          : [
              rec({
                id: "SH-01",
                type: "stakeholder",
                title: "Sarah Kim",
                status: "draft",
                version: 1,
                created_by: "human:austin",
                name: "Sarah Kim",
                role: "Ops",
                organisation: "Acme",
              }),
            ];
      return new Response(JSON.stringify({ records }), { status: 200 });
    }) as unknown as typeof fetch;

    const input = await buildBaInput({
      project: "E2E",
      profile: "lite",
      source: "SRC-001",
      url: "https://factory.test",
      token: "test-token",
      fetch: fakeFetch,
    });
    expect(calls.map((c) => c.body)).toEqual([
      { project: "E2E", type: "claim", confirmation: "confirmed", from_source: "SRC-001" },
      { project: "E2E", type: "stakeholder" },
    ]);
    expect(calls[0]!.url).toBe("https://factory.test/api/index/query");
    expect(input.claims.map((c) => c.id)).toEqual(["CLM-0001"]);
    expect(input.stakeholders).toHaveLength(1);
  });
});
