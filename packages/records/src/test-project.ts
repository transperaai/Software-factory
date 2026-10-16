// Test helper: a temp copy of fixtures/f01 with the schemas, plus one source (SRC-001) with a text.md.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = fileURLToPath(new URL("../../../", import.meta.url));

export const SOURCE_TEXT = [
  "Kick-off, 2 October",
  "L2 [00:01:10] Sarah Kim: We lose about two hours a day re-keying requests.",
  "L3 [00:02:30] Tom Reyes: The   queue is   checked by hand every morning.",
].join("\n");

const dirs: string[] = [];

export function cleanUpProjects(): void {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

export function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "records-"));
  dirs.push(dir);
  cpSync(join(repo, "fixtures/f01"), dir, { recursive: true });
  cpSync(join(repo, "schemas"), join(dir, "schemas"), { recursive: true });
  writeFile(
    dir,
    "records/sources/SRC-001/meta.yaml",
    [
      "id: SRC-001",
      "type: source",
      "title: Kick-off workshop",
      "status: draft",
      "version: 1",
      "created_by: script:sorter",
      "source_type: transcript",
      "date: 2026-10-02",
      "raw_file: raw.txt",
      "participants:",
      "  - label: Sarah Kim",
      "    stakeholder: SH-01",
      "",
    ].join("\n"),
  );
  writeFile(dir, "records/sources/SRC-001/text.md", `${SOURCE_TEXT}\n`);
  return dir;
}

export function writeFile(dir: string, path: string, content: string): void {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** A claim file, confirmed or not. */
export function claimFile(id: string, confirmation: string, extra = ""): string {
  return [
    "---",
    `id: ${id}`,
    "type: claim",
    "title: A claim",
    "status: draft",
    "version: 1",
    "created_by: agent:intake",
    "words: We lose about two hours a day re-keying requests.",
    "location: L2",
    "claim_type: fact",
    "trust: strong",
    "quote: verbatim",
    `confirmation: ${confirmation}`,
    extra,
    "links:",
    "  from_source: [SRC-001]",
    "  said_by: [SH-01]",
    "---",
    "",
  ].join("\n");
}

export function brFile(id: string, status: string, evidence: string, extra = ""): string {
  return [
    "---",
    `id: ${id}`,
    "type: business_requirement",
    "title: Stop re-keying requests",
    `status: ${status}`,
    "version: 1",
    "created_by: agent:ba",
    extra,
    "value: Saves two hours a day",
    "priority: must",
    "owner: SH-01",
    "links:",
    `  evidence: [${evidence}]`,
    "---",
    "",
  ].join("\n");
}
