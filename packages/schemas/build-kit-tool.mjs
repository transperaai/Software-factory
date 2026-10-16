/* global process, console, URL */
// Builds kit/tools/schema-check.mjs: the schema checker bundled with its dependencies, so a project
// can run it with plain `node` and no factory repo. `--check` fails if the committed file is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const outfile = fileURLToPath(new URL("../../kit/tools/schema-check.mjs", import.meta.url));
const result = await build({
  entryPoints: [fileURLToPath(new URL("src/kit-cli.ts", import.meta.url))],
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
      "// Built from packages/schemas/src/kit-cli.ts by `pnpm --filter @factory/schemas build:kit-tool`. Do not edit.",
      "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    ].join("\n"),
  },
});
const code = result.outputFiles[0].text;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(outfile, "utf8");
  } catch {
    // missing counts as stale
  }
  if (current !== code) {
    console.error("kit/tools/schema-check.mjs is stale. Run: pnpm --filter @factory/schemas build:kit-tool");
    process.exit(1);
  }
  console.log("kit/tools/schema-check.mjs is up to date.");
} else {
  writeFileSync(outfile, code);
  console.log(`Wrote kit/tools/schema-check.mjs (${Math.round(code.length / 1024)} KB).`);
}
