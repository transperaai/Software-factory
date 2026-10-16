// The one place the dashboard reaches S1 (records toolkit) and S3 (index) code: real wiring.
// Tests inject fakes through ApprovalDeps instead.
import { allocateIds, createDb, createIndexQueries, records } from "@factory/db";
import { buildApproval as buildApprovalS1 } from "@factory/records";
import type {
  AllocateIdsRequest,
  ApprovalOptions,
  IndexQueries,
  ProjectRecord,
} from "@factory/records";
import { isNull } from "drizzle-orm";

export type StoredRecord = ProjectRecord;
export type BuildApprovalOpts = ApprovalOptions;
export type BuildApproval = typeof buildApprovalS1;
export type Allocate = (req: AllocateIdsRequest) => Promise<string[]>;

/** S1's buildApproval. */
export const buildApproval: BuildApproval = buildApprovalS1;

/** S3's allocateIds, bound to the database. */
export const allocate: Allocate = async (req) => {
  const db = createDb();
  if (!db) throw new Error("No database.");
  return allocateIds(db, req);
};

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
