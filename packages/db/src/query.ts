import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type {
  IndexQueries,
  IndexQueryRequest,
  IndexedRecord,
  RecordHeader,
  TraceFinding,
  TraceNode,
} from "@factory/records";
import { cards } from "./cards";
import type { Db } from "./ledger";
import { indexSyncs, recordLinks, records } from "./schema";

const SEARCH_LIMIT = 20;
const DEFAULT_DEPTH = 5;

const toIndexed = (r: typeof records.$inferSelect): IndexedRecord => ({
  id: r.recordId,
  type: r.type,
  title: r.title,
  status: r.status,
  version: r.version,
  path: r.path,
  header: r.header as RecordHeader,
  body: r.body,
  commit: r.commitSha,
});

/** Escapes % and _ so search text is matched literally. */
const literal = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The read side of the index over Postgres. Deleted records are never returned. */
export function createIndexQueries(db: Db): IndexQueries {
  const live = (project: string) => and(eq(records.project, project), isNull(records.deletedAt));

  // Reads the project's links and live records once, then walks them in memory. Each node appears
  // once, under the first path that reaches it. Links to records that don't exist are skipped.
  async function trace(
    project: string,
    id: string,
    depth: number,
    dir: "up" | "down",
  ): Promise<TraceNode | undefined> {
    const rows = await db
      .select({
        id: records.recordId,
        type: records.type,
        title: records.title,
        status: records.status,
      })
      .from(records)
      .where(live(project));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const root = byId.get(id);
    if (!root) return undefined;
    const links = await db
      .select()
      .from(recordLinks)
      .where(eq(recordLinks.project, project))
      .orderBy(asc(recordLinks.toId), asc(recordLinks.fromId), asc(recordLinks.linkType));
    const next = new Map<string, { id: string; via: string }[]>();
    for (const l of links) {
      const [from, to] = dir === "up" ? [l.fromId, l.toId] : [l.toId, l.fromId];
      next.set(from, [...(next.get(from) ?? []), { id: to, via: l.linkType }]);
    }
    const seen = new Set([id]);
    const walk = (node: { id: string }, left: number, via?: string): TraceNode => {
      const r = byId.get(node.id)!;
      const children: TraceNode[] = [];
      if (left > 0) {
        for (const n of next.get(node.id) ?? []) {
          if (!byId.has(n.id) || seen.has(n.id)) continue;
          seen.add(n.id);
          children.push(walk(n, left - 1, n.via));
        }
      }
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        status: r.status,
        ...(via ? { via } : {}),
        children,
      };
    };
    return walk(root, depth);
  }

  return {
    async getRecord(project, id) {
      const [row] = await db
        .select()
        .from(records)
        .where(and(live(project), eq(records.recordId, id)));
      return row && toIndexed(row);
    },

    async listRecords(q: IndexQueryRequest) {
      const rows = await db
        .select()
        .from(records)
        .where(
          and(
            live(q.project),
            q.type ? eq(records.type, q.type) : undefined,
            q.status ? eq(records.status, q.status) : undefined,
            q.confirmation
              ? sql`${records.header} ->> 'confirmation' = ${q.confirmation}`
              : undefined,
            q.from_source
              ? sql`${records.header} #> '{links,from_source}' @> ${JSON.stringify([q.from_source])}::jsonb`
              : undefined,
          ),
        )
        .orderBy(asc(records.recordId));
      return rows.map(toIndexed);
    },

    async search(project, text, type) {
      const pattern = `%${literal(text)}%`;
      const rows = await db
        .select()
        .from(records)
        .where(
          and(
            live(project),
            type ? eq(records.type, type) : undefined,
            or(ilike(records.title, pattern), ilike(records.body, pattern)),
          ),
        )
        .orderBy(asc(records.recordId))
        .limit(SEARCH_LIMIT);
      return rows.map(toIndexed);
    },

    traceUp: (project, id, depth = DEFAULT_DEPTH) => trace(project, id, depth, "up"),
    traceDown: (project, id, depth = DEFAULT_DEPTH) => trace(project, id, depth, "down"),

    cards: (project) => cards(db, project),

    async latestSync(project) {
      const [row] = await db
        .select()
        .from(indexSyncs)
        .where(eq(indexSyncs.project, project))
        .orderBy(desc(indexSyncs.syncedAt))
        .limit(1);
      return (
        row && {
          commitSha: row.commitSha,
          syncedAt: row.syncedAt,
          ok: row.ok,
          findings: row.findings as TraceFinding[],
        }
      );
    },
  };
}
