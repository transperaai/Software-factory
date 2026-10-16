// Entry point for the kit's standalone schema checker (kit/tools/schema-check.mjs).
// Bundled with its dependencies so a project can run it with plain `node`, without the factory repo.
// Usage in a project: node .factory/tools/schema-check.mjs [<file-or-dir>...]   (default: the project root)
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RecordValidator, findRecordFiles } from "./validate.ts";

// Installed at .factory/tools/, next to .factory/schemas/.
const schemaDir = fileURLToPath(new URL("../schemas/", import.meta.url));
const targets = process.argv.slice(2);
if (targets.length === 0) targets.push(".");

const validator = new RecordValidator(schemaDir);
const files = targets.flatMap((t) => (statSync(t).isDirectory() ? findRecordFiles(t) : [t]));
let failed = 0;
for (const result of files.map((f) => validator.validateFile(f))) {
  if (result.ok) continue;
  failed++;
  for (const p of result.problems) console.error(`${result.file}: ${p.path} ${p.message}`);
}
console.log(`${files.length} record file(s) checked, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
