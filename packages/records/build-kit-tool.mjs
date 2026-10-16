/* global process, console, URL */
// Builds kit/tools/records.mjs (the records CLI) and kit/hooks/validate-records.mjs (the PostToolUse hook):
// each bundled with its dependencies, so a project runs them with plain `node` and no factory repo.
// `--check` fails if a committed file is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const targets = [
  { entry: "src/cli.ts", out: "kit/tools/records.mjs" },
  { entry: "src/hook.ts", out: "kit/hooks/validate-records.mjs" },
];
const check = process.argv.includes("--check");
let stale = false;

for (const { entry, out } of targets) {
  const outfile = fileURLToPath(new URL(`../../${out}`, import.meta.url));
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: true,
    legalComments: "none",
    write: false,
    // Ajv and yaml are CommonJS; an ESM bundle needs a real `require` for them.
    banner: {
      js: [
        `// Built from packages/records/${entry} by \`pnpm --filter @factory/records build:kit-tool\`. Do not edit.`,
        "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
      ].join("\n"),
    },
  });
  const code = result.outputFiles[0].text;
  if (check) {
    let current = "";
    try {
      current = readFileSync(outfile, "utf8");
    } catch {
      // missing counts as stale
    }
    if (current !== code) {
      console.error(`${out} is stale. Run: pnpm --filter @factory/records build:kit-tool`);
      stale = true;
    } else console.log(`${out} is up to date.`);
  } else {
    writeFileSync(outfile, code);
    console.log(`Wrote ${out} (${Math.round(code.length / 1024)} KB).`);
  }
}
if (stale) process.exit(1);
