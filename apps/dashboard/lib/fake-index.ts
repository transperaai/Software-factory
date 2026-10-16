// An in-memory IndexQueries for tests: fixtures/f01 plus a confirmed claim, a BR and an APR.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { Card, IndexQueries, IndexedRecord, RecordHeader, TraceNode } from "@factory/records";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../../fixtures/f01/records/stakeholders/", import.meta.url),
);

function rec(header: RecordHeader, body = "", path = `records/${header.id}.md`): IndexedRecord {
  return {
    id: header.id,
    type: header.type,
    title: header.title,
    status: header.status,
    version: header.version,
    path,
    header,
    body,
    commit: "abc123",
  };
}

function fixtureStakeholders(): IndexedRecord[] {
  return readdirSync(FIXTURE_DIR).map((f) => {
    const text = readFileSync(FIXTURE_DIR + f, "utf8");
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)!;
    return rec(parse(m[1]!) as RecordHeader, m[2], `records/stakeholders/${f}`);
  });
}

const base = { status: "draft", version: 1, created_by: "agent:intake" };

export function fakeRecords(): IndexedRecord[] {
  return [
    ...fixtureStakeholders(),
    rec({ ...base, id: "SRC-001", type: "source", title: "Kickoff workshop" }),
    rec({
      ...base,
      id: "CLM-0001",
      type: "claim",
      title: "We lose two hours a day re-keying orders",
      words: "We lose two hours a day re-keying orders.",
      location: "L12",
      claim_type: "fact",
      confirmation: "confirmed",
      links: { from_source: ["SRC-001"], said_by: ["SH-01"] },
    }),
    rec({
      ...base,
      id: "CLM-0002",
      type: "claim",
      title: "Drivers want a mobile app",
      words: "Drivers want a mobile app.",
      location: "L20",
      claim_type: "ask",
      confirmation: "pending",
      links: { from_source: ["SRC-001"], said_by: ["SH-02"] },
    }),
    rec({
      ...base,
      id: "BR-01",
      type: "business_requirement",
      title: "Orders flow in without re-keying",
      status: "review",
      created_by: "agent:ba",
      value: "Saves two hours a day",
      priority: "must",
      links: { evidence: ["CLM-0001"] },
    }),
    rec({
      ...base,
      id: "APR-0001",
      type: "approval",
      title: "Earlier approval",
      status: "approved",
      links: { approves: ["BR-02@1"] },
    }),
  ];
}

export function fakeQueries(records: IndexedRecord[] = fakeRecords()): IndexQueries {
  const get = (id: string) => records.find((r) => r.id === id);
  const node = (r: IndexedRecord, via?: string): TraceNode => ({
    id: r.id,
    type: r.type,
    title: r.title,
    status: r.status,
    ...(via ? { via } : {}),
    children: Object.entries(r.header.links ?? {}).flatMap(([type, ids]) =>
      ids.flatMap((i) => {
        const t = get(i.split("@")[0]!);
        return t ? [node(t, type)] : [];
      }),
    ),
  });
  return {
    getRecord: async (_p, id) => get(id),
    listRecords: async (q) =>
      records.filter(
        (r) =>
          (!q.type || r.type === q.type) &&
          (!q.status || r.status === q.status) &&
          (!q.confirmation || r.header.confirmation === q.confirmation) &&
          (!q.from_source || r.header.links?.from_source?.includes(q.from_source)),
      ),
    search: async () => [],
    traceUp: async (_p, id) => {
      const r = get(id);
      return r && node(r);
    },
    traceDown: async () => undefined,
    cards: async (project = "acme"): Promise<Card[]> => [
      {
        kind: "confirm_claims",
        project,
        source: "SRC-001",
        sourceTitle: "Kickoff workshop",
        claims: ["CLM-0002"],
      },
      {
        kind: "approve",
        project,
        record: "BR-01",
        type: "business_requirement",
        title: "Orders flow in without re-keying",
        version: 1,
      },
      { kind: "broken_link", project, record: "BR-01", detail: "BR-09 does not exist" },
    ],
    latestSync: async () => undefined,
  };
}
