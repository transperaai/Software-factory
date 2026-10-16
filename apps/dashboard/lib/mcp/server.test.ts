import { beforeEach, describe, expect, it } from "vitest";
import { upsertRecords } from "@factory/db";
import type { Db } from "@factory/db";
import { createTestDb } from "@factory/db/testing";
import { makeMcpHandler } from "./server";

// Calls the MCP route the way a Streamable HTTP client does, and reads the SSE reply.
async function rpc(
  h: ReturnType<typeof makeMcpHandler>,
  method: string,
  params: unknown,
  auth = "Bearer t",
) {
  const res = await h(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        authorization: auth,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const data = text.split("\n").find((l) => l.startsWith("data: "));
  return { status: res.status, body: data ? JSON.parse(data.slice(6)) : text };
}

describe("MCP server", () => {
  let db: Db;
  let h: ReturnType<typeof makeMcpHandler>;
  beforeEach(async () => {
    db = await createTestDb();
    await upsertRecords(db, [
      {
        project: "factory-test-project",
        recordId: "SH-01",
        type: "stakeholder",
        title: "Sarah Kim",
        status: "draft",
        path: "records/stakeholders/SH-01.md",
        header: { id: "SH-01", type: "stakeholder", name: "Sarah Kim" },
        body: "Sponsors the new ops portal.",
        commitSha: "abc1234",
      },
    ]);
    h = makeMcpHandler({ token: () => "t", db: () => db });
  });

  it("lists get_record", async () => {
    const { status, body } = await rpc(h, "tools/list", {});
    expect(status).toBe(200);
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["get_record"]);
  });

  it("returns a record by project and ID", async () => {
    const { body } = await rpc(h, "tools/call", {
      name: "get_record",
      arguments: { project: "factory-test-project", id: "SH-01" },
    });
    const record = JSON.parse(body.result.content[0].text);
    expect(record).toMatchObject({
      id: "SH-01",
      type: "stakeholder",
      title: "Sarah Kim",
      body: "Sponsors the new ops portal.",
    });
  });

  it("says plainly when a record doesn't exist", async () => {
    const { body } = await rpc(h, "tools/call", {
      name: "get_record",
      arguments: { project: "factory-test-project", id: "SH-99" },
    });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toBe("No record SH-99 in factory-test-project.");
  });

  it("refuses a missing or wrong token, and everything when no token is configured", async () => {
    expect((await rpc(h, "tools/list", {}, "Bearer wrong")).status).toBe(401);
    expect((await rpc(h, "tools/list", {}, "")).status).toBe(401);
    const open = makeMcpHandler({ token: () => undefined, db: () => db });
    expect((await rpc(open, "tools/list", {})).status).toBe(401);
  });
});
