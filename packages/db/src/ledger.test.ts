import { beforeEach, describe, expect, it } from "vitest";
import {
  countUntaggedEvents,
  ingestTokenEvents,
  listLedger,
  storeMetricBatch,
  utcDay,
} from "./ledger";
import type { Db, TokenEvent } from "./ledger";
import { tokenEvents } from "./schema";
import { createTestDb } from "./testing";

function event(over: Partial<TokenEvent> = {}): TokenEvent {
  return {
    requestId: "req_1",
    occurredAt: new Date("2026-10-16T01:00:00Z"),
    sessionId: "s1",
    project: "factory-test-project",
    client: "transpera",
    agent: "scribe",
    sliceId: "S0-4",
    missingTags: [],
    model: "claude-sonnet-5-5",
    inputTokens: 10,
    outputTokens: 20,
    cacheReadTokens: 300,
    cacheCreationTokens: 40,
    costUsd: "0.010000",
    ...over,
  };
}

describe("ledger", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("stores events and sums them into one ledger row per project, agent, model and day", async () => {
    const result = await ingestTokenEvents(db, [
      event({ requestId: "a", costUsd: "0.010000" }),
      event({ requestId: "b", costUsd: "0.025000" }),
      event({ requestId: "c", model: "claude-opus-5-5", costUsd: "0.100000" }),
      event({ requestId: "d", occurredAt: new Date("2026-10-17T00:00:01Z"), costUsd: "0.5" }),
    ]);
    expect(result).toEqual({ received: 4, inserted: 4, days: ["2026-10-16", "2026-10-17"] });

    const rows = await listLedger(db, "2026-10-01");
    expect(rows.map((r) => [r.date, r.model, r.amount, r.basis, r.source, r.category])).toEqual([
      ["2026-10-17", "claude-sonnet-5-5", "0.500000", "allocated", "claude_code", "ai"],
      ["2026-10-16", "claude-opus-5-5", "0.100000", "allocated", "claude_code", "ai"],
      ["2026-10-16", "claude-sonnet-5-5", "0.035000", "allocated", "claude_code", "ai"],
    ]);
  });

  it("changes nothing when the same batch is sent again", async () => {
    const batch = [event({ requestId: "a" }), event({ requestId: "b" })];
    await ingestTokenEvents(db, batch);
    const again = await ingestTokenEvents(db, batch);

    expect(again.inserted).toBe(0);
    expect(await db.select().from(tokenEvents)).toHaveLength(2);
    const rows = await listLedger(db, "2026-10-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe("0.020000");
  });

  it("adds a later event to the existing day's row", async () => {
    await ingestTokenEvents(db, [event({ requestId: "a" })]);
    await ingestTokenEvents(db, [event({ requestId: "b", costUsd: "0.005" })]);
    const rows = await listLedger(db, "2026-10-01");
    expect(rows.map((r) => r.amount)).toEqual(["0.015000"]);
  });

  it("keeps untagged events and counts them", async () => {
    await ingestTokenEvents(db, [
      event({ requestId: "a", sliceId: "", missingTags: ["slice"] }),
      event({ requestId: "b" }),
    ]);
    expect(await countUntaggedEvents(db, new Date("2026-10-01"))).toBe(1);
    expect(await db.select().from(tokenEvents)).toHaveLength(2);
  });

  it("stores a metrics batch once", async () => {
    expect(await storeMetricBatch(db, "abc", { resourceMetrics: [] })).toEqual({ inserted: 1 });
    expect(await storeMetricBatch(db, "abc", { resourceMetrics: [] })).toEqual({ inserted: 0 });
  });

  it("uses the UTC day", () => {
    expect(utcDay(new Date("2026-10-16T23:59:59+10:00"))).toBe("2026-10-16");
    expect(utcDay(new Date("2026-10-17T09:00:00+10:00"))).toBe("2026-10-16");
  });
});
