// F-01 end to end (docs/f-01-plan.md, D3): steps 1 to 8 against the real dashboard, real Actions and
// real agents, in the factory-e2e repo. The dashboard side goes through /api/e2e/* (K6); git is checked
// through the GitHub contents API. Tokens are never logged: every message goes through scrub().
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const PROJECT = "factory-e2e";
const SKEW_MS = 60_000; // runner and GitHub clocks are not exactly in step

export type F01Config = {
  factoryUrl: string;
  apiToken: string;
  githubToken: string;
  repo: string;
  transcriptPath: string;
  intakeTimeoutMs: number;
  baTimeoutMs: number;
  cardsTimeoutMs: number;
  everyMs: number;
};

export type F01Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log?: (line: string) => void;
  config: F01Config;
};

export const DEFAULT_TIMEOUTS = {
  intakeTimeoutMs: 15 * 60_000,
  baTimeoutMs: 15 * 60_000,
  cardsTimeoutMs: 5 * 60_000,
  everyMs: 10_000,
};

export type F01Result = {
  src: string;
  claims: string[];
  confirmApr: string;
  br: string;
  approveApr: string;
  intakeRun: string;
  baRun: string;
  steps: Array<{ step: string; ms: number }>;
};

type ClaimCard = {
  kind: "confirm_claims";
  source: string;
  claims: Array<{ id: string; version: number }>;
};
type ApproveCard = { kind: "approve"; record: string; type: string; version: number };
type Card = ClaimCard | ApproveCard | { kind: string };
type Run = { html_url: string; status: string; conclusion: string | null; created_at: string };
type Thread = {
  br: { id: string; status: string; approval: string };
  evidence: Array<{ id: string; quote: string; speaker: string; source: string; location: string }>;
};

/** Poll fn until it returns something other than undefined. The timeout message names what it waited for. */
export async function waitFor<T>(
  fn: () => Promise<T | undefined>,
  opts: {
    timeoutMs: number;
    everyMs: number;
    what: string;
    last?: () => string;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
  },
): Promise<T> {
  const start = opts.now();
  for (;;) {
    const got = await fn();
    if (got !== undefined) return got;
    if (opts.now() - start + opts.everyMs > opts.timeoutMs) {
      const last = opts.last?.();
      throw new Error(
        `Timed out after ${Math.round(opts.timeoutMs / 1000)}s waiting for ${opts.what}.${last ? ` Last seen: ${last}` : ""}`,
      );
    }
    await opts.sleep(opts.everyMs);
  }
}

function header(text: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return (parseYaml(m ? m[1]! : text) as Record<string, unknown>) ?? {};
}

/** Runs the steps. Any error comes out with the tokens replaced by ***. */
export async function runF01(deps: F01Deps): Promise<F01Result> {
  const secrets = [deps.config.apiToken, deps.config.githubToken].filter(Boolean);
  const scrub = (s: string) => secrets.reduce((out, t) => out.split(t).join("***"), s);
  try {
    return await execute(deps, scrub);
  } catch (err) {
    if (err instanceof Error) err.message = scrub(err.message);
    throw err;
  }
}

