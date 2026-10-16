import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { TraceFinding } from "@factory/records";
import { syncProject } from "./index-sync";
import { createIndexQueries } from "./query";
import { indexSyncs, recordLinks, records } from "./schema";
import { createTestDb } from "./testing";
import { rec, threadFixture } from "./test-records";

const push = (recs = threadFixture(), findings: TraceFinding[] = []) => ({
  project: "p",
  commitSha: "c1",
  records: recs,
  findings,
});

describe("syncProject", () => {
  it("stores records and links", async () => {
    const db = await createTestDb();
    const res = await syncProject(db, push());
    expect(res).toEqual({ records: 8, links: 9, deleted: 0 });
    expect(await db.select().from(records)).toHaveLength(8);
    const brLinks = await db.select().from(recordLinks).where(eq(recordLinks.fromId, "BR-01"));
    expect(brLinks).toHaveLength(2);
    const [apr] = await db.select().from(recordLinks).where(eq(recordLinks.fromId, "APR-0001"));
    expect(apr).toMatchObject({ linkType: "approves", toId: "BR-01", toVersion: 1 });
  });

  it("marks a record missing from the next push as deleted", async () => {
    const db = await createTestDb();
    await syncProject(db, push());
    const res = await syncProject(
      db,
      push(threadFixture().filter((r) => r.recordId !== "CLM-0003")),
    );
    expect(res.deleted).toBe(1);
    const q = createIndexQueries(db);
    expect(await q.getRecord("p", "CLM-0003")).toBeUndefined();
    expect(await q.listRecords({ project: "p", type: "claim" })).toHaveLength(2);
    const gone = await db.select().from(recordLinks).where(eq(recordLinks.fromId, "CLM-0003"));
    expect(gone).toHaveLength(0);
  });

  it("brings a deleted record back when it reappears", async () => {
    const db = await createTestDb();
    await syncProject(db, push());
    await syncProject(db, push([]));
    await syncProject(db, push());
    expect(await createIndexQueries(db).getRecord("p", "BR-01")).toBeDefined();
  });

  it("leaves other projects alone", async () => {
    const db = await createTestDb();
    await syncProject(db, { ...push(threadFixture("other")), project: "other" });
    await syncProject(db, push([rec("SH-01", "stakeholder")]));
    expect(await createIndexQueries(db).getRecord("other", "BR-01")).toBeDefined();
  });

  it("gives the same rows when the same push is sent twice", async () => {
    const db = await createTestDb();
    await syncProject(db, push());
    const before = [await db.select().from(records), await db.select().from(recordLinks)];
    await syncProject(db, push());
    expect([await db.select().from(records), await db.select().from(recordLinks)]).toEqual(before);
    expect(await db.select().from(indexSyncs)).toHaveLength(2);
  });

  it("records findings and sets ok to false", async () => {
    const db = await createTestDb();
    await syncProject(db, push());
    const finding: TraceFinding = {
      kind: "dead_link",
      recordId: "BR-01",
      path: "records/x.md",
      detail: "CLM-9999",
    };
    await syncProject(db, push(threadFixture(), [finding]));
    const sync = await createIndexQueries(db).latestSync("p");
    expect(sync).toMatchObject({ ok: false, findings: [{ kind: "dead_link" }] });
    const rows = await db.select().from(indexSyncs);
    expect(rows.map((r) => r.ok).sort()).toEqual([false, true]);
  });
});
