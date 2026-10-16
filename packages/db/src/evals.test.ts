import { beforeEach, describe, expect, it } from "vitest";
import { listEvalResults, listEvalRuns, storeEvalRun } from "./evals";
import type { EvalResultRow, EvalRunRow } from "./evals";
import type { Db } from "./ledger";
import { createTestDb } from "./testing";

const run = (id: string, startedAt: string): EvalRunRow => ({
  id,
  agent: "scribe",
  startedAt: new Date(startedAt),
  finishedAt: new Date(startedAt),
  kitVersion: "0.1.0",
  gitSha: "abc1234",
  trigger: "local",
  casesTotal: 3,
  casesPassed: 2,
  costUsd: "0.090000",
});

const results: EvalResultRow[] = ["a", "b", "c"].map((caseId, i) => ({
  caseId,
  passed: i < 2,
  score: i < 2 ? "1" : "0.5",
  rules: [{ rule: "regex", passed: i < 2 }],
  reply: "SH-01",
  model: "claude-sonnet-5-5",
  costUsd: "0.03",
  durationMs: 9000,
}));

describe("eval storage", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("keeps two runs as two separate runs, each with its scored results", async () => {
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    expect(await storeEvalRun(db, run(first, "2026-10-16T01:00:00Z"), results)).toEqual({
      stored: true,
    });
    expect(await storeEvalRun(db, run(second, "2026-10-16T02:00:00Z"), results)).toEqual({
      stored: true,
    });

    expect((await listEvalRuns(db)).map((r) => r.id)).toEqual([second, first]);
    for (const id of [first, second]) {
      const rows = await listEvalResults(db, id);
      expect(rows.map((r) => [r.caseId, r.passed, r.score])).toEqual([
        ["a", true, "1.0000"],
        ["b", true, "1.0000"],
        ["c", false, "0.5000"],
      ]);
    }
  });

  it("ignores the same run sent twice", async () => {
    const id = "00000000-0000-4000-8000-000000000003";
    await storeEvalRun(db, run(id, "2026-10-16T01:00:00Z"), results);
    expect(await storeEvalRun(db, run(id, "2026-10-16T01:00:00Z"), results)).toEqual({
      stored: false,
    });
    expect(await listEvalRuns(db)).toHaveLength(1);
    expect(await listEvalResults(db, id)).toHaveLength(3);
  });
});