async function execute(deps: F01Deps, scrub: (s: string) => string): Promise<F01Result> {
  const c = deps.config;
  const say = (line: string) => (deps.log ?? console.log)(scrub(line));
  const steps: F01Result["steps"] = [];
  const wait = <T>(
    what: string,
    timeoutMs: number,
    fn: () => Promise<T | undefined>,
    last?: () => string,
  ) => waitFor(fn, { timeoutMs, everyMs: c.everyMs, what, last, sleep: deps.sleep, now: deps.now });
  const timed = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = deps.now();
    try {
      return await fn();
    } finally {
      steps.push({ step, ms: deps.now() - t0 });
    }
  };

  async function call(base: string, token: string, method: string, path: string, body?: unknown) {
    const res = await deps.fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, text, json: () => JSON.parse(text) as unknown };
  }
  async function dash<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await call(c.factoryUrl, c.apiToken, method, path, body);
    if (r.status < 200 || r.status > 299)
      throw new Error(`${method} ${path} returned ${r.status}: ${r.text.slice(0, 200)}`);
    return r.json() as T;
  }
  const gh = (path: string) => call("https://api.github.com", c.githubToken, "GET", path);
  const cards = async () =>
    (await dash<{ cards: Card[] }>("GET", `/api/e2e/cards?project=${PROJECT}`)).cards;

  /** The newest run of a workflow on a branch created at or after `since`, once it has finished. */
  async function finishedRun(
    workflow: string,
    branch: string,
    since: number,
    what: string,
    ms: number,
  ) {
    const path = `/repos/${c.repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=20`;
    let seen = "no runs";
    const run = await wait(
      what,
      ms,
      async () => {
        const r = await gh(path);
        if (r.status !== 200)
          throw new Error(`GET ${path} returned ${r.status}: ${r.text.slice(0, 200)}`);
        const newest = (r.json() as { workflow_runs: Run[] }).workflow_runs
          .filter((x) => Date.parse(x.created_at) >= since - SKEW_MS)
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
        seen = newest ? `${newest.status} ${newest.html_url}` : "no runs";
        return newest && newest.status === "completed" ? newest : undefined;
      },
      () => seen,
    );
    if (run.conclusion !== "success")
      throw new Error(`${workflow} on ${branch} ended as ${run.conclusion}: ${run.html_url}`);
    return run;
  }

  async function fileOnMain(path: string) {
    const r = await gh(`/repos/${c.repo}/contents/${path}?ref=main`);
    if (r.status !== 200)
      throw new Error(`${path} is missing on main (GitHub returned ${r.status}).`);
    const file = r.json() as { content?: string };
    return Buffer.from(file.content ?? "", "base64").toString("utf8");
  }

  // 1. Upload. Sources that already have a card are not "new".
  const oldSources = new Set(
    (await cards()).filter((x): x is ClaimCard => x.kind === "confirm_claims").map((x) => x.source),
  );
  const text = readFileSync(c.transcriptPath, "utf8");
  const uploadedAt = deps.now();
  const upload = await timed("Upload", () =>
    dash<{ path: string; branch: string }>("POST", "/api/e2e/inbox", {
      project: PROJECT,
      name: "kickoff-2026-10-02.txt",
      text,
    }),
  );
  say(`1. Uploaded the kickoff transcript to ${upload.branch}.`);

  // 2. Intake
  const intake = await timed("Intake", () =>
    finishedRun("intake.yml", upload.branch, uploadedAt, "the intake run", c.intakeTimeoutMs),
  );
  say(`2. Intake passed: ${intake.html_url}`);

  // 3. Confirm card
  let seenCards: Card[] = [];
  const claimCard = await timed("Confirm card", () =>
    wait(
      "the confirm claims card",
      c.cardsTimeoutMs,
      async () => {
        seenCards = await cards();
        return seenCards.find(
          (x): x is ClaimCard =>
            x.kind === "confirm_claims" && !oldSources.has((x as ClaimCard).source),
        );
      },
      () => JSON.stringify(seenCards),
    ),
  );
  const claimIds = claimCard.claims.map((x) => x.id);
  say(`3. Confirm card for ${claimCard.source} with ${claimIds.length} claims.`);

  // 4. Confirm
  const confirmedAt = deps.now();
  const confirm = await timed("Confirm", () =>
    dash<{ apr: string }>("POST", "/api/e2e/act", {
      project: PROJECT,
      kind: "confirm",
      decision: "approved",
      targets: claimIds,
      versions: Object.fromEntries(claimCard.claims.map((x) => [x.id, x.version])),
    }),
  );
  say(`4. Confirmed the claims: ${confirm.apr}.`);

  // 5. BA
  const ba = await timed("BA", () =>
    finishedRun("ba.yml", "main", confirmedAt, "the BA run", c.baTimeoutMs),
  );
  say(`5. BA passed: ${ba.html_url}`);

  // 6. Approve
  const isBr = (x: Card): x is ApproveCard =>
    x.kind === "approve" && /^BR-/.test((x as ApproveCard).record);
  const brCard = await timed("Approve card", () =>
    wait(
      "the approve card for a BR",
      c.cardsTimeoutMs,
      async () => {
        seenCards = await cards();
        return seenCards.find(isBr);
      },
      () => JSON.stringify(seenCards),
    ),
  );
  const br = brCard.record;
  const approve = await timed("Approve", () =>
    dash<{ apr: string }>("POST", "/api/e2e/act", {
      project: PROJECT,
      kind: "approve",
      decision: "approved",
      targets: [br],
      versions: { [br]: brCard.version },
    }),
  );
  say(`6. Approved ${br}: ${approve.apr}.`);

  // 7. Approved in the index
  const threadPath = `/api/e2e/thread/${br}?project=${PROJECT}`;
  await timed("Approved in index", async () => {
    await wait(
      `the approve card for ${br} to go`,
      c.cardsTimeoutMs,
      async () => {
        seenCards = await cards();
        return seenCards.some((x) => isBr(x) && x.record === br) ? undefined : true;
      },
      () => JSON.stringify(seenCards),
    );
    let status = "no thread";
    await wait(
      `${br} to show status approved`,
      c.cardsTimeoutMs,
      async () => {
        const r = await call(c.factoryUrl, c.apiToken, "GET", threadPath);
        if (r.status === 404) return undefined;
        if (r.status !== 200)
          throw new Error(`GET ${threadPath} returned ${r.status}: ${r.text.slice(0, 200)}`);
        status = (r.json() as Thread).br.status;
        return status === "approved" ? true : undefined;
      },
      () => status,
    );
  });
  say(`7. ${br} shows status approved.`);

  // 8. Trace and git
  await timed("Trace and git", async () => {
    const thread = await dash<Thread>("GET", threadPath);
    if (thread.evidence.length < 1) throw new Error(`${br} has no claims in its trace.`);
    for (const e of thread.evidence) {
      const gaps = [
        !e.quote && "words",
        (!e.speaker || e.speaker === "(unknown)") && "speaker",
        !e.location && "source location",
        e.source !== claimCard.source &&
          `source ${e.source || "(none)"}, expected ${claimCard.source}`,
      ].filter(Boolean);
      if (gaps.length) throw new Error(`${e.id} in the trace of ${br} lacks: ${gaps.join(", ")}.`);
    }

    await fileOnMain(`records/sources/${claimCard.source}/meta.yaml`);
    for (const id of claimIds) {
      const h = header(await fileOnMain(`records/claims/${id}.md`));
      if (h.confirmation !== "confirmed")
        throw new Error(`${id} has confirmation ${String(h.confirmation)} on main, not confirmed.`);
    }
    await fileOnMain(`records/approvals/${confirm.apr}.md`);
    await fileOnMain(`records/approvals/${approve.apr}.md`);
    const brHeader = header(await fileOnMain(`records/brs/${br}.md`));
    if (brHeader.status !== "approved")
      throw new Error(`${br} has status ${String(brHeader.status)} on main, not approved.`);
    if (brHeader.approval !== approve.apr)
      throw new Error(`${br} has approval ${String(brHeader.approval)}, expected ${approve.apr}.`);
  });
  say(`8. Trace and git checks passed for ${br}.`);

  return {
    src: claimCard.source,
    claims: claimIds,
    confirmApr: confirm.apr,
    br,
    approveApr: approve.apr,
    intakeRun: intake.html_url,
    baRun: ba.html_url,
    steps,
  };
}

/** A Markdown table of the run, for stdout and the GitHub Actions job summary. */
export function formatSummary(r: F01Result): string {
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  return [
    "### F-01 end to end: passed",
    "",
    "| What | Value |",
    "| --- | --- |",
    `| Source | ${r.src} |`,
    `| Claims | ${r.claims.join(", ")} |`,
    `| Confirm approval | ${r.confirmApr} |`,
    `| Business requirement | ${r.br} |`,
    `| Approve approval | ${r.approveApr} |`,
    `| Intake run | ${r.intakeRun} |`,
    `| BA run | ${r.baRun} |`,
    "",
    "| Step | Duration |",
    "| --- | --- |",
    ...r.steps.map((s) => `| ${s.step} | ${secs(s.ms)} |`),
    "",
  ].join("\n");
}
