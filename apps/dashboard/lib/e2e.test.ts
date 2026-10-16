import { describe, expect, it, vi } from "vitest";
import { actRoute, cardsRoute, threadRoute } from "@/lib/e2e";
import type { E2eDeps } from "@/lib/e2e";
import { fakeQueries } from "@/lib/fake-index";

const github = {
  commitFiles: vi.fn(async () => "sha"),
  openAndMerge: vi.fn(async () => {}),
  dispatch: vi.fn(async () => {}),
};
const queries = fakeQueries();
const deps: E2eDeps = {
  token: () => "test-token",
  queries: () => queries,
  approval: () => ({
    queries,
    allocate: async () => ["APR-0002"],
    buildApproval: () => [{ path: "a.md", content: "x" }],
    github,
    now: () => new Date("2026-10-16T00:00:00Z"),
  }),
  inbox: () => ({ github, now: () => new Date() }),
};
const req = (url: string, init?: RequestInit & { auth?: string }) =>
  new Request(`http://x${url}`, {
    ...init,
    headers: { ...(init?.auth ? { authorization: init.auth } : {}) },
  });
const ok = { auth: "Bearer test-token" };

describe("e2e routes", () => {
  it("401 without a token, 503 when none is configured", async () => {
    expect((await cardsRoute(req("/c?project=factory-e2e"), deps)).status).toBe(401);
    expect(
      (await cardsRoute(req("/c?project=factory-e2e", { auth: "Bearer no" }), deps)).status,
    ).toBe(401);
    const unset = { ...deps, token: () => undefined };
    expect((await cardsRoute(req("/c?project=factory-e2e", ok), unset)).status).toBe(503);
  });

  it("403 for any project except factory-e2e", async () => {
    expect((await cardsRoute(req("/c?project=factory-test-project", ok), deps)).status).toBe(403);
    expect(
      (await threadRoute(req("/t?project=factory-test-project", ok), "BR-01", deps)).status,
    ).toBe(403);
    const act = new Request("http://x/a", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify({ project: "factory-test-project", targets: ["BR-01"] }),
    });
    expect((await actRoute(act, deps)).status).toBe(403);
  });

  it("200 for factory-e2e", async () => {
    const cards = await cardsRoute(req("/c?project=factory-e2e", ok), deps);
    expect(cards.status).toBe(200);
    expect(((await cards.json()) as { cards: unknown[] }).cards).toHaveLength(3);
    const thread = await threadRoute(req("/t?project=factory-e2e", ok), "BR-01", deps);
    expect(thread.status).toBe(200);
    const act = new Request("http://x/a", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify({
        project: "factory-e2e",
        kind: "approve",
        targets: ["BR-01"],
        decision: "approved",
      }),
    });
    const res = await actRoute(act, deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ apr: "APR-0002" });
  });

  it("refuses an act call for a version the user did not see", async () => {
    github.commitFiles.mockClear();
    const act = new Request("http://x/a", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify({
        project: "factory-e2e",
        kind: "approve",
        targets: ["BR-01"],
        decision: "approved",
        versions: { "BR-01": 2 },
      }),
    });
    expect((await actRoute(act, deps)).status).toBe(500);
    expect(github.commitFiles).not.toHaveBeenCalled();
  });
});
