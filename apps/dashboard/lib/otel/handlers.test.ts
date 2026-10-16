import { beforeEach, describe, expect, it } from "vitest";
import { listLedger, otelMetricBatches, tokenEvents } from "@factory/db";
import type { Db } from "@factory/db";
import { createTestDb } from "@factory/db/testing";
import { gzipSync } from "node:zlib";
import logs1 from "./fixtures/claude-p-logs-1.json";
import logs2 from "./fixtures/claude-p-logs-2.json";
import metrics from "./fixtures/claude-p-metrics.json";
import { authorized, makeOtelHandlers } from "./handlers";

// Integration: the route handlers against a real Postgres (PGlite) with the real migrations.

const TOKEN = "test-token";

function post(payload: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/otel/v1/logs", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

describe("OTel ingest", () => {
  let db: Db;
  let otel: ReturnType<typeof makeOtelHandlers>;
  beforeEach(async () => {
    db = await createTestDb();
    otel = makeOtelHandlers({ token: () => TOKEN, db: () => db });
  });

  it("posting a recorded export twice gives one set of rows", async () => {
    for (let i = 0; i < 2; i++) {
      expect((await otel.logs(post(logs1))).status).toBe(200);
      expect((await otel.logs(post(logs2))).status).toBe(200);
    }
    const events = await db.select().from(tokenEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ requestId: "req_fixture_0001", sliceId: "S0-4" });

    const ledger = await listLedger(db, "2026-10-01");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      date: "2026-10-16",
      project: "factory-test-project",
      client: "transpera",
      agent: "scribe",
      model: "claude-sonnet-5-5",
      source: "claude_code",
      category: "ai",
      amount: "0.041452",
      basis: "allocated",
    });
  });

  it("accepts a gzipped body", async () => {
    const req = new Request("http://localhost/api/otel/v1/logs", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      body: gzipSync(JSON.stringify(logs2)),
    });
    expect((await otel.logs(req)).status).toBe(200);
    expect(await db.select().from(tokenEvents)).toHaveLength(1);
  });

  it("stores a metrics batch once, without account identifiers", async () => {
    const metricsPost = () => post(metrics);
    expect((await otel.metrics(metricsPost())).status).toBe(200);
    expect((await otel.metrics(metricsPost())).status).toBe(200);
    const rows = await db.select().from(otelMetricBatches);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]?.payload)).not.toContain("user.email");
  });

  it("refuses a wrong or missing token", async () => {
    expect((await otel.logs(post(logs2, { authorization: "Bearer nope" }))).status).toBe(401);
    expect((await otel.logs(post(logs2, { authorization: "" }))).status).toBe(401);
    expect(await db.select().from(tokenEvents)).toHaveLength(0);
  });

  it("refuses everything when no token is configured", async () => {
    const open = makeOtelHandlers({ token: () => undefined, db: () => db });
    expect((await open.logs(post(logs2))).status).toBe(401);
  });

  it("refuses protobuf, bad JSON and non-OTLP bodies", async () => {
    expect(
      (await otel.logs(post(logs2, { "content-type": "application/x-protobuf" }))).status,
    ).toBe(415);
    const bad = new Request("http://localhost/", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: "{not json",
    });
    expect((await otel.logs(bad)).status).toBe(400);
    expect((await otel.logs(post({ nope: true }))).status).toBe(400);
    expect((await otel.metrics(post({ nope: true }))).status).toBe(400);
  });

  it("answers 503 so the exporter retries when the database is missing or failing", async () => {
    const noDb = makeOtelHandlers({ token: () => TOKEN, db: () => undefined });
    expect((await noDb.logs(post(logs2))).status).toBe(503);
    const broken = makeOtelHandlers({
      token: () => TOKEN,
      db: () =>
        ({
          insert: () => {
            throw new Error("connection refused\nquery text");
          },
        }) as unknown as Db,
    });
    expect((await broken.logs(post(logs2))).status).toBe(503);
  });
});

describe("authorized", () => {
  it("needs the exact bearer token", () => {
    expect(authorized("Bearer abc", "abc")).toBe(true);
    expect(authorized("Bearer abcd", "abc")).toBe(false);
    expect(authorized("abc", "abc")).toBe(false);
    expect(authorized(null, "abc")).toBe(false);
    expect(authorized("Bearer ", "")).toBe(false);
  });
});
