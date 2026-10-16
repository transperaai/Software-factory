// Whole-project checks: every header against its schema, no reused IDs, no dead links.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { RecordValidator } from "@factory/schemas";
import type { TraceFinding } from "./contracts";
import { readProject } from "./io";

/** .factory/schemas in an installed project, schemas/ in the factory repo and its fixtures. */
export function schemaDirFor(dir: string): string {
  const installed = join(dir, ".factory/schemas");
  return existsSync(installed) ? installed : join(dir, "schemas");
}

/** The record a link points at: version and acceptance-criterion suffixes stripped. */
function targetOf(ref: string): string {
  return ref.replace(/[@#].*$/, "");
}

export function validateProject(dir: string, schemaDir = schemaDirFor(dir)): TraceFinding[] {
  const validator = new RecordValidator(schemaDir);
  const { records, duplicates, unreadable } = readProject(dir);
  const findings: TraceFinding[] = [];

  for (const { path, message } of unreadable)
    findings.push({ kind: "schema", recordId: "", path, detail: message });

  for (const [id, { path, header }] of records) {
    const problems = validator.validateData(header);
    if (problems.length > 0) {
      const detail = problems.map((p) => `${p.path} ${p.message}`).join("; ");
      findings.push({ kind: "schema", recordId: id, path, detail });
    }
  }

  for (const { id, path } of duplicates) {
    const first = records.get(id)?.path ?? "";
    findings.push({
      kind: "id_reused",
      recordId: id,
      path,
      detail: `${id} is also used by ${first}`,
    });
  }

  for (const [id, { path, header }] of records) {
    for (const [name, refs] of Object.entries(header.links ?? {})) {
      for (const ref of Array.isArray(refs) ? refs : []) {
        // Cross-project refs (ACME:BR-01) and pull requests (PR-118) aren't files here.
        if (typeof ref !== "string" || ref.includes(":") || ref.startsWith("PR-")) continue;
        const target = targetOf(ref);
        if (!records.has(target))
          findings.push({
            kind: "dead_link",
            recordId: id,
            path,
            detail: `links.${name} points at ${target}, which doesn't exist`,
          });
      }
    }
  }
  return findings;
}
