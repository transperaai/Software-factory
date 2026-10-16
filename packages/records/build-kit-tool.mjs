/* global process, console, URL */
// Builds the kit tools in kit/tools/: each one bundled with its dependencies, so a project can run
// it with plain `node` and no factory repo. `--check` fails if a committed file is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// One entry per tool. S1 adds its own (records.mjs) next to this one.
const TOOLS = [{ entry: "src/sorter/cli.ts", out: "intake-sort.mjs" }];

const check = process.argv.includes("--check");
let stale = false;
for (const { entry, out } of TOOLS) {
  const outfile = fileURLToPath(new URL(`../../kit/tools/${out}`, import.meta.url));
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: true,
    legalComments: "none",
    write: false,
    // yaml is CommonJS-friendly; an ESM bundle needs a real `require` for any CommonJS inside.
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
      console.error(
        `kit/tools/${out} is stale. Run: pnpm --filter @factory/records build:kit-tool`,
      );
      stale = true;
    } else {
      console.log(`kit/tools/${out} is up to date.`);
    }
  } else {
    writeFileSync(outfile, code);
    console.log(`Wrote kit/tools/${out} (${Math.round(code.length / 1024)} KB).`);
  }
}
if (stale) process.exit(1);
