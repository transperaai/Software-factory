import type { SyncRecord } from "./index-sync";

type Links = Record<string, string[]>;

/** A synced record for tests. Links come from the header, as the dashboard's parser reads them. */
export function rec(
  id: string,
  type: string,
  fields: {
    title?: string;
    status?: string;
    body?: string;
    links?: Links;
    [k: string]: unknown;
  } = {},
  project = "p",
): SyncRecord {
  const { title = id, status = "draft", body = "", links, ...rest } = fields;
  const header = {
    id,
    type,
    title,
    status,
    version: 1,
    created_by: "human:austin",
    ...rest,
    ...(links ? { links } : {}),
  };
  return {
    project,
    recordId: id,
    type,
    title,
    status,
    path: `records/${type}/${id}.md`,
    header,
    body,
    commitSha: "c1",
    version: 1,
    links: Object.entries(links ?? {}).flatMap(([type, refs]) =>
      refs.map((ref) => {
        const [to = ref, version] = ref.split("@");
        return { type, to, ...(version ? { version: Number(version) } : {}) };
      }),
    ),
  };
}

const said = (by: string) => ({ from_source: ["SRC-001"], said_by: [by] });

/** Two stakeholders, a source, three claims (one pending), BR-01 in review and an approval. */
export function threadFixture(project = "p"): SyncRecord[] {
  return [
    rec("SH-01", "stakeholder", { title: "Sarah Kim" }, project),
    rec("SH-02", "stakeholder", { title: "Tom Ode" }, project),
    rec("SRC-001", "source", { title: "Kickoff call" }, project),
    rec(
      "CLM-0001",
      "claim",
      { confirmation: "confirmed", body: "Dispatch needs a daily report", links: said("SH-01") },
      project,
    ),
    rec("CLM-0002", "claim", { confirmation: "confirmed", links: said("SH-02") }, project),
    rec("CLM-0003", "claim", { confirmation: "pending", links: said("SH-01") }, project),
    rec(
      "BR-01",
      "business_requirement",
      { status: "review", links: { evidence: ["CLM-0001", "CLM-0002"] } },
      project,
    ),
    rec("APR-0001", "approval", { links: { approves: ["BR-01@1"] } }, project),
  ];
}
