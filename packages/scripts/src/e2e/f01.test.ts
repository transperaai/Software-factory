import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatSummary, runF01, waitFor } from "./f01.ts";
import type { F01Config } from "./f01.ts";

const API = "api-secret-123";
const GH = "gh-secret-456";
const T0 = Date.parse("2026-10-16T10:00:00Z");
const transcriptPath = fileURLToPath(
  new URL("../../../../fixtures/f01/inbox/kickoff-2026-10-02.txt", import.meta.url),
);

const config: F01Config = {
  factoryUrl: "https://factory.test",
  apiToken: API,
  githubToken: GH,
  repo: "transperaai/factory-e2e",
  transcriptPath,
  intakeTimeoutMs: 600_000,
  baTimeoutMs: 600_000,
  cardsTimeoutMs: 600_000,
  everyMs: 10_000,
};

const b64 = (s: string) => ({ content: Buffer.from(s).toString("base64") });
const claimCard = {
  kind: "confirm_claims",
  source: "SRC-001",
  claims: [
    { id: "CLM-0001", version: 1 },
    { id: "CLM-0002", version: 3 },
  ],
};
const brCard = { kind: "approve", record: "BR-01", type: "business_requirement", version: 2 };
const evidence = {
  id: "CLM-0001",
  quote: "We lose two hours a day",
  speaker: "Sam",
  source: "SRC-001",
  location: "L4",
};

type Options = {
  intakeConclusion?: string;
  evidence?: unknown[];
  claimsCards?: unknown[];
  brFile?: string;
};

function world(opts: Options = {}) {
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  let clock = T0;
  const logs: string[] = [];
  let uploaded = false;
  let confirmed = false;
  let approved = false;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const run = (conclusion: string) => ({
    workflow_runs: [
      {
        html_url: "https://github.com/run/1",
        status: "completed",
        conclusion,
        created_at: new Date(clock + 1000).toISOString(),
      },
    ],
  });

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ method, url, body });
    if (url.includes("/api/e2e/cards")) {
      if (approved) return json({ cards: [] });
      if (confirmed) return json({ cards: [brCard] });
      return json({ cards: uploaded ? (opts.claimsCards ?? [claimCard]) : [] });
    }
    if (url.endsWith("/api/e2e/inbox")) {
      uploaded = true;
      return json({ path: "inbox/x.txt", branch: "intake/20261016-100000" });
    }
    if (url.endsWith("/api/e2e/act")) {
      if (body?.kind === "confirm") {
        confirmed = true;
        return json({ apr: "APR-0001" });
      }
      approved = true;
      return json({ apr: "APR-0002" });
    }
    if (url.includes("/api/e2e/thread/"))
      return json({
        br: { id: "BR-01", status: "approved", approval: "APR-0002" },
        evidence: opts.evidence ?? [evidence],
      });
    if (url.includes("/workflows/intake.yml/runs"))
      return json(run(opts.intakeConclusion ?? "success"));
    if (url.includes("/workflows/ba.yml/runs")) return json(run("success"));
    if (url.includes("/contents/records/claims/"))
      return json(b64("---\nid: CLM-0001\nconfirmation: confirmed\n---\n"));
    if (url.includes("/contents/records/brs/"))
      return json(
        b64(opts.brFile ?? "---\nid: BR-01\nstatus: approved\napproval: APR-0002\n---\n"),
      );
    if (url.includes("/contents/")) return json(b64("id: x\n"));
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;

  const deps = {
    fetch: fakeFetch,
    sleep: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    log: (line: string) => logs.push(line),
    config,
  };
  return { deps, calls, logs };
}

describe("runF01", () => {
  it("runs the steps in order with the right bodies", async () => {
    const { deps, calls, logs } = world();
    const result = await runF01(deps);
    expect(result).toMatchObject({
      src: "SRC-001",
      br: "BR-01",
      confirmApr: "APR-0001",
      approveApr: "APR-0002",
    });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => c.url)).toEqual([
      "https://factory.test/api/e2e/inbox",
      "https://factory.test/api/e2e/act",
      "https://factory.test/api/e2e/act",
    ]);
    expect(posts[0]!.body).toMatchObject({
      project: "factory-e2e",
      name: "kickoff-2026-10-02.txt",
    });
    expect(String(posts[0]!.body!.text).length).toBeGreaterThan(0);
    expect(posts[2]!.body).toEqual({
      project: "factory-e2e",
      kind: "approve",
      decision: "approved",
      targets: ["BR-01"],
      versions: { "BR-01": 2 },
    });
    const order = calls.map((c) => c.url);
    const at = (part: string) => order.findIndex((u) => u.includes(part));
    expect(at("/api/e2e/inbox")).toBeLessThan(at("intake.yml"));
    expect(at("intake.yml")).toBeLessThan(at("/api/e2e/act"));
    expect(at("/api/e2e/act")).toBeLessThan(at("ba.yml"));
    expect(at("ba.yml")).toBeLessThan(at("/api/e2e/thread/"));
    expect(at("/api/e2e/thread/")).toBeLessThan(at("/contents/"));
    expect(calls.some((c) => c.url.includes("/contents/records/approvals/APR-0001.md"))).toBe(true);
    expect(logs).toHaveLength(8);
    expect(formatSummary(result)).toContain("BR-01");
  });

  it("confirms every claim of the card with its version", async () => {
    const { deps, calls } = world();
    await runF01(deps);
    const confirm = calls.find((c) => c.method === "POST" && c.body?.kind === "confirm");
    expect(confirm!.body).toEqual({
      project: "factory-e2e",
      kind: "confirm",
      decision: "approved",
      targets: ["CLM-0001", "CLM-0002"],
      versions: { "CLM-0001": 1, "CLM-0002": 3 },
    });
  });

  it("fails with the run URL when intake fails", async () => {
    const { deps } = world({ intakeConclusion: "failure" });
    await expect(runF01(deps)).rejects.toThrow(
      "intake.yml on intake/20261016-100000 ended as failure: https://github.com/run/1",
    );
  });

  it("fails when the BR on main is not approved by the step 6 APR", async () => {
    const { deps } = world({
      brFile: "---\nid: BR-01\nstatus: approved\napproval: APR-0009\n---\n",
    });
    await expect(runF01(deps)).rejects.toThrow("expected APR-0002");
  });

  it("fails when a claim in the trace has no speaker", async () => {
    const { deps } = world({ evidence: [{ ...evidence, speaker: "(unknown)" }] });
    await expect(runF01(deps)).rejects.toThrow("lacks: speaker");
  });

  it("never puts a token in an error or a log line", async () => {
    const { deps, logs } = world();
    const leaky = (async () =>
      new Response(`bad credentials ${API} ${GH}`, { status: 500 })) as unknown as typeof fetch;
    const err = await runF01({ ...deps, fetch: leaky }).catch((e: Error) => e);
    expect((err as Error).message).not.toContain(API);
    expect((err as Error).message).not.toContain(GH);
    expect((err as Error).message).toContain("***");
    await runF01(world().deps);
    for (const line of logs) expect(line).not.toMatch(/secret/);
  });
});

describe("waitFor", () => {
  it("names what it waited for when it times out", async () => {
    let clock = 0;
    await expect(
      waitFor(async () => undefined, {
        timeoutMs: 30_000,
        everyMs: 10_000,
        what: "the confirm claims card",
        last: () => "[]",
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
      }),
    ).rejects.toThrow("waiting for the confirm claims card. Last seen: []");
  });
});
