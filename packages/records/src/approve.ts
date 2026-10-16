// Turns an approval or a claim confirmation into records: the APR plus each changed target.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RecordFile, RecordHeader } from "./contracts";
import { readProject, recordPath, serializeFor, serializeRecord, type ProjectRecord } from "./io";

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

export type RecordApprovalOptions = {
  allocate: (prefix: string, count: number) => Promise<string[]>;
  date: string;
  kind: "approve" | "confirm";
  targets: string[];
  decision: ApprovalOptions["decision"];
  /** `<ID>@<n>` entries: the versions Austin was shown. Each must match the record now. */
  versions?: string[];
  comment?: string;
};

/**
 * Checks the targets, then writes one APR and the changed records. Refuses before writing anything.
 * Returns the APR ID, then the written paths.
 */
export async function recordApproval(dir: string, opts: RecordApprovalOptions): Promise<string[]> {
  const { records } = readProject(dir);
  const missing = opts.targets.filter((t) => !records.has(t));
  if (missing.length > 0) throw new Error(`Can't approve missing record(s): ${missing.join(", ")}`);

  const problems: string[] = [];
  for (const v of opts.versions ?? []) {
    const [id, n] = v.split("@");
    const rec = records.get(id ?? "");
    if (!rec) problems.push(`${v}: no such record`);
    else if (String(rec.header.version) !== n)
      problems.push(`${id} is at version ${rec.header.version}, not ${n}`);
  }
  for (const t of opts.targets) {
    const h = records.get(t)!.header;
    if (opts.kind === "approve") {
      if (h.status !== "review") problems.push(`${t} is not in status review`);
      if (h.approval) problems.push(`${t} already has an approval (${h.approval})`);
    } else if (h.type !== "claim" || h.confirmation !== "pending")
      problems.push(`${t} is not a claim with confirmation pending`);
  }
  if (problems.length > 0)
    throw new Error(`Approval refused:\n${problems.map((p) => `- ${p}`).join("\n")}`);

  const [aprId] = await opts.allocate("APR", 1);
  const files = buildApproval({
    records,
    aprId: aprId!,
    kind: opts.kind,
    targets: opts.targets,
    decision: opts.decision,
    approver: "SH-00",
    role: "delivery lead",
    date: opts.date,
    comment: opts.comment,
  });
  for (const f of files) {
    const full = join(dir, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
  }
  return [aprId!, ...files.map((f) => f.path)];
}
