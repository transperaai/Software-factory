// Stand-ins for S1's readProject, serializeRecord and allocateIds, so the sorter CLI works before
// S1 is on this branch. Once S1 merges, cli.ts should pass the real functions and this file goes.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { formatId, parseRef } from "../ids";
import type { AllocateIdsRequest, AllocateIdsResponse, RecordHeader } from "../contracts";
import type { Deps, ProjectRecord } from "./deps";

const FIRST = ["id", "type", "title", "status", "version", "created_by", "approval"];

function walk(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

function readProject(dir: string) {
  const records = new Map<string, ProjectRecord>();
  const duplicates: ProjectRecord[] = [];
  for (const file of walk(join(dir, "records")).sort()) {
    const isMd = file.endsWith(".md");
    if (!isMd && !file.endsWith("/meta.yaml")) continue;
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    let header: RecordHeader;
    if (isMd) {
      const end = text.indexOf("\n---", 4);
      if (!text.startsWith("---\n") || end < 0) continue;
      header = parseYaml(text.slice(4, end)) as RecordHeader;
    } else {
      header = parseYaml(text) as RecordHeader;
    }
    const rec = { path: file.slice(dir.length + 1), header, body: "" };
    if (records.has(header.id)) duplicates.push(rec);
    else records.set(header.id, rec);
  }
  return { records, duplicates };
}

function serializeRecord(header: RecordHeader, body: string): string {
  const { links, ...rest } = header;
  const ordered: Record<string, unknown> = {};
  for (const k of FIRST) if (k in rest) ordered[k] = rest[k];
  for (const k of Object.keys(rest)) if (!(k in ordered)) ordered[k] = rest[k];
  if (links) ordered.links = links;
  return `---\n${stringifyYaml(ordered)}---\n${body ? `\n${body.trim()}\n` : ""}`;
}

export function localDeps(online?: { url: string; token: string; fetch?: typeof fetch }): Deps {
  return {
    readProject,
    serializeRecord,
    async allocate({ project, prefix, count, dir }) {
      let maxInTree = 0;
      for (const id of readProject(dir).records.keys()) {
        const ref = parseRef(id);
        if (ref?.prefix === prefix) maxInTree = Math.max(maxInTree, ref.n);
      }
      if (!online) {
        return Array.from({ length: count }, (_, i) => formatId(prefix, maxInTree + 1 + i));
      }
      const req: AllocateIdsRequest = { project, prefix, count, maxInTree };
      const res = await (online.fetch ?? fetch)(`${online.url}/api/ids`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${online.token}` },
        body: JSON.stringify(req),
      });
      if (res.status !== 200) throw new Error(`ID allocation failed with status ${res.status}.`);
      return ((await res.json()) as AllocateIdsResponse).ids;
    },
  };
}
