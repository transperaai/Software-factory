import { describe, expect, it } from "vitest";
import { makeMcpHandler } from "./server";
import { agentFrom, canRead } from "./scopes";
import { fakeQueries, rpc } from "./testing";

const h = makeMcpHandler({ token: () => "t", queries: () => fakeQueries });
const P = "factory-test-project";

type Result = { isError?: boolean; content: { text: string }[] };

async function call(name: string, args: Record<string, unknown>, agent?: string) {
  const { body } = await rpc(h, "tools/call", { name, arguments: args }, { agent });
  return body.result as Result;
}
const ids = (r: Result) => (JSON.parse(r.content[0]!.text) as { id: string }[]).map((x) => x.id);

describe("scopes", () => {
  it("reads the agent header, and treats a malformed one as unset", () => {
    expect(agentFrom(new Headers({ "x-factory-agent": "intake" }))).toBe("intake");
    expect(agentFrom(new Headers({ "x-factory-agent": "In take!" }))).toBeUndefined();
    expect(agentFrom(new Headers({ "x-factory-agent": "BA" }))).toBeUndefined();
    expect(agentFrom(new Headers())).toBeUndefined();
  });

  it("limits listed agents; unlisted or unset agents read everything", () => {
    expect(canRead("intake", "business_requirement")).toBe(false);
    expect(canRead("intake", "claim")).toBe(true);
    expect(canRead("ba", "business_requirement")).toBe(true);
    expect(canRead("someone-else", "business_requirement")).toBe(true);
    expect(canRead(undefined, "business_requirement")).toBe(true);
  });

  it("treats an inherited property name like constructor as unscoped, without throwing", () => {
    expect(agentFrom(new Headers({ "x-factory-agent": "constructor" }))).toBe("constructor");
    expect(canRead("constructor", "business_requirement")).toBe(true);
    expect(canRead("toString", "claim")).toBe(true);
  });
});

describe("tools", () => {
  it("list_records returns IDs, types, titles and statuses only", async () => {
    const r = await call("list_records", { project: P, type: "claim" });
    expect(JSON.parse(r.content[0]!.text)).toEqual([
      { id: "CLM-01", type: "claim", title: "Reports take a day", status: "draft" },
    ]);
  });

  it("search returns the same shape", async () => {
    const r = await call("search", { project: P, text: "take a day" });
    expect(ids(r)).toEqual(["CLM-01"]);
    expect(JSON.parse(r.content[0]!.text)[0]).not.toHaveProperty("body");
  });

  it("trace_up and trace_down return the tree", async () => {
    for (const name of ["trace_up", "trace_down"]) {
      const r = await call(name, { project: P, id: "CLM-01", depth: 2 });
      expect(JSON.parse(r.content[0]!.text)).toMatchObject({
        id: "CLM-01",
        children: [{ id: "BR-01" }],
      });
    }
  });

  it("rejects a depth outside 1 to 5 and a bad type", async () => {
    const deep = await rpc(h, "tools/call", {
      name: "trace_down",
      arguments: { project: P, id: "CLM-01", depth: 9 },
    });
    expect(deep.body.error ?? deep.body.result?.isError).toBeTruthy();
    const bad = await rpc(h, "tools/call", {
      name: "list_records",
      arguments: { project: P, type: "Claim!" },
    });
    expect(bad.body.error ?? bad.body.result?.isError).toBeTruthy();
  });

  it("with agent intake: refuses a BR, hides BRs, prunes the BR from a trace", async () => {
    const got = await call("get_record", { project: P, id: "BR-01" }, "intake");
    expect(got.isError).toBe(true);
    expect(got.content[0]!.text).toBe("intake may not read business_requirement records");

    expect(ids(await call("list_records", { project: P }, "intake"))).toEqual(["SH-01", "CLM-01"]);
    expect(ids(await call("search", { project: P, text: "faster" }, "intake"))).toEqual([]);

    const t = await call("trace_down", { project: P, id: "CLM-01" }, "intake");
    expect(JSON.parse(t.content[0]!.text)).toMatchObject({ id: "CLM-01", children: [] });
  });

  it("with agent intake: a trace must start in scope", async () => {
    const br = {
      id: "BR-01",
      type: "business_requirement",
      title: "x",
      status: "draft",
      children: [],
    };
    const h2 = makeMcpHandler({
      token: () => "t",
      queries: () => ({ ...fakeQueries, traceUp: async () => br }),
    });
    const { body } = await rpc(
      h2,
      "tools/call",
      { name: "trace_up", arguments: { project: P, id: "BR-01" } },
      { agent: "intake" },
    );
    expect(body.result.isError).toBe(true);
  });

  it("with no agent header, or a malformed one, everything is visible", async () => {
    expect((await call("get_record", { project: P, id: "BR-01" })).isError).toBeUndefined();
    expect(ids(await call("list_records", { project: P }))).toEqual(["SH-01", "CLM-01", "BR-01"]);
    expect(ids(await call("list_records", { project: P }, "Bad Agent!"))).toHaveLength(3);
    const t = await call("trace_down", { project: P, id: "CLM-01" });
    expect(JSON.parse(t.content[0]!.text).children).toHaveLength(1);
  });
});
