// Turns an approval or a claim confirmation into records: the APR plus each changed target.
import type { RecordFile, RecordHeader } from "./contracts";
import { recordPath, serializeFor, serializeRecord, type ProjectRecord } from "./io";

export type ApprovalOptions = {
  records: Map<string, ProjectRecord>;
  aprId: string;
  kind: "approve" | "confirm";
  targets: string[];
  decision: "approved" | "rejected" | "changes_requested";
  approver: string;
  role: string;
  date: string;
  comment?: string;
};

export function buildApproval(opts: ApprovalOptions): RecordFile[] {
  const missing = opts.targets.filter((t) => !opts.records.has(t));
  if (missing.length > 0) throw new Error(`Can't approve missing record(s): ${missing.join(", ")}`);

  const approves = opts.targets.map((t) => `${t}@${opts.records.get(t)!.header.version}`);
  const word = opts.kind === "confirm" ? "Confirmation" : "Approval";
  const header: RecordHeader = {
    id: opts.aprId,
    type: "approval",
    title: `${word} of ${approves.join(", ")}`,
    status: "approved",
    version: 1,
    created_by: "human:austin",
    decision: opts.decision,
    approver: opts.approver,
    role: opts.role,
    date: opts.date,
    ...(opts.comment ? { comment: opts.comment } : {}),
    links: { approves },
  };
  const files: RecordFile[] = [
    { path: recordPath("APR", opts.aprId), content: serializeRecord(header, "") },
  ];

  for (const target of opts.targets) {
    const { path, header: before, body } = opts.records.get(target)!;
    const after: RecordHeader = { ...before };
    if (opts.kind === "approve") {
      if (opts.decision === "approved") {
        after.status = "approved";
        after.approval = opts.aprId;
      } else after.status = "draft";
    } else if (opts.decision === "approved") after.confirmation = "confirmed";
    else if (opts.decision === "rejected") after.confirmation = "rejected";
    else continue;
    files.push({ path, content: serializeFor(path, after, body) });
  }
  return files;
}
