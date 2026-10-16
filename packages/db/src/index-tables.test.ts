import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { idCounters, indexSyncs, recordLinks } from "./schema";
import { createTestDb } from "./testing";

// Migration 0003 (F-01 plan, K5). The queries on these tables are stream S3's; this only proves the shape.
describe("F-01 index tables", () => {
  it("store links, syncs and ID counters", async () => {
    const db = await createTestDb();
    await db.insert(recordLinks).values({
      project: "p",
      fromId: "APR-0001",
      linkType: "approves",
      toId: "BR-01",
      toVersion: 1,
    });
    await db
      .insert(indexSyncs)
      .values({ project: "p", commitSha: "abc", recordCount: 3, ok: true });
    await db.insert(idCounters).values({ project: "p", prefix: "CLM", last: 4 });
    const [sync] = await db.select().from(indexSyncs);
    expect(sync).toMatchObject({ project: "p", ok: true, findings: [] });
    const [counter] = await db
      .update(idCounters)
      .set({ last: sql`greatest(${idCounters.last}, 2) + 3` })
      .returning();
    expect(counter?.last).toBe(7);
  });

  it("refuses the same link twice", async () => {
    const db = await createTestDb();
    const link = { project: "p", fromId: "CLM-0001", linkType: "from_source", toId: "SRC-001" };
    await db.insert(recordLinks).values(link);
    await expect(db.insert(recordLinks).values(link)).rejects.toThrow();
  });
});
