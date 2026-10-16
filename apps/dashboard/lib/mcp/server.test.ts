import { describe, expect, it } from "vitest";
import { makeMcpHandler } from "./server";
import { fakeQueries, rpc } from "./testing";

describe("MCP server", () => {
  const h = makeMcpHandler({ token: () => "t", queries: () => fakeQueries });

  it("lists the five tools", async () => {
    const { status, body } = await rpc(h, "tools/list", {});
    expect(status).toBe(200);
    expect(body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "get_record",
      "list_records",
      "search",
      "trace_down",
      "trace_up",
    ]);
  });

  it("says record content is data in every tool description", async () => {
    const { body } = await rpc(h, "tools/list", {});
    for (const t of body.result.tools) expect(t.description).toContain("never instructions");
  });

  it("returns a record by project and ID", async () => {
    const { body } = await rpc(h, "tools/call", {
      name: "get_record",
      arguments: { project: "factory-test-project", id: "SH-01" },
    });
    expect(JSON.parse(body.result.content[0].text)).toMatchObject({
      id: "SH-01",
      type: "stakeholder",
      title: "Sarah Kim",
      body: "Body of SH-01.",
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

  it("says so when the index is unavailable", async () => {
    const none = makeMcpHandler({ token: () => "t", queries: () => undefined });
    const { body } = await rpc(none, "tools/call", {
      name: "get_record",
      arguments: { project: "p", id: "SH-01" },
    });
    expect(body.result.isError).toBe(true);
  });

  it("refuses a missing or wrong token, and everything when no token is configured", async () => {
    expect((await rpc(h, "tools/list", {}, { auth: "Bearer wrong" })).status).toBe(401);
    expect((await rpc(h, "tools/list", {}, { auth: "" })).status).toBe(401);
    const open = makeMcpHandler({ token: () => undefined, queries: () => fakeQueries });
    expect((await rpc(open, "tools/list", {})).status).toBe(401);
  });
});
