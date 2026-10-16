import type { IndexQueries, TraceNode } from "@factory/records";

export type BrRow = { id: string; title: string; status: string; approval: string };
export type EvidenceView = {
  id: string;
  quote: string;
  speaker: string;
  source: string;
  location: string;
};
export type ThreadView = {
  br: { id: string; title: string; status: string; value: string; approval: string };
  evidence: EvidenceView[];
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function loadBrTable(q: IndexQueries, project: string): Promise<BrRow[]> {
  const brs = await q.listRecords({ project, type: "business_requirement" });
  return brs
    .map((r) => ({ id: r.id, title: r.title, status: r.status, approval: str(r.header.approval) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function claimIds(node: TraceNode, out: string[] = []): string[] {
  if (node.type === "claim" && !out.includes(node.id)) out.push(node.id);
  for (const c of node.children) claimIds(c, out);
  return out;
}

/** A BR and the claims behind it, found by walking its links upstream. */
export async function loadThread(
  q: IndexQueries,
  project: string,
  id: string,
): Promise<ThreadView | undefined> {
  const br = await q.getRecord(project, id);
  const tree = await q.traceUp(project, id);
  if (!br || !tree) return undefined;
  const evidence: EvidenceView[] = [];
  for (const cid of claimIds(tree)) {
    const c = await q.getRecord(project, cid);
    if (!c) continue;
    const said = c.header.links?.said_by?.[0];
    evidence.push({
      id: cid,
      quote: str(c.header.words) || c.title,
      speaker: said ? ((await q.getRecord(project, said))?.title ?? said) : "(unknown)",
      source: c.header.links?.from_source?.[0] ?? "",
      location: str(c.header.location),
    });
  }
  return {
    br: {
      id: br.id,
      title: br.title,
      status: br.status,
      value: str(br.header.value),
      approval: str(br.header.approval),
    },
    evidence,
  };
}
