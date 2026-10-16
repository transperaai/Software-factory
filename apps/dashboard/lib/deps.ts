// The one place the dashboard reaches S3 (index) code: real wiring.
import { createDb, createIndexQueries, records } from "@factory/db";
import type { IndexQueries } from "@factory/records";
import { isNull } from "drizzle-orm";

/** S3's createIndexQueries over the database; undefined when no database is configured. */
export function getQueries(): IndexQueries | undefined {
  const db = createDb();
  return db ? createIndexQueries(db) : undefined;
}

/** Projects that have live records in the index. */
export async function listProjects(): Promise<string[]> {
  const db = createDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ project: records.project })
    .from(records)
    .where(isNull(records.deletedAt));
  return rows.map((r) => r.project).sort();
}
