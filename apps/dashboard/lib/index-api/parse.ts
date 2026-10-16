import type { SyncLink, SyncRecord } from "@factory/db";
import { parseRef } from "@factory/records";
import type { TraceFinding } from "@factory/records";
import { parse as parseYaml } from "yaml";
import { RecordsError, parseRecordsPush } from "../records/ingest";

export { RecordsError as IndexApiError };

export type SyncPush = {
  project: string;
  commitSha: string;
  records: SyncRecord[];
  findings: TraceFinding[];
};

const PROJECT = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MD_PATH = /^records\/[A-Za-z0-9_./-]+\.md$/;
const META_PATH = /^records\/sources\/[A-Za-z0-9_-]+\/meta\.yaml$/;
const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 200_000;

/** `BR-01@2` becomes { to: "BR-01", version: 2 }. A ref we can't read is kept as written. */
function toLink(type: string, ref: string): SyncLink {
  const p = parseRef(ref);
  if (!p) return { type, to: ref };
  return {
    type,
    to: p.project ? `${p.project}:${p.id}` : p.id,
    ...(p.version ? { version: p.version } : {}),
  };
}

/** The links a header stores, from header.links: { type: [ref, …] }. */
export function linksOf(header: Record<string, unknown>): SyncLink[] {
  const links = header.links;
  if (!links || typeof links !== "object" || Array.isArray(links)) return [];
  return Object.entries(links).flatMap(([type, refs]) =>
    (Array.isArray(refs) ? refs : [])
      .filter((r): r is string => typeof r === "string")
      .map((r) => toLink(type, r)),
  );
}

function findingsOf(value: unknown): TraceFinding[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_FILES)
    throw new RecordsError("findings must be a list");
  return value.map((f: Partial<TraceFinding>, i) => {
    if (
      typeof f?.kind !== "string" ||
      typeof f.recordId !== "string" ||
      typeof f.path !== "string" ||
      typeof f.detail !== "string"
    )
      throw new RecordsError(`findings[${i}] needs kind, recordId, path and detail`);
    return { kind: f.kind, recordId: f.recordId, path: f.path, detail: f.detail } as TraceFinding;
  });
}

/**
 * Checks an index sync push and maps it to records with their links. Builds on the records push:
 * Markdown records as there, plus a source's meta.yaml (all header, no body).
 */
export function parseSyncPush(body: unknown): SyncPush {
  if (!body || typeof body !== "object") throw new RecordsError("expected an index sync push");
  const b = body as { project?: unknown; commitSha?: unknown; files?: unknown; findings?: unknown };
  if (typeof b.project !== "string" || !PROJECT.test(b.project))
    throw new RecordsError("project must be a repo-style name");
  if (!Array.isArray(b.files) || b.files.length > MAX_FILES)
    throw new RecordsError(`files must list up to ${MAX_FILES} records`);
  const commitSha = typeof b.commitSha === "string" ? b.commitSha.slice(0, 64) : "";
  const files = b.files as { path?: unknown; content?: unknown }[];

  // Check every file here, so errors name the right index; Markdown then goes through the records parser.
  files.forEach((f, i) => {
    const at = `files[${i}]`;
    if (
      typeof f?.path !== "string" ||
      f.path.includes("..") ||
      !(MD_PATH.test(f.path) || META_PATH.test(f.path))
    )
      throw new RecordsError(
        `${at}.path must be a Markdown file or a source meta.yaml under records/`,
      );
    if (typeof f.content !== "string" || f.content.length > MAX_FILE_BYTES)
      throw new RecordsError(`${at}.content is missing or too large`);
  });
  const isMeta = (f: { path?: unknown }) => META_PATH.test(f.path as string);

  const md = parseRecordsPush({
    project: b.project,
    commitSha,
    files: files.filter((f) => !isMeta(f)),
  });
  const records: SyncRecord[] = md.map((row) => ({
    ...row,
    version: versionOf(row.header),
    links: linksOf(row.header as Record<string, unknown>),
  }));
  const seen = new Set(records.map((r) => r.recordId));

  for (const f of files.filter(isMeta)) {
    const path = f.path as string;
    let header: unknown;
    try {
      header = parseYaml(f.content as string);
    } catch {
      throw new RecordsError(`${path}: not valid YAML`);
    }
    if (!header || typeof header !== "object" || Array.isArray(header))
      throw new RecordsError(`${path}: meta.yaml must be a mapping`);
    const h = header as Record<string, unknown>;
    if (typeof h.id !== "string" || typeof h.type !== "string")
      throw new RecordsError(`${path}: header needs id and type`);
    if (seen.has(h.id)) throw new RecordsError(`${path}: record ID ${h.id} appears twice`);
    seen.add(h.id);
    records.push({
      project: b.project,
      recordId: h.id,
      type: h.type,
      title: typeof h.title === "string" ? h.title : "",
      status: typeof h.status === "string" ? h.status : "",
      path,
      header: h,
      body: "",
      commitSha,
      version: versionOf(h),
      links: linksOf(h),
    });
  }
  return { project: b.project, commitSha, records, findings: findingsOf(b.findings) };
}

const versionOf = (header: unknown) => {
  const v = (header as { version?: unknown }).version;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : 1;
};
