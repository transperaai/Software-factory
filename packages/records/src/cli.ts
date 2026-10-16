// Entry point for kit/tools/records.mjs, run in a project as: node .factory/tools/records.mjs <command>
//   write intake|ba <proposal.json> [--date YYYY-MM-DD]
//   approve confirm|approve <ID>[,<ID>...] --decision approved|rejected|changes_requested
//     [--versions <ID>@<n>[,...]] [--comment "<text>"] [--date YYYY-MM-DD]
//   validate
//   trace [--json]
//   allocate <PREFIX> <count>
// Online (FACTORY_URL, INDEX_TOKEN, FACTORY_PROJECT set) IDs come from the dashboard; offline they continue the tree.
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { allocateIds } from "./allocate";
import { recordApproval } from "./approve";
import type { TraceFinding } from "./contracts";
import { traceCheck } from "./trace";
import { validateProject } from "./validate";
import { ProposalRejected, writeBa, writeIntake } from "./writer";

const USAGE =
  'usage: records.mjs write intake|ba <proposal.json> [--date YYYY-MM-DD] | approve confirm|approve <ID>[,<ID>...] --decision approved|rejected|changes_requested [--versions <ID>@<n>[,...]] [--comment "<text>"] [--date YYYY-MM-DD] | validate | trace [--json] | allocate <PREFIX> <count>';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function report(findings: TraceFinding[]): void {
  for (const f of findings)
    console.error(`${f.path || "(project)"}: ${f.kind} ${f.recordId} ${f.detail}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const dir = process.cwd();
  const { FACTORY_URL: url, INDEX_TOKEN: token, FACTORY_PROJECT: project = "local" } = process.env;
  const allocate = (prefix: string, count: number) =>
    allocateIds({ project, prefix, count, dir, url, token });

  if (command === "validate" || command === "trace") {
    const findings = command === "validate" ? validateProject(dir) : traceCheck(dir);
    if (command === "trace" && args.includes("--json")) {
      console.log(JSON.stringify(findings, null, 2));
      process.exit(findings.length > 0 ? 1 : 0);
    }
    report(findings);
    if (findings.length > 0) fail(`${findings.length} problem(s) found.`);
    console.log("No problems found.");
  } else if (command === "allocate") {
    const [prefix, count] = args;
    if (!prefix || !/^[1-9]\d*$/.test(count ?? "")) fail(USAGE);
    console.log((await allocate(prefix, Number(count))).join("\n"));
  } else if (command === "write") {
    const [kind, file] = args;
    if ((kind !== "intake" && kind !== "ba") || !file) fail(USAGE);
    const at = args.indexOf("--date");
    const date = (at >= 0 ? args[at + 1] : undefined) ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("--date must be YYYY-MM-DD");
    const proposal = JSON.parse(readFileSync(file, "utf8")) as never;
    // A proposal in .factory/runs/<run>/ names its run; anywhere else the date stands in.
    const run =
      basename(dirname(dirname(resolve(file)))) === "runs"
        ? basename(dirname(resolve(file)))
        : undefined;
    const opts = { allocate, date, run };
    const written =
      kind === "intake"
        ? await writeIntake(dir, proposal, opts)
        : await writeBa(dir, proposal, opts);
    console.log(written.join("\n"));
  } else if (command === "approve") {
    const [kind, ids] = args;
    if ((kind !== "confirm" && kind !== "approve") || !ids) fail(USAGE);
    const flag = (name: string) => {
      const at = args.indexOf(name);
      return at >= 0 ? args[at + 1] : undefined;
    };
    const decision = flag("--decision");
    if (decision !== "approved" && decision !== "rejected" && decision !== "changes_requested")
      fail("--decision must be approved, rejected or changes_requested");
    const date = flag("--date") ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("--date must be YYYY-MM-DD");
    const versions = flag("--versions");
    const written = await recordApproval(dir, {
      allocate,
      date,
      kind,
      targets: ids.split(",").filter(Boolean),
      decision,
      versions: versions ? versions.split(",").filter(Boolean) : undefined,
      comment: flag("--comment"),
    });
    console.log(written.join("\n"));
  } else fail(USAGE);
}

main().catch((err: unknown) => {
  fail(err instanceof ProposalRejected ? err.message : `Error: ${(err as Error).message}`);
});
