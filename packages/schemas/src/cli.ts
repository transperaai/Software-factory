#!/usr/bin/env node
// Checks record headers against the JSON Schemas.
// Usage: factory-schema-check [--schemas <dir>] <file-or-project-dir>...
// A directory is scanned for project.yaml, records/**/*.md and records/sources/*/meta.yaml.
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RecordValidator, findRecordFiles } from "./validate.ts";

const args = process.argv.slice(2);
let schemaDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));
const targets: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--schemas") schemaDir = args[++i] ?? schemaDir;
  else targets.push(args[i]!);
}
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
