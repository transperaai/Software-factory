import { beforeEach, describe, expect, it } from "vitest";
import { listEvalResults, listEvalRuns } from "@factory/db";
import type { Db } from "@factory/db";
import { createTestDb } from "@factory/db/testing";
import { makeEvalHandler, parseEvalRunFile } from "./handler";

// Shaped like the output of `factory eval run`.
const file = (id: string) => ({
  format: 1,
  id,
  agent: "scribe",
  startedAt: "2026-10-16T01:00:00.000Z",
  finishedAt: "2026-10-16T01:01:00.000Z",
  kitVersion: "0.1.0",
  gitSha: "4db53c6abcde",
  trigger: "local",
  casesTotal: 3,
  casesPassed: 3,
  costUsd: 0.09,
  results: [
    "scribe-new-stakeholder",
    "scribe-next-free-id",
    "scribe-missing-fact-and-injection",
  ].map((caseId, i) => ({
    caseId,
    passed: i !== 2,
    score: i !== 2 ? 1 : 0.6667,
    rules: [{ rule: "regex", passed: true, detail: "/SH-01/ found in reply" }],
    reply: "SH-01",
    error: null,
    model: "claude-sonnet-5-5",
    costUsd: 0.03,
    durationMs: 9000,
  })),
});

const post = (body: unknown, token = "t") =>
  new Request("http://localhost/api/evals/runs", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/evals/runs", () => {
  let db: Db;
  let handle: ReturnType<typeof makeEvalHandler>;
  beforeEach(async () => {
    db = await createTestDb();
    handle = makeEvalHandler({ token: () => "t", db: () => db });
  });

  it("stores two runs as two runs, both kept, each with three scored results", async () => {
    const a = "00000000-0000-4000-8000-00000000000a";
    const b = "00000000-0000-4000-8000-00000000000b";
    expect(await (await handle(post(file(a)))).json()).toEqual({ stored: true, id: a });
    expect(await (await handle(post(file(b)))).json()).toEqual({ stored: true, id: b });

    const runs = await listEvalRuns(db);
    expect(runs.map((r) => r.id).sort()).toEqual([a, b]);
    // Counted from the results, not taken from the file's own totals.
    expect(runs[0]).toMatchObject({ casesTotal: 3, casesPassed: 2 });
    for (const id of [a, b]) expect(await listEvalResults(db, id)).toHaveLength(3);
  });

  it("does nothing when the same file is stored twice", async () => {
    const id = "00000000-0000-4000-8000-00000000000c";
    await handle(post(file(id)));
    expect(await (await handle(post(file(id)))).json()).toEqual({ stored: false, id });
    expect(await listEvalRuns(db)).toHaveLength(1);
  });

  it("refuses a wrong token and a malformed file", async () => {
    expect((await handle(post(file("00000000-0000-4000-8000-00000000000d"), "nope"))).status).toBe(
      401,
    );
    const res = await handle(post({ ...file("not-a-uuid") }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "id must be a UUID" });
    expect(await listEvalRuns(db)).toHaveLength(0);
  });
});

describe("parseEvalRunFile", () => {
  it("names the first problem", () => {
    const base = file("00000000-0000-4000-8000-00000000000e");
    expect(() => parseEvalRunFile({ ...base, format: 2 })).toThrow("unsupported results format");
    expect(() => parseEvalRunFile({ ...base, results: [] })).toThrow(
      "results must list 1 to 500 cases",
    );
    const repeated = { ...base, results: [base.results[0], base.results[0]] };
    expect(() => parseEvalRunFile(repeated)).toThrow("results[1].caseId is missing or repeated");
    const badScore = { ...base, results: [{ ...base.results[0], score: 2 }] };
    expect(() => parseEvalRunFile(badScore)).toThrow("results[0].score must be between 0 and 1");
  });
});
