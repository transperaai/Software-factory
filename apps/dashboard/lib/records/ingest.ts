import { createDb, upsertRecords } from "@factory/db";
import type { Db, RecordRow } from "@factory/db";
import { parse as parseYaml } from "yaml";
import { authorized } from "../otel/handlers";

export type RecordsDeps = { token: () => string | undefined; db: () => Db | undefined };

export class RecordsError extends Error {}

const PROJECT = /^[a-z0-9][a-z0-9-]{0,62}$/;
const RECORD_PATH = /^records\/[A-Za-z0-9_./-]+\.md$/;
const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 200_000;

/** Splits a Markdown record into its YAML header and body. */
export function splitRecord(content: string): { header: Record<string, unknown>; body: string } {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new RecordsError("no YAML header");
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) throw new RecordsError("YAML header is not closed");
  const header = parseYaml(lines.slice(1, end).join("\n")) as unknown;
  if (!header || typeof header !== "object" || Array.isArray(header)) {
    throw new RecordsError("YAML header must be a mapping");
  }
  return {
    header: header as Record<string, unknown>,
    body: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
  };
}

/** Checks a records push and maps it to rows. Files that aren't records (e.g. .gitkeep) are never sent. */
export function parseRecordsPush(body: unknown): RecordRow[] {
  if (!body || typeof body !== "object") throw new RecordsError("expected a records push");
  const b = body as { project?: unknown; commitSha?: unknown; files?: unknown };
  if (typeof b.project !== "string" || !PROJECT.test(b.project))
    throw new RecordsError("project must be a repo-style name");
  if (!Array.isArray(b.files) || b.files.length > MAX_FILES)
    throw new RecordsError(`files must list up to ${MAX_FILES} records`);
  const commitSha = typeof b.commitSha === "string" ? b.commitSha.slice(0, 64) : "";
  const seen = new Set<string>();
  return b.files.map((f: { path?: unknown; content?: unknown }, i: number) => {
    const at = `files[${i}]`;
    if (typeof f?.path !== "string" || !RECORD_PATH.test(f.path) || f.path.includes("..")) {
      throw new RecordsError(`${at}.path must be a Markdown file under records/`);
    }
    if (typeof f.content !== "string" || f.content.length > MAX_FILE_BYTES)
      throw new RecordsError(`${at}.content is missing or too large`);
    let parsed;
    try {
      parsed = splitRecord(f.content);
    } catch (err) {
      throw new RecordsError(`${f.path}: ${(err as Error).message}`);
    }
    const { header, body: text } = parsed;
    if (typeof header.id !== "string" || typeof header.type !== "string")
      throw new RecordsError(`${f.path}: header needs id and type`);
    if (seen.has(header.id))
      throw new RecordsError(`${f.path}: record ID ${header.id} appears twice`);
    seen.add(header.id);
    return {
      project: b.project as string,
      recordId: header.id,
      type: header.type,
      title: typeof header.title === "string" ? header.title : "",
      status: typeof header.status === "string" ? header.status : "",
      path: f.path,
      header,
      body: text,
      commitSha,
    };
  });
}

/** POST /api/records: stores a project's record files in the index. Same bearer token as the OTel ingest. */
export function makeRecordsHandler(deps: RecordsDeps) {
  return async (req: Request): Promise<Response> => {
    if (!authorized(req.headers.get("authorization"), deps.token())) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let rows: RecordRow[];
    try {
      rows = parseRecordsPush(await req.json());
    } catch (err) {
      return Response.json(
        { error: err instanceof RecordsError ? err.message : "body is not valid JSON" },
        { status: 400 },
      );
    }
    const db = deps.db();
    if (!db) return Response.json({ error: "database not configured" }, { status: 503 });
    try {
      return Response.json(await upsertRecords(db, rows));
    } catch (err) {
      console.error("records upsert failed:", String((err as Error).message).split("\n")[0]);
      return Response.json({ error: "store failed; retry" }, { status: 503 });
    }
  };
}

export const recordsHandler = makeRecordsHandler({
  token: () => process.env.OTEL_INGEST_TOKEN,
  db: () => createDb(),
});
