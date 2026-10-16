import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Card, TraceFinding } from "@factory/records";
import type { Db } from "./ledger";
import { indexSyncs, recordLinks, records } from "./schema";

/** Dashboard cards (plan K8), computed from the index. Optionally for one project. */
export async function cards(db: Db, project?: string): Promise<Card[]> {
  const inProject = project ? eq(records.project, project) : undefined;
  const live = and(isNull(records.deletedAt), inProject);
  const out: Card[] = [];

  // Confirm claims: pending claims that someone is recorded as saying, grouped by source.
  const pending = await db
    .select({
      project: records.project,
      id: records.recordId,
      source: sql<string | null>`${records.header} #>> '{links,from_source,0}'`,
    })
    .from(records)
    .where(
      and(
        live,
        eq(records.type, "claim"),
        sql`${records.header} ->> 'confirmation' = 'pending'`,
        sql`exists (select 1 from ${recordLinks} l where l.project = ${records.project}
          and l.from_id = ${records.recordId} and l.link_type = 'said_by')`,
      ),
    )
    .orderBy(asc(records.project), asc(records.recordId));
  const bySource = new Map<string, { project: string; source: string; claims: string[] }>();
  for (const c of pending) {
    if (!c.source) continue;
    const key = `${c.project}\u0000${c.source}`;
    const group = bySource.get(key) ?? { project: c.project, source: c.source, claims: [] };
    group.claims.push(c.id);
    bySource.set(key, group);
  }
  for (const g of bySource.values()) {
    const [src] = await db
      .select({ title: records.title })
      .from(records)
      .where(
        and(
          eq(records.project, g.project),
          eq(records.recordId, g.source),
          isNull(records.deletedAt),
        ),
      );
    out.push({
      kind: "confirm_claims",
      project: g.project,
      source: g.source,
      sourceTitle: src?.title || g.source,
      claims: g.claims,
    });
  }

  // Approve: in review, no approval yet.
  const review = await db
    .select()
    .from(records)
    .where(and(live, eq(records.status, "review"), sql`${records.header} ->> 'approval' is null`))
    .orderBy(asc(records.project), asc(records.recordId));
  for (const r of review) {
    out.push({
      kind: "approve",
      project: r.project,
      record: r.recordId,
      type: r.type,
      title: r.title,
      version: r.version,
    });
  }

  // Broken links: findings of each project's latest sync.
  const latest = await db
    .selectDistinctOn([indexSyncs.project], {
      project: indexSyncs.project,
      findings: indexSyncs.findings,
    })
    .from(indexSyncs)
    .where(project ? eq(indexSyncs.project, project) : undefined)
    .orderBy(asc(indexSyncs.project), sql`${indexSyncs.syncedAt} desc`);
  for (const s of latest) {
    for (const f of s.findings as TraceFinding[]) {
      if (f.kind === "dead_link")
        out.push({ kind: "broken_link", project: s.project, record: f.recordId, detail: f.detail });
    }
  }
  return out;
}
