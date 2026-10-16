import { describe, expect, it } from "vitest";
import { allocateIds } from "./ids";
import { createTestDb } from "./testing";

const req = (over: Partial<Parameters<typeof allocateIds>[1]> = {}) => ({
  project: "p",
  prefix: "BR",
  count: 1,
  maxInTree: 0,
  ...over,
});

describe("allocateIds", () => {
  it("continues from the highest number in the tree", async () => {
    const db = await createTestDb();
    expect(await allocateIds(db, req({ count: 2, maxInTree: 5 }))).toEqual(["BR-06", "BR-07"]);
    // The counter is ahead of a stale tree.
    expect(await allocateIds(db, req({ maxInTree: 1 }))).toEqual(["BR-08"]);
    // And behind a tree that moved on.
    expect(await allocateIds(db, req({ maxInTree: 20 }))).toEqual(["BR-21"]);
  });

  it("starts at 1 for an empty tree, with the prefix's width", async () => {
    const db = await createTestDb();
    expect(await allocateIds(db, req({ prefix: "SRC" }))).toEqual(["SRC-001"]);
  });

  it("gives 60 distinct IDs to twenty parallel calls", async () => {
    const db = await createTestDb();
    const calls = Array.from({ length: 20 }, () =>
      allocateIds(db, req({ prefix: "CLM", count: 3 })),
    );
    const ids = (await Promise.all(calls)).flat();
    expect(new Set(ids).size).toBe(60);
    expect(ids).toContain("CLM-0001");
    expect(ids).toContain("CLM-0060");
  });

  it("keeps counters apart by project and prefix", async () => {
    const db = await createTestDb();
    await allocateIds(db, req({ project: "a", count: 3 }));
    expect(await allocateIds(db, req({ project: "b" }))).toEqual(["BR-01"]);
    expect(await allocateIds(db, req({ project: "a", prefix: "KPI" }))).toEqual(["KPI-01"]);
  });

  it("refuses a count outside 1 to 200", async () => {
    const db = await createTestDb();
    for (const count of [0, 201, 1.5]) {
      await expect(allocateIds(db, req({ count }))).rejects.toThrow(/count/);
    }
    expect(await allocateIds(db, req({ count: 200 }))).toHaveLength(200);
  });
});
