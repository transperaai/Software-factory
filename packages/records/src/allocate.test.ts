import { afterEach, describe, expect, it } from "vitest";
import { allocateIds } from "./allocate";
import { cleanUpProjects, makeProject } from "./test-project";

afterEach(cleanUpProjects);

describe("allocateIds", () => {
  it("offline, continues from the highest ID in the tree", async () => {
    const dir = makeProject();
    expect(await allocateIds({ project: "E2E", prefix: "SH", count: 2, dir })).toEqual([
      "SH-03",
      "SH-04",
    ]);
    expect(await allocateIds({ project: "E2E", prefix: "CLM", count: 1, dir })).toEqual([
      "CLM-0001",
    ]);
  });

  it("online, sends maxInTree and returns the server's IDs", async () => {
    const dir = makeProject();
    let seen: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ ids: ["SH-07"] }), { status: 200 });
    }) as unknown as typeof fetch;
    const ids = await allocateIds({
      project: "E2E",
      prefix: "SH",
      count: 1,
      dir,
      url: "https://factory.test/",
      token: "test-token",
      fetch: fake,
    });
    expect(ids).toEqual(["SH-07"]);
    expect(seen?.url).toBe("https://factory.test/api/ids");
    expect(JSON.parse(seen!.init.body as string)).toEqual({
      project: "E2E",
      prefix: "SH",
      count: 1,
      maxInTree: 2,
    });
  });

  it("throws on a non-200 without the token in the message", async () => {
    const dir = makeProject();
    const fake = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const err = await allocateIds({
      project: "E2E",
      prefix: "SH",
      count: 1,
      dir,
      url: "https://factory.test",
      token: "test-token",
      fetch: fake,
    }).catch((e: Error) => e);
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).not.toContain("test-token");
  });
});
