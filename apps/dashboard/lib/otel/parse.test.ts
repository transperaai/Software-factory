import { describe, expect, it } from "vitest";
import logs1 from "./fixtures/claude-p-logs-1.json";
import logs2 from "./fixtures/claude-p-logs-2.json";
import metrics from "./fixtures/claude-p-metrics.json";
import { parseLogs, PayloadError, withoutIdentity } from "./parse";

// Fixtures are a real `claude -p` run (Claude Code 2.1.301) with account identifiers replaced.

const apiRequest = (attributes: { key: string; value: Record<string, unknown> }[]) => ({
  resourceLogs: [
    {
      resource: { attributes: [{ key: "factory.project", value: { stringValue: "p1" } }] },
      scopeLogs: [
        {
          logRecords: [
            {
              timeUnixNano: "1792112517749000000",
              body: { stringValue: "claude_code.api_request" },
              attributes,
            },
          ],
        },
      ],
    },
  ],
});

describe("parseLogs", () => {
  it("reads the api_request event from a real export, with tags and token counts", () => {
    expect(parseLogs(logs2)).toEqual({
      events: [
        {
          requestId: "req_fixture_0001",
          occurredAt: new Date("2026-10-16T01:01:57.749Z"),
          sessionId: "00000000-0000-4000-8000-000000000001",
          project: "factory-test-project",
          client: "transpera",
          agent: "scribe",
          sliceId: "S0-4",
          missingTags: [],
          model: "claude-sonnet-5-5",
          inputTokens: 2,
          outputTokens: 4,
          cacheReadTokens: 25200,
          cacheCreationTokens: 9722,
          costUsd: "0.041452",
        },
      ],
      rejected: 0,
    });
  });

  it("ignores other events", () => {
    expect(parseLogs(logs1)).toEqual({ events: [], rejected: 0 });
  });

  it("takes tags from the resource, flags missing ones, and accepts int64 as strings", () => {
    const { events } = parseLogs(
      apiRequest([
        { key: "request_id", value: { stringValue: "r1" } },
        { key: "input_tokens", value: { intValue: "12" } },
        { key: "cost_usd", value: { doubleValue: "0.5" } },
      ]),
    );
    expect(events[0]).toMatchObject({
      requestId: "r1",
      occurredAt: new Date(1792112517749),
      project: "p1",
      sliceId: "",
      missingTags: ["client", "agent", "slice"],
      inputTokens: 12,
      costUsd: "0.500000",
    });
  });

  it("rejects an api_request without a request ID instead of storing it", () => {
    expect(parseLogs(apiRequest([{ key: "model", value: { stringValue: "m" } }]))).toEqual({
      events: [],
      rejected: 1,
      rejectedReason: "api_request events without request_id",
    });
  });

  it("refuses a payload that isn't OTLP logs", () => {
    expect(() => parseLogs({ hello: 1 })).toThrow(PayloadError);
    expect(() => parseLogs(null)).toThrow(PayloadError);
  });
});

describe("withoutIdentity", () => {
  it("drops account identifiers and keeps tags", () => {
    const text = JSON.stringify(withoutIdentity(metrics));
    expect(text).not.toContain("user.email");
    expect(text).not.toContain("organization.id");
    expect(text).toContain("factory.slice");
    expect(text).toContain("claude_code.token.usage");
  });
});
