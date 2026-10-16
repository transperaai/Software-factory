import { beforeEach, describe, expect, it } from "vitest";
import { getRecord } from "@factory/db";
import type { Db } from "@factory/db";
import { createTestDb } from "@factory/db/testing";
import { makeRecordsHandler, parseRecordsPush } from "./ingest";

const SH01 =
  "---\nid: SH-01\ntype: stakeholder\ntitle: Sarah Kim\nstatus: draft\nversion: 1\ncreated_by: agent:scribe\nname: Sarah Kim\nrole: Operations manager\norganisation: Acme Logistics\n---\n\nSponsors the new ops portal.\n";
const push = (files: unknown, project = "factory-test-project") => ({
  project,
  commitSha: "a8a5253",
  files,
});
const post = (body: unknown, token = "t") =>
  new Request("http://localhost/api/records", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/records", () => {
  let db: Db;
  let handle: ReturnType<typeof makeRecordsHandler>;
  beforeEach(async () => {
    db = await createTestDb();
    handle = makeRecordsHandler({ token: () => "t", db: () => db });
  });

  it("stores a project's records so they can be found by ID", async () => {
    const res = await handle(
      post(push([{ path: "records/stakeholders/SH-01.md", content: SH01 }])),
    );
    expect(await res.json()).toEqual({ upserted: 1 });
    expect(await getRecord(db, "factory-test-project", "SH-01")).toMatchObject({
      type: "stakeholder",
      title: "Sarah Kim",
      body: "Sponsors the new ops portal.",
      commitSha: "a8a5253",
      header: expect.objectContaining({ organisation: "Acme Logistics" }),
    });
  });

  it("refuses a wrong token", async () => {
    expect((await handle(post(push([]), "nope"))).status).toBe(401);
  });

  it("names the problem in a bad push", async () => {
    const bad = async (body: unknown) => (await (await handle(post(body))).json()).error;
    expect(await bad(push([{ path: "../etc/passwd.md", content: SH01 }]))).toBe(
      "files[0].path must be a Markdown file under records/",
    );
    expect(await bad(push([{ path: "records/x.md", content: "no header" }]))).toBe(
      "records/x.md: no YAML header",
    );
    expect(await bad(push([], "Bad Name"))).toBe("project must be a repo-style name");
  });
});

describe("parseRecordsPush", () => {
  it("rejects the same ID twice", () => {
    const f = { path: "records/stakeholders/SH-01.md", content: SH01 };
    expect(() =>
      parseRecordsPush(push([f, { ...f, path: "records/stakeholders/copy.md" }])),
    ).toThrow("appears twice");
  });
});
