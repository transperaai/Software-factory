// Runs an agent's eval cases. Each case gets a fresh workspace with the kit installed from this
// checkout, exactly as a project gets it, then the agent runs headless and the rules score the result.
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { installKit, readManifest } from "../kit/install.ts";
import { repoName } from "../kit/source.ts";
import type { EvalCase } from "./cases.ts";
import { noJudge, scoreRule } from "./rules.ts";
import type { Judge, RuleOutcome } from "./rules.ts";

/** What one headless agent run returns. */
export type AgentReply = {
  reply: string;
  isError: boolean;
  model: string;
  costUsd: number;
  durationMs: number;
};

export type AgentRunner = (opts: {
  cwd: string;
  agent: string;
  input: string;
}) => Promise<AgentReply>;

export type CaseResult = {
  caseId: string;
  passed: boolean;
  score: number;
  rules: RuleOutcome[];
  reply: string;
  error: string | null;
  model: string;
  costUsd: number;
  durationMs: number;
};

/** The results file `factory eval run` writes and `factory eval store` sends. */
export type EvalRunFile = {
  format: 1;
  id: string;
  agent: string;
  startedAt: string;
  finishedAt: string;
  kitVersion: string;
  gitSha: string;
  trigger: string;
  casesTotal: number;
  casesPassed: number;
  costUsd: number;
  results: CaseResult[];
};

/** Factory secrets the agent must never see. Everything else passes through (auth, proxy, telemetry). */
const SECRET =
  /^(DATABASE_URL|POSTGRES|PG[A-Z]|AUTH_|KIT_BOT_|GITHUB_TOKEN$|GH_TOKEN$|.*INGEST_TOKEN$|.*MCP_TOKEN$)/;

export function agentEnv(agent: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(base).filter(([k]) => !SECRET.test(k)));
  return {
    ...env,
    // The write guard hook reads this.
    FACTORY_AGENT: agent,
    // Tags eval usage in the cost ledger when telemetry is on.
    OTEL_RESOURCE_ATTRIBUTES: `factory.project=software-factory,factory.client=transpera,factory.agent=${agent},factory.slice=EVAL`,
  };
}

const TIMEOUT_MS = 5 * 60_000;

/** Runs the agent with `claude -p`. The case input goes in on stdin, never through a shell. */
export const claudeRunner: AgentRunner = ({ cwd, agent, input }) =>
  new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--agent",
      agent,
      "--permission-mode",
      "acceptEdits",
      "--output-format",
      "json",
      // Only the project's settings (the installed kit), so a developer's own setup can't change results.
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--no-session-persistence",
    ];
    const child = spawn("claude", args, {
      cwd,
      env: agentEnv(agent),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      try {
        const o = JSON.parse(out) as {
          result?: string;
          is_error?: boolean;
          total_cost_usd?: number;
          duration_ms?: number;
          modelUsage?: Record<string, unknown>;
        };
        resolve({
          reply: o.result ?? "",
          isError: Boolean(o.is_error),
          model: Object.keys(o.modelUsage ?? {}).join(","),
          costUsd: o.total_cost_usd ?? 0,
          durationMs: o.duration_ms ?? 0,
        });
      } catch {
        const why = signal ? `stopped by ${signal}` : `exit ${code}`;
        reject(new Error(`claude ${why}: ${(err || out).trim().split("\n").slice(-3).join(" ")}`));
      }
    });
    child.stdin.end(input);
  });

/** Files in the workspace and their hashes, leaving out what the kit installed. */
function snapshot(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path);
      if (rel === ".claude" || rel === ".factory" || rel === "kit.lock.json") continue;
      if (entry.isDirectory()) walk(path);
      else files.set(rel, createHash("sha256").update(readFileSync(path)).digest("hex"));
    }
  };
  walk(root);
  return files;
}

export type RunOptions = {
  factoryRoot: string;
  agent: string;
  cases: EvalCase[];
  trigger: string;
  runner?: AgentRunner;
  judge?: Judge;
  log?: (line: string) => void;
};

