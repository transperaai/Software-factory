#!/usr/bin/env node
// Factory command line.
//   factory kit install --project <dir> [--kit <factory repo>] --ref <tag>
//   factory kit check   --project <dir>
//   factory eval run    --agent <name> --cases evals/<agent>/ [--out <file>] [--trigger <label>]
//   factory eval store  <results file> --url <dashboard>     (token in FACTORY_INGEST_TOKEN)
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { CaseError, loadCases } from "./eval/cases.ts";
import { runEval, storeRun } from "./eval/run.ts";
import type { EvalRunFile } from "./eval/run.ts";
import { KitDeviationError, checkKit, installKit } from "./kit/install.ts";
import { checkoutRef } from "./kit/source.ts";

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
} else {
  fail(
    [
      "Usage: factory kit install --project <dir> --ref <tag> [--kit <factory repo>]",
      "       factory kit check --project <dir>",
      "       factory eval run --agent <name> --cases evals/<agent>/ [--out <file>] [--trigger <label>]",
      "       factory eval store <results file> --url <dashboard>",
    ].join("\n"),
  );
}
