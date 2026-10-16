#!/usr/bin/env node
// Factory command line.
//   factory kit install --project <dir> [--kit <factory repo>] --ref <tag>
//   factory kit check   --project <dir>
//   factory eval run    --agent <name> --cases evals/<agent>/ [--out <file>] [--trigger <label>] [--judge opus]
//   factory eval store  <results file> --url <dashboard>     (token in FACTORY_INGEST_TOKEN)
//   factory e2e f01     (env: FACTORY_URL, FACTORY_API_TOKEN, GH_TOKEN, E2E_REPO_DIR; optional E2E_REPO)
import { execFile } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { CaseError, loadCases } from "./eval/cases.ts";
import { DEFAULT_TIMEOUTS, formatSummary, runF01 } from "./e2e/f01.ts";
import { opusJudge } from "./eval/judge.ts";
import { runEval, storeRun } from "./eval/run.ts";
import type { EvalRunFile } from "./eval/run.ts";
import { KitDeviationError, checkKit, installKit } from "./kit/install.ts";
import { checkoutRef } from "./kit/source.ts";

const execFileAsync = promisify(execFile);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string", default: "." },
    kit: { type: "string", default: "." },
    ref: { type: "string" },
    agent: { type: "string" },
    cases: { type: "string" },
    out: { type: "string" },
    trigger: { type: "string", default: "local" },
    judge: { type: "string" },
    url: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** A Markdown table of a run, for the GitHub Actions job summary. */
function summary(run: EvalRunFile): string {
  const rows = run.results.map(
    (r) =>
      `| ${r.caseId} | ${r.passed ? "pass" : "FAIL"} | ${r.score} | ${
        r.error ??
        r.rules
          .filter((x) => !x.passed)
          .map((x) => x.detail)
          .join("; ")
          .replace(/\|/g, "\\|")
      } |`,
  );
  return [
    `### Evals: ${run.agent}, ${run.casesPassed}/${run.casesTotal} passed ($${run.costUsd.toFixed(4)})`,
    "",
    "| Case | Result | Score | Failed rules |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

const [group, command, arg] = positionals;
const project = resolve(values.project);

if (group === "kit" && command === "install") {
  if (!values.ref) fail("Give the kit version to install, e.g. --ref kit-v0.1.0");
  const { root, source } = checkoutRef(resolve(values.kit), values.ref);
  try {
    const result = installKit(root, project, source);
    console.log(`Installed ${result.lock.kit} ${result.lock.version} (${source.sha.slice(0, 7)}).`);
    for (const p of result.changed) console.log(`  changed  ${p}`);
    for (const p of result.removed) console.log(`  removed  ${p}`);
    if (result.changed.length + result.removed.length === 0) console.log("  nothing changed");
  } catch (err) {
    if (err instanceof KitDeviationError) fail(err.message);
    throw err;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
} else if (group === "kit" && command === "check") {
  const result = checkKit(project);
  for (const p of result.missing) console.error(`missing   ${p}`);
  for (const p of result.modified) console.error(`modified  ${p}`);
  for (const p of result.settings) console.error(`hook not wired in .claude/settings.json: ${p}`);
  if (!result.ok) fail("Kit check failed: installed files differ from kit.lock.json.");
  console.log("Kit check passed.");
} else if (group === "eval" && command === "run") {
  if (values.judge && values.judge !== "opus") fail("--judge must be opus");
  if (!values.agent || !values.cases)
    fail("Give the agent and its cases, e.g. --agent scribe --cases evals/scribe/");
  let cases;
  try {
    cases = loadCases(resolve(values.cases));
  } catch (err) {
    if (err instanceof CaseError) fail(err.message);
    throw err;
  }
  console.log(`Running ${cases.length} ${values.agent} cases against this checkout's kit.`);
  const run = await runEval({
    factoryRoot: resolve(values.kit),
    agent: values.agent,
    cases,
    trigger: values.trigger,
    judge: values.judge === "opus" ? opusJudge : undefined,
    log: (line) => console.log(line),
  });
  const out = resolve(values.out ?? `eval-${values.agent}-${run.id}.json`);
  writeFileSync(out, `${JSON.stringify(run, null, 2)}\n`);
  console.log(
    `${run.casesPassed}/${run.casesTotal} passed, $${run.costUsd.toFixed(4)}. Results: ${out}`,
  );
  console.log(`Store them with: factory eval store ${out} --url <dashboard>`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(run));
} else if (group === "eval" && command === "store") {
  if (!arg || !values.url)
    fail(
      "Give the results file and the dashboard, e.g. factory eval store eval.json --url https://...",
    );
  const token = process.env.FACTORY_INGEST_TOKEN;
  if (!token) fail("Set FACTORY_INGEST_TOKEN to the dashboard's ingest token.");
  const run = JSON.parse(readFileSync(resolve(arg), "utf8")) as EvalRunFile;
  const result = await storeRun(run, values.url, token);
  console.log(
    result.stored ? `Stored run ${run.id}.` : `Run ${run.id} was already stored; nothing changed.`,
  );
} else if (group === "e2e" && command === "f01") {
  const { FACTORY_URL, FACTORY_API_TOKEN, GH_TOKEN, E2E_REPO, E2E_REPO_DIR } = process.env;
  if (!FACTORY_URL || !FACTORY_API_TOKEN || !GH_TOKEN || !E2E_REPO_DIR)
    fail("Set FACTORY_URL, FACTORY_API_TOKEN, GH_TOKEN and E2E_REPO_DIR.");
  try {
    const result = await runF01({
      fetch,
      exec: async (cmd, args, opts) => {
        try {
          const { stdout, stderr } = await execFileAsync(cmd, args, {
            cwd: opts.cwd,
            env: { ...process.env, ...opts.env },
            maxBuffer: 64 * 1024 * 1024,
          });
          return { code: 0, stdout, stderr };
        } catch (err) {
          const e = err as { code?: unknown; stdout?: string; stderr?: string; message: string };
          return {
            code: typeof e.code === "number" ? e.code : 1,
            stdout: e.stdout ?? "",
            stderr: e.stderr || e.message,
          };
        }
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      config: {
        ...DEFAULT_TIMEOUTS,
        factoryUrl: FACTORY_URL.replace(/\/+$/, ""),
        apiToken: FACTORY_API_TOKEN,
        githubToken: GH_TOKEN,
        repo: E2E_REPO ?? "transperaai/factory-e2e",
        repoDir: resolve(E2E_REPO_DIR),
        transcriptPath: resolve("fixtures/f01/inbox/kickoff-2026-10-02.txt"),
      },
    });
    const table = formatSummary(result);
    console.log(table);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
  } catch (err) {
    const message = (err as Error).message;
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### F-01 end to end: FAILED\n\n${message}\n`,
      );
    fail(message);
  }
} else {
  fail(
    [
      "Usage: factory kit install --project <dir> --ref <tag> [--kit <factory repo>]",
      "       factory kit check --project <dir>",
      "       factory eval run --agent <name> --cases evals/<agent>/ [--out <file>] [--trigger <label>] [--judge opus]",
      "       factory eval store <results file> --url <dashboard>",
      "       factory e2e f01",
    ].join("\n"),
  );
}
