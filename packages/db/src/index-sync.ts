import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { IndexSyncResponse, TraceFinding } from "@factory/records";
import type { Db } from "./ledger";
import type { RecordRow } from "./records";
import { indexSyncs, recordLinks, records } from "./schema";

export type SyncLink = { type: string; to: string; version?: number };
export type SyncRecord = RecordRow & { links: SyncLink[] };
export type SyncRequest = {
  project: string;
  commitSha: string;
  records: SyncRecord[];
  findings: TraceFinding[];
};

// Well under Postgres's 65,535 bind parameter limit at 12 columns a row.
const CHUNK = 500;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/**
 * Makes the project's index match a push exactly, in one transaction: upsert the records, mark the
 * ones the push no longer has as deleted, rebuild the links, and log the sync. Needs a driver with
 * transactions (not Neon over HTTP). Sending the same push twice changes nothing but the log.
 */
export async function syncProject(db: Db, req: SyncRequest): Promise<IndexSyncResponse> {
  const { project, commitSha, findings } = req;
  const rows = req.records;
  const ids = rows.map((r) => r.recordId);
  const links = new Map<string, typeof recordLinks.$inferInsert>();
  for (const r of rows) {
    for (const l of r.links) {
      links.set(`${r.recordId}\u0000${l.type}\u0000${l.to}`, {
        project,
        fromId: r.recordId,
        linkType: l.type,
        toId: l.to,
        toVersion: l.version ?? null,
      });
    }
  }

  return db.transaction(async (tx) => {
    for (const part of chunks(rows)) {
      await tx
        .insert(records)
        .values(
          part.map((r) => ({
            project,
            recordId: r.recordId,
            type: r.type,
            title: r.title,
            status: r.status,
            path: r.path,
            header: r.header,
            body: r.body,
            commitSha: r.commitSha,
            version: r.version,
            deletedAt: null,
          })),
        )
        .onConflictDoUpdate({
          target: [records.project, records.recordId],
          set: {
            type: sql`excluded.type`,
            title: sql`excluded.title`,
            status: sql`excluded.status`,
            path: sql`excluded.path`,
            header: sql`excluded.header`,
            body: sql`excluded.body`,
            commitSha: sql`excluded.commit_sha`,
            version: sql`excluded.version`,
            deletedAt: sql`null`,
            updatedAt: sql`now()`,
          },
          // Untouched rows keep their updated_at.
          setWhere: sql`${records.deletedAt} is not null
            or (${records.type}, ${records.title}, ${records.status}, ${records.path}, ${records.header}, ${records.body}, ${records.commitSha}, ${records.version})
            is distinct from (excluded.type, excluded.title, excluded.status, excluded.path, excluded.header, excluded.body, excluded.commit_sha, excluded.version)`,
        });
    }

    const gone = await tx
      .update(records)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(records.project, project),
          isNull(records.deletedAt),
          ids.length ? notInArray(records.recordId, ids) : undefined,
        ),
      )
      .returning({ id: records.recordId });

    await tx.delete(recordLinks).where(eq(recordLinks.project, project));
    for (const part of chunks([...links.values()])) await tx.insert(recordLinks).values(part);

    await tx.insert(indexSyncs).values({
      project,
      commitSha,
      recordCount: rows.length,
      ok: findings.length === 0,
      findings,
    });
    return { records: rows.length, links: links.size, deleted: gone.length };
  });
}
