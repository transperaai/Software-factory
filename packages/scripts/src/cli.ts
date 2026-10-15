#!/usr/bin/env node
// Factory command line.
//   factory kit install --project <dir> [--kit <factory repo>] --ref <tag>
//   factory kit check   --project <dir>
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { KitDeviationError, checkKit, installKit } from "./kit/install.ts";
import { checkoutRef } from "./kit/source.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string", default: "." },
    kit: { type: "string", default: "." },
    ref: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [group, command] = positionals;
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
} else {
  fail(
    "Usage: factory kit install --project <dir> --ref <tag> [--kit <factory repo>]\n       factory kit check --project <dir>",
  );
}
