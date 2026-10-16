import type { IndexedRecord, IndexQueries, TraceNode } from "@factory/records";
import type { makeMcpHandler } from "./server";

const rec = (id: string, type: string, title: string): IndexedRecord => ({
  id,
  type,
  title,
  status: "draft",
  version: 1,
  path: `records/${id}.md`,
  header: { id, type, title, status: "draft", version: 1, created_by: "SH-00" },
  body: `Body of ${id}.`,
  commit: "abc1234",
});

export const RECORDS = [
  rec("SH-01", "stakeholder", "Sarah Kim"),
  rec("CLM-01", "claim", "Reports take a day"),
  rec("BR-01", "business_requirement", "Faster reports"),
];

export const TREE: TraceNode = {
  id: "CLM-01",
  type: "claim",
  title: "Reports take a day",
  status: "draft",
  children: [
    {
      id: "BR-01",
      type: "business_requirement",
      title: "Faster reports",
      status: "draft",
      via: "evidence",
      children: [],
    },
  ],
};

/** A fake index over RECORDS. Both traces return the same small tree. */
export const fakeQueries: IndexQueries = {
  getRecord: async (_p, id) => RECORDS.find((r) => r.id === id),
  listRecords: async (q) =>
    RECORDS.filter((r) => (!q.type || r.type === q.type) && (!q.status || r.status === q.status)),
  search: async (_p, text, type) =>
    RECORDS.filter(
      (r) => r.title.toLowerCase().includes(text.toLowerCase()) && (!type || r.type === type),
    ),
  traceUp: async (_p, id) => (id === "CLM-01" ? TREE : undefined),
  traceDown: async (_p, id) => (id === "CLM-01" ? TREE : undefined),
  cards: async () => [],
  latestSync: async () => undefined,
};

/** Calls the MCP route the way a Streamable HTTP client does, and reads the SSE reply. */
export async function rpc(
  h: ReturnType<typeof makeMcpHandler>,
  method: string,
  params: unknown,
  opts: { auth?: string; agent?: string } = {},
) {
  const headers: Record<string, string> = {
    authorization: opts.auth ?? "Bearer t",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
  };
  if (opts.agent !== undefined) headers["x-factory-agent"] = opts.agent;
  const res = await h(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const out = await res.text();
  const data = out.split("\n").find((l) => l.startsWith("data: "));
  return { status: res.status, body: data ? JSON.parse(data.slice(6)) : out };
}
