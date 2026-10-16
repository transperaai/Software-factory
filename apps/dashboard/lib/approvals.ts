import { AUSTIN, WORKFLOWS } from "@factory/records";
import type { IndexQueries } from "@factory/records";
import type { Allocate, BuildApproval, StoredRecord } from "@/lib/deps";
import type { GitHubOps } from "@/lib/github-app";

export type Decision = {
  project: string;
  kind: "approve" | "confirm";
  targets: string[];
  decision: "approved" | "rejected" | "changes_requested";
  comment?: string;
  /** The version of each target the user saw; a different current version refuses the decision. */
  versions?: Record<string, number>;
};

export type ApprovalDeps = {
  queries: IndexQueries;
  allocate: Allocate;
  buildApproval: BuildApproval;
  github: GitHubOps;
  now: () => Date;
};

/** Writes the APR (and the changed targets) to the project repo through a merged PR. Returns the APR ID. */
export async function recordDecision(d: Decision, deps: ApprovalDeps): Promise<string> {
  const { queries } = deps;
  const records = new Map<string, StoredRecord>();
  for (const id of d.targets) {
    const r = await queries.getRecord(d.project, id);
    if (!r) throw new Error(`No record ${id} in ${d.project}.`);
    const seen = d.versions?.[id];
    if (seen !== undefined && seen !== r.version)
      throw new Error(
        `${id} changed since you saw it (v${seen}, now v${r.version}). Reload and decide again.`,
      );
    if (d.kind === "approve" && (r.status !== "review" || r.header.approval))
      throw new Error(`${id} is not waiting for approval.`);
    if (d.kind === "confirm" && r.header.confirmation !== "pending")
      throw new Error(`${id} is not pending confirmation.`);
    records.set(id, { path: r.path, header: r.header, body: r.body });
  }

  const existing = await queries.listRecords({ project: d.project, type: "approval" });
  const maxInTree = Math.max(0, ...existing.map((r) => Number(/-(\d+)$/.exec(r.id)?.[1] ?? 0)));
  const [aprId] = await deps.allocate({ project: d.project, prefix: "APR", count: 1, maxInTree });
  if (!aprId) throw new Error("No APR ID was allocated.");

  const files = deps.buildApproval({
    records,
    aprId,
    kind: d.kind,
    targets: d.targets,
    decision: d.decision,
    approver: AUSTIN,
    role: "delivery lead",
    date: deps.now().toISOString().slice(0, 10),
    ...(d.comment ? { comment: d.comment } : {}),
  });

  const branch = `approval/${aprId}`;
  const title = `${aprId}: ${d.decision} ${d.targets.join(", ")}`;
  await deps.github.commitFiles({ branch, message: title, files });
  await deps.github.openAndMerge(branch, title, `Recorded from the dashboard by ${AUSTIN}.`);

  if (d.kind === "confirm" && d.decision === "approved") {
    const source = (records.get(d.targets[0]!)?.header.links?.from_source ?? [])[0];
    if (source) await deps.github.dispatch(WORKFLOWS.ba.file, "main", { source });
  }
  return aprId;
}
