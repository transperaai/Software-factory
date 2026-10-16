import { allocateIds, createIndexQueries, createTxDb, syncProject } from "@factory/db";
import type { Db } from "@factory/db";
import type { AllocateIdsRequest, IndexQueryRequest } from "@factory/records";
import { authorized } from "../otel/handlers";
import { IndexApiError, parseSyncPush } from "./parse";

/** A database for one request. `close` is called when the request is done. Needs transactions (sync). */
export type IndexDb = { db: Db; close?: () => Promise<unknown> };
export type IndexDeps = { token: () => string | undefined; db: () => IndexDb | undefined };

const json = (status: number, body: unknown) => Response.json(body, { status });
const PROJECT = /^[a-z0-9][a-z0-9-]{0,62}$/;

function parseIds(body: unknown): AllocateIdsRequest {
  const b = (body ?? {}) as Partial<AllocateIdsRequest>;
  if (typeof b.project !== "string" || !PROJECT.test(b.project))
    throw new IndexApiError("project must be a repo-style name");
  if (typeof b.prefix !== "string" || !/^[A-Z]{1,10}$/.test(b.prefix))
    throw new IndexApiError("prefix must be capital letters, such as CLM");
  if (!Number.isInteger(b.count) || b.count! < 1 || b.count! > 200)
    throw new IndexApiError("count must be a whole number from 1 to 200");
  if (!Number.isInteger(b.maxInTree) || b.maxInTree! < 0 || b.maxInTree! > 1_000_000)
    throw new IndexApiError("maxInTree must be a whole number from 0 to 1000000");
  return b as AllocateIdsRequest;
}

function parseQuery(body: unknown): IndexQueryRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.project !== "string" || !PROJECT.test(b.project))
    throw new IndexApiError("project must be a repo-style name");
  const q: IndexQueryRequest = { project: b.project };
  for (const key of ["type", "status", "confirmation", "from_source"] as const) {
    if (b[key] === undefined) continue;
    if (typeof b[key] !== "string") throw new IndexApiError(`${key} must be a string`);
    q[key] = b[key];
  }
  return q;
}

/** One POST handler: token check, parse (400), database (503), then the work. */
function makeHandler<In, Out>(
  deps: IndexDeps,
  parse: (body: unknown) => In,
  run: (db: Db, input: In) => Promise<Out>,
) {
  return async (req: Request): Promise<Response> => {
    const token = deps.token();
    if (!token) return json(503, { error: "index token not configured" });
    if (!authorized(req.headers.get("authorization"), token)) {
      return json(401, { error: "unauthorized" });
    }
    let input: In;
    try {
      input = parse(await req.json());
    } catch (err) {
      return json(400, {
        error: err instanceof IndexApiError ? err.message : "body is not valid JSON",
      });
    }
    const conn = deps.db();
    if (!conn) return json(503, { error: "database not configured" });
    try {
      return json(200, await run(conn.db, input));
    } catch (err) {
      // First line only: driver errors can carry query text.
      console.error("index request failed:", String((err as Error).message).split("\n")[0]);
      return json(503, { error: "request failed; retry" });
    } finally {
      await conn.close?.().catch(() => undefined);
    }
  };
}

export function makeIndexHandlers(deps: IndexDeps) {
  return {
    sync: makeHandler(deps, parseSyncPush, (db, push) => syncProject(db, push)),
    ids: makeHandler(deps, parseIds, async (db, req) => ({ ids: await allocateIds(db, req) })),
    query: makeHandler(deps, parseQuery, async (db, q) => ({
      records: await createIndexQueries(db).listRecords(q),
    })),
  };
}

export const indexHandlers = makeIndexHandlers({
  token: () => process.env.INDEX_TOKEN,
  db: () => createTxDb(),
});
