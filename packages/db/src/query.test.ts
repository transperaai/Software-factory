import { beforeEach, describe, expect, it } from "vitest";
import type { TraceNode } from "@factory/records";
import type { Db } from "./ledger";
import { syncProject } from "./index-sync";
import { createIndexQueries } from "./query";
import { createTestDb } from "./testing";
import { threadFixture } from "./test-records";

const below = (n?: TraceNode): string[] => (n?.children ?? []).flatMap((c) => [c.id, ...below(c)]);

describe("index queries", () => {
  let db: Db;
  let q: ReturnType<typeof createIndexQueries>;
  beforeEach(async () => {
    db = await createTestDb();
    await syncProject(db, {
      project: "p",
      commitSha: "c1",
      records: threadFixture(),
      findings: [],
    });
    q = createIndexQueries(db);
  });

  it("gets a record by ID", async () => {
    expect(await q.getRecord("p", "SH-01")).toMatchObject({
      id: "SH-01",
      type: "stakeholder",
      commit: "c1",
    });
    expect(await q.getRecord("p", "NOPE-01")).toBeUndefined();
    expect(await q.getRecord("other", "SH-01")).toBeUndefined();
  });

  it("traces BR-01 up to its claims, source and stakeholders", async () => {
    const tree = await q.traceUp("p", "BR-01");
    expect(tree).toMatchObject({ id: "BR-01", type: "business_requirement" });
    expect(tree?.children.map((c) => [c.id, c.via])).toEqual([
      ["CLM-0001", "evidence"],
      ["CLM-0002", "evidence"],
    ]);
    // Each node appears once, under the first path that reaches it.
    expect(below(tree).sort()).toEqual(["CLM-0001", "CLM-0002", "SH-01", "SH-02", "SRC-001"]);
  });

  it("stops at the depth limit", async () => {
    const tree = await q.traceUp("p", "BR-01", 1);
    expect(tree?.children.map((c) => c.id)).toEqual(["CLM-0001", "CLM-0002"]);
    expect(tree?.children.every((c) => c.children.length === 0)).toBe(true);
  });

  it("traces CLM-0001 down to the BR and its approval", async () => {
    const tree = await q.traceDown("p", "CLM-0001");
    expect(tree?.children[0]).toMatchObject({ id: "BR-01", via: "evidence" });
    expect(below(tree)).toEqual(["BR-01", "APR-0001"]);
    expect(await q.traceDown("p", "NOPE-01")).toBeUndefined();
  });

  it("survives a link cycle", async () => {
    const recs = threadFixture();
    recs.find((r) => r.recordId === "SH-01")!.links = [{ type: "reports_to", to: "SH-02" }];
    recs.find((r) => r.recordId === "SH-02")!.links = [{ type: "reports_to", to: "SH-01" }];
    await syncProject(db, { project: "p", commitSha: "c2", records: recs, findings: [] });
    expect(below(await q.traceUp("p", "SH-01"))).toEqual(["SH-02"]);
  });

  it("lists records by type, status and header fields", async () => {
    expect(await q.listRecords({ project: "p" })).toHaveLength(8);
    const confirmed = await q.listRecords({
      project: "p",
      type: "claim",
      confirmation: "confirmed",
    });
    expect(confirmed.map((r) => r.id)).toEqual(["CLM-0001", "CLM-0002"]);
    const inReview = await q.listRecords({ project: "p", status: "review" });
    expect(inReview.map((r) => r.id)).toEqual(["BR-01"]);
    expect(await q.listRecords({ project: "p", from_source: "SRC-001" })).toHaveLength(3);
    expect(await q.listRecords({ project: "p", from_source: "SRC-009" })).toEqual([]);
  });

  it("searches title and body, ignoring case", async () => {
    expect((await q.search("p", "DAILY report")).map((r) => r.id)).toEqual(["CLM-0001"]);
    expect((await q.search("p", "sarah")).map((r) => r.id)).toEqual(["SH-01"]);
    expect(await q.search("p", "sarah", "claim")).toEqual([]);
    // % is text, not a wildcard.
    expect(await q.search("p", "100%")).toEqual([]);
  });
});
