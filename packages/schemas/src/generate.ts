// Writes /schemas from definitions.ts. `--check` fails if /schemas is out of date (used in CI).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildAll } from "./build.ts";

const outDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));
const check = process.argv.includes("--check");

const files = Object.fromEntries(
  Object.entries(buildAll()).map(([name, json]) => [name, `${JSON.stringify(json, null, 2)}\n`]),
);
const existing = readdirSync(outDir).filter((f) => f.endsWith(".json"));
const stale = [
  ...Object.entries(files)
    .filter(([name, body]) => !existing.includes(name) || readFileSync(outDir + name, "utf8") !== body)
    .map(([name]) => name),
  ...existing.filter((name) => !(name in files)),
];

if (check) {
  if (stale.length > 0) {
    console.error(`schemas/ is out of date: ${stale.join(", ")}. Run: pnpm --filter @factory/schemas generate`);
    process.exit(1);
  }
  console.log(`schemas/ is up to date (${Object.keys(files).length} files).`);
} else {
  for (const [name, body] of Object.entries(files)) writeFileSync(outDir + name, body);
  console.log(`Wrote ${Object.keys(files).length} files to schemas/.`);
  const orphans = existing.filter((name) => !(name in files));
  if (orphans.length > 0) console.warn(`Not generated, remove by hand if unused: ${orphans.join(", ")}`);
}
