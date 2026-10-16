import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { createIndexQueries } from "@factory/db";
import type { Db } from "@factory/db";
import { createTestDb } from "@factory/db/testing";
import { makeIndexHandlers } from "./handlers";
import { parseSyncPush } from "./parse";

const CLAIM =
  "---\nid: CLM-0001\ntype: claim\ntitle: Daily report\nstatus: draft\nversion: 1\ncreated_by: agent:intake\nconfirmation: pending\nlinks:\n  from_source: [SRC-001]\n  said_by: [SH-01]\n---\n\nDispatch needs a report.\n";
const BR =
  "---\nid: BR-01\ntype: business_requirement\ntitle: Report\nstatus: review\nversion: 2\ncreated_by: agent:ba\nlinks:\n  evidence: [CLM-0001@3]\n---\n";
const META =
  "id: SRC-001\ntype: source\ntitle: Kickoff\nstatus: draft\nversion: 1\ncreated_by: script:sorter\nsource_type: transcript\ndate: 2026-10-02\nraw_file: kickoff.txt\n";
const files = [
  { path: "records/claims/CLM-0001.md", content: CLAIM },
  { path: "records/sources/SRC-001/meta.yaml", content: META },
];

const post = (url: string, body: unknown, token = "test-token") =>
  new Request(`http://localhost/api/${url}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("parseSyncPush", () => {
  const push = (f: unknown) => ({ project: "p", commitSha: "abc", files: f, findings: [] });
  const error = (body: unknown) => {
    try {
      parseSyncPush(body);
    } catch (err) {
      return (err as Error).message;
    }
  };

  it("reads links, versions and meta.yaml", () => {
    const res = parseSyncPush(
      push([...files, { path: "records/business-requirements/BR-01.md", content: BR }]),
    );
    const byId = Object.fromEntries(res.records.map((r) => [r.recordId, r]));
    expect(byId["CLM-0001"]?.links).toEqual([
      { type: "from_source", to: "SRC-001" },
      { type: "said_by", to: "SH-01" },
    ]);
    expect(byId["BR-01"]).toMatchObject({
      version: 2,
      links: [{ type: "evidence", to: "CLM-0001", version: 3 }],
    });
    expect(byId["SRC-001"]).toMatchObject({ type: "source", body: "", title: "Kickoff" });
  });

  it("skips non-meta files under a source folder", () => {
    const res = parseSyncPush(
      push([
        ...files,
        { path: "records/sources/SRC-001/text.md", content: "L1 Sarah: hi" },
        { path: "records/sources/SRC-001/kickoff.md", content: "no header" },
      ]),
    );
    const inFolder = res.records.filter((r) => r.path.startsWith("records/sources/SRC-001/"));
    expect(inFolder.map((r) => r.recordId)).toEqual(["SRC-001"]);
  });

  it("refuses paths outside records/ and files over the caps", () => {
    expect(error(push([{ path: "docs/x.md", content: CLAIM }]))).toMatch(/files\[0\]\.path/);
    expect(error(push([{ path: "records/../x.md", content: CLAIM }]))).toMatch(/files\[0\]\.path/);
    expect(error(push([{ path: "records/other/meta.yaml", content: META }]))).toMatch(/path/);
    expect(error(push([{ path: "records/a.md", content: "x".repeat(200_001) }]))).toMatch(/large/);
    expect(error(push(Array.from({ length: 2_001 }, () => files[0])))).toMatch(/2000/);
  });

  it("refuses a repeated ID across a record and a meta.yaml", () => {
    const dup = META.replace("SRC-001", "CLM-0001");
    expect(error(push([files[0], { path: files[1]!.path, content: dup }]))).toMatch(/twice/);
  });

  it("refuses a bad meta.yaml and bad findings", () => {
    expect(error(push([{ path: files[1]!.path, content: "- a\n- b" }]))).toMatch(/mapping/);
    expect(error({ ...push([]), findings: [{ kind: "dead_link" }] })).toMatch(/findings\[0\]/);
  });
});

describe("index routes", () => {
  let db: Db;
  let h: ReturnType<typeof makeIndexHandlers>;
  beforeEach(async () => {
    db = await createTestDb();
    h = makeIndexHandlers({ token: () => "test-token", db: () => ({ db }) });
  });

  it.each([
    ["sync", "index/sync"],
    ["ids", "ids"],
    ["query", "index/query"],
  ] as const)("%s: 401 without a token or with a wrong one", async (name, url) => {
    const bare = new Request(`http://localhost/api/${url}`, { method: "POST", body: "{}" });
    expect((await h[name](bare)).status).toBe(401);
    expect((await h[name](post(url, {}, "nope"))).status).toBe(401);
  });

  it("503 when no token or database is configured", async () => {
    const none = makeIndexHandlers({ token: () => undefined, db: () => ({ db }) });
    expect((await none.ids(post("ids", {}))).status).toBe(503);
    const noDb = makeIndexHandlers({ token: () => "test-token", db: () => undefined });
    const body = { project: "p", prefix: "BR", count: 1, maxInTree: 0 };
    expect((await noDb.ids(post("ids", body))).status).toBe(503);
  });

  it("syncs, then answers queries", async () => {
    const res = await h.sync(
      post("index/sync", { project: "p", commitSha: "abc", files, findings: [] }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ records: 2, links: 2, deleted: 0 });
    const q = await h.query(post("index/query", { project: "p", confirmation: "pending" }));
    const { records } = await q.json();
    expect(records.map((r: { id: string }) => r.id)).toEqual(["CLM-0001"]);
    expect(await createIndexQueries(db).latestSync("p")).toMatchObject({ ok: true });
  });

  it("traces the fixture plus claims, a BR and an APR", async () => {
    const root = fileURLToPath(new URL("../../../../fixtures/f01/", import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(`${dir}/${e.name}`)
          : e.name.endsWith(".md")
            ? [`${dir}/${e.name}`]
            : [],
      );
    const fixture = walk("records").map((path) => ({
      path,
      content: readFileSync(join(root, path), "utf8"),
    }));
    const claim = (n: number, who: string, confirmation: string) => ({
      path: `records/claims/CLM-000${n}.md`,
      content: `---\nid: CLM-000${n}\ntype: claim\ntitle: Claim ${n}\nstatus: draft\nversion: 1\ncreated_by: agent:intake\nconfirmation: ${confirmation}\nlinks:\n  from_source: [SRC-001]\n  said_by: [${who}]\n---\n\nClaim ${n}.\n`,
    });
    const br = {
      path: "records/business-requirements/BR-01.md",
      content:
        "---\nid: BR-01\ntype: business_requirement\ntitle: Report\nstatus: review\nversion: 1\ncreated_by: agent:ba\nlinks:\n  evidence: [CLM-0001@1, CLM-0002@1]\n---\n",
    };
    const apr = {
      path: "records/approvals/APR-01.md",
      content:
        "---\nid: APR-01\ntype: approval\ntitle: Approve report\nstatus: approved\nversion: 1\ncreated_by: human:austin\nlinks:\n  approves: [BR-01@1]\n---\n",
    };
    const res = await h.sync(
      post("index/sync", {
        project: "p",
        commitSha: "abc",
        files: [
          ...fixture,
          files[1],
          claim(1, "SH-01", "confirmed"),
          claim(2, "SH-02", "confirmed"),
          claim(3, "SH-01", "pending"),
          br,
          apr,
        ],
        findings: [],
      }),
    );
    expect(res.status).toBe(200);
    const q = createIndexQueries(db);
    type N = { id: string; children: N[] } | undefined;
    const ids = (n: N): string[] => (n ? [n.id, ...n.children.flatMap(ids)] : []);
    const up = ids(await q.traceUp("p", "BR-01"));
    for (const id of ["CLM-0001", "CLM-0002", "SRC-001", "SH-01", "SH-02"])
      expect(up).toContain(id);
    expect(ids(await q.traceDown("p", "CLM-0001"))).toContain("BR-01");
  });

  it("allocates IDs", async () => {
    const res = await h.ids(post("ids", { project: "p", prefix: "CLM", count: 2, maxInTree: 4 }));
    expect(await res.json()).toEqual({ ids: ["CLM-0005", "CLM-0006"] });
  });

  it("400 with a plain message on a bad body", async () => {
    const bad = async (name: "sync" | "ids" | "query", body: unknown) => {
      const res = await h[name](post("x", body));
      expect(res.status).toBe(400);
      return (await res.json()).error as string;
    };
    expect(
      await bad("sync", { project: "p", files: [{ path: "src/a.md", content: "x" }] }),
    ).toMatch(/files\[0\]\.path/);
    expect(await bad("sync", { project: "Bad Name", files: [] })).toMatch(/project/);
    expect(await bad("ids", { project: "p", prefix: "CLM", count: 0, maxInTree: 0 })).toMatch(
      /count/,
    );
    expect(await bad("ids", { project: "p", prefix: "CLM", count: 1, maxInTree: 2e9 })).toMatch(
      /maxInTree/,
    );
    expect(await bad("query", { project: "p", type: 5 })).toMatch(/type/);
    const notJson = new Request("http://localhost/api/ids", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: "{",
    });
    expect((await h.ids(notJson)).status).toBe(400);
  });
});
