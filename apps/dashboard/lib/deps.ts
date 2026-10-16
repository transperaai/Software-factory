// The one place the dashboard reaches S1 (records toolkit) and S3 (index) code. Until those streams
// are merged into f01, the production wiring here throws a clear error; tests inject fakes.
import { createDb, records } from "@factory/db";
import type { AllocateIdsRequest, IndexQueries, RecordFile, RecordHeader } from "@factory/records";

export type StoredRecord = { path: string; header: RecordHeader; body: string };

/** The input of `buildApproval` in packages/records/src/approve.ts (plans/F-01-S1.md, step 6). */
export type BuildApprovalOpts = {
  records: Map<string, StoredRecord>;
  aprId: string;
  kind: "approve" | "confirm";
  targets: string[];
  decision: "approved" | "rejected" | "changes_requested";
  approver: string;
  role: string;
  date: string;
  comment?: string;
};
export type BuildApproval = (opts: BuildApprovalOpts) => RecordFile[];
export type Allocate = (req: AllocateIdsRequest) => Promise<string[]>;

/** S1's buildApproval. */
export const buildApproval: BuildApproval = () => {
  throw new Error("The approval builder (S1) is not merged yet.");
};

/** S3's allocateIds, bound to the database. */
export const allocate: Allocate = () => {
  throw new Error("ID allocation (S3) is not merged yet.");
};

/** S3's createIndexQueries over the database; undefined until S3 is merged. */
export function getQueries(): IndexQueries | undefined {
  return undefined;
}

/** Projects that have records in the index. */
export async function listProjects(): Promise<string[]> {
  const db = createDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ project: records.project }).from(records);
  return rows.map((r) => r.project).sort();
}
