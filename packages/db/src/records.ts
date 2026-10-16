import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./ledger";
import { records } from "./schema";

export type RecordRow = typeof records.$inferInsert;

/** Inserts or replaces records by (project, record ID). Re-sending the same files changes nothing. */
export async function upsertRecords(db: Db, rows: RecordRow[]) {
  if (rows.length === 0) return { upserted: 0 };
  await db
    .insert(records)
    .values(rows)
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
        updatedAt: sql`now()`,
      },
    });
  return { upserted: rows.length };
}

/** One record by project and ID, or undefined. */
export async function getRecord(db: Db, project: string, recordId: string) {
  const [row] = await db
    .select()
    .from(records)
    .where(and(eq(records.project, project), eq(records.recordId, recordId)));
  return row;
}
