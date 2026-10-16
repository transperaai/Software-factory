// Reading and writing record files (design doc, "ID and trace schema"; F-01 plan, K1).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RECORDS } from "@factory/schemas";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { RecordHeader } from "./contracts";

export type ProjectRecord = { path: string; header: RecordHeader; body: string };
export type ProjectFiles = {
  records: Map<string, ProjectRecord>;
  /** Later files that claim an ID an earlier file already has. */
  duplicates: Array<{ id: string; path: string }>;
  /** Files whose header can't be read or has no id. */
  unreadable: Array<{ path: string; message: string }>;
};

const FIRST_KEYS = ["id", "type", "title", "status", "version", "created_by", "approval"];

/** Splits a Markdown record into its YAML header and body. Throws on a missing or unclosed header. */
export function parseRecord(content: string): { header: RecordHeader; body: string } {
  const BOM = String.fromCharCode(0xfeff);
  const lines = (content.startsWith(BOM) ? content.slice(1) : content).split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new Error("no YAML header: the file must start with ---");
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) throw new Error("YAML header is not closed with ---");
  const header = parseYaml(lines.slice(1, end).join("\n")) as unknown;
  if (typeof header !== "object" || header === null || Array.isArray(header))
    throw new Error("header must be a YAML mapping");
  return { header: header as RecordHeader, body: lines.slice(end + 1).join("\n") };
}

function orderedHeader(header: RecordHeader): RecordHeader {
  const out: Record<string, unknown> = {};
  for (const k of FIRST_KEYS) if (header[k] !== undefined) out[k] = header[k];
  for (const [k, v] of Object.entries(header))
    if (!FIRST_KEYS.includes(k) && k !== "links" && v !== undefined) out[k] = v;
  if (header.links !== undefined) out.links = header.links;
  return out as RecordHeader;
}

/** The record as a file: fixed key order, links last, one trailing newline. */
export function serializeRecord(header: RecordHeader, body: string): string {
  const yaml = stringifyYaml(orderedHeader(header), { lineWidth: 0 });
  const text = body.replace(/\s+$/, "");
  return `---\n${yaml}---\n${text ? `${text}\n` : ""}`;
}

/** Like serializeRecord, but source meta.yaml files are plain YAML with no body. */
export function serializeFor(path: string, header: RecordHeader, body: string): string {
  if (path.endsWith(".yaml")) return stringifyYaml(orderedHeader(header), { lineWidth: 0 });
  return serializeRecord(header, body);
}

/** Where a record lives: records/<folder>/<id>.md, or records/sources/<id>/meta.yaml for sources. */
export function recordPath(prefix: string, id: string): string {
  const spec = RECORDS.find((r) => r.prefix === prefix);
  if (!spec?.folder) throw new Error(`No folder for ID prefix ${prefix}`);
  if (prefix === "SRC") return `records/sources/${id}/meta.yaml`;
  return `records/${spec.folder}/${id}.md`;
}

function walk(dir: string, rel: string, out: string[]): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  );
  for (const entry of entries) {
    const path = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(join(dir, entry.name), path, out);
    // Inside records/sources/ only meta.yaml is a record; text.md and the raw file are not.
    else if (path.startsWith("records/sources/")) {
      if (entry.name === "meta.yaml") out.push(path);
    } else if (entry.name.endsWith(".md")) out.push(path);
  }
}

/** Every record in the project, keyed by ID. */
export function readProject(dir: string): ProjectFiles {
  const files: string[] = [];
  walk(join(dir, "records"), "records", files);
  const result: ProjectFiles = { records: new Map(), duplicates: [], unreadable: [] };
  for (const path of files) {
    try {
      const raw = readFileSync(join(dir, path), "utf8");
      let header: RecordHeader;
      let body = "";
      if (path.endsWith(".yaml")) {
        header = parseYaml(raw) as RecordHeader;
        if (typeof header !== "object" || header === null || Array.isArray(header))
          throw new Error("header must be a YAML mapping");
      } else ({ header, body } = parseRecord(raw));
      if (typeof header.id !== "string") throw new Error("missing id");
      if (result.records.has(header.id)) result.duplicates.push({ id: header.id, path });
      else result.records.set(header.id, { path, header, body });
    } catch (err) {
      result.unreadable.push({ path, message: (err as Error).message });
    }
  }
  return result;
}
