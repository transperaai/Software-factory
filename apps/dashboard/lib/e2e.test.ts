import { describe, expect, it } from "vitest";
import { cardsRoute, threadRoute } from "@/lib/e2e";
import type { E2eDeps } from "@/lib/e2e";
import { fakeQueries } from "@/lib/fake-index";

const queries = fakeQueries();
const deps: E2eDeps = { token: () => "test-token", queries: () => queries };
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
  });

  it("200 for factory-e2e", async () => {
    const cards = await cardsRoute(req("/c?project=factory-e2e", ok), deps);
    expect(cards.status).toBe(200);
    expect(((await cards.json()) as { cards: unknown[] }).cards).toHaveLength(3);
    const thread = await threadRoute(req("/t?project=factory-e2e", ok), "BR-01", deps);
    expect(thread.status).toBe(200);
  });
});