function gitSha(root: string): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", "kit", "schemas", "evals"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

export async function runCase(
  opts: Omit<RunOptions, "cases" | "trigger">,
  c: EvalCase,
  source: { repo: string; ref: string; sha: string },
): Promise<CaseResult> {
  const workspace = mkdtempSync(join(tmpdir(), `eval-${c.id}-`));
  try {
    installKit(opts.factoryRoot, workspace, source);
    mkdirSync(join(workspace, "records"), { recursive: true });
    for (const [path, content] of Object.entries(c.setup)) {
      mkdirSync(dirname(join(workspace, path)), { recursive: true });
      writeFileSync(join(workspace, path), content);
    }
    const before = snapshot(workspace);
    let reply: AgentReply;
    try {
      reply = await (opts.runner ?? claudeRunner)({
        cwd: workspace,
        agent: opts.agent,
        input: c.input,
      });
    } catch (err) {
      const rules = c.rules.map((r) => ({
        rule: r.rule,
        passed: false,
        detail: "agent did not run",
      }));
      return {
        caseId: c.id,
        passed: false,
        score: 0,
        rules,
        reply: "",
        error: (err as Error).message,
        model: "",
        costUsd: 0,
        durationMs: 0,
      };
    }
    const after = snapshot(workspace);
    const files = [...after]
      .filter(([p, h]) => before.get(p) !== h)
      .map(([p]) => p)
      .sort();
    const ctx = { workspace, reply: reply.reply, files };
    const rules: RuleOutcome[] = [];
    for (const rule of c.rules) rules.push(await scoreRule(rule, ctx, opts.judge ?? noJudge));
    const passedRules = rules.filter((r) => r.passed).length;
    const error = reply.isError ? `agent reported an error: ${reply.reply.slice(0, 200)}` : null;
    return {
      caseId: c.id,
      passed: !error && passedRules === rules.length,
      score: Math.round((passedRules / rules.length) * 10_000) / 10_000,
      rules,
      reply: reply.reply,
      error,
      model: reply.model,
      costUsd: reply.costUsd,
      durationMs: reply.durationMs,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/** Runs every case in order and returns the results file. Cases run one at a time to respect usage limits. */
export async function runEval(opts: RunOptions): Promise<EvalRunFile> {
  const startedAt = new Date().toISOString();
  const sha = gitSha(opts.factoryRoot);
  const source = { repo: repoName(opts.factoryRoot), ref: "working-tree", sha };
  const results: CaseResult[] = [];
  for (const c of opts.cases) {
    const result = await runCase(opts, c, source);
    opts.log?.(
      `${result.passed ? "pass" : "FAIL"}  ${c.id}  score ${result.score}${result.error ? `  (${result.error})` : ""}`,
    );
    for (const r of result.rules) if (!r.passed) opts.log?.(`        ${r.rule}: ${r.detail}`);
    results.push(result);
  }
  return {
    format: 1,
    id: randomUUID(),
    agent: opts.agent,
    startedAt,
    finishedAt: new Date().toISOString(),
    kitVersion: readManifest(opts.factoryRoot).version,
    gitSha: sha,
    trigger: opts.trigger,
    casesTotal: results.length,
    casesPassed: results.filter((r) => r.passed).length,
    costUsd: Math.round(results.reduce((sum, r) => sum + r.costUsd, 0) * 1e6) / 1e6,
    results,
  };
}

/** Sends a results file to the dashboard, which stores it in eval_runs and eval_results. */
export async function storeRun(
  file: EvalRunFile,
  dashboardUrl: string,
  token: string,
): Promise<{ stored: boolean }> {
  const res = await fetch(new URL("/api/evals/runs", dashboardUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(file),
  });
  const body = (await res.json().catch(() => ({}))) as { stored?: boolean; error?: string };
  if (!res.ok)
    throw new Error(`dashboard answered ${res.status}: ${body.error ?? "no reason given"}`);
  return { stored: Boolean(body.stored) };
}
