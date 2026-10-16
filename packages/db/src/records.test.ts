import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./ledger";
import { getRecord, upsertRecords } from "./records";
import type { RecordRow } from "./records";
import { createTestDb } from "./testing";

const sh01 = (title = "Sarah Kim"): RecordRow => ({
  project: "factory-test-project",
  recordId: "SH-01",
  type: "stakeholder",
  title,
  status: "draft",
  path: "records/stakeholders/SH-01.md",
  header: { id: "SH-01", type: "stakeholder", title },
  body: "Sponsors the new ops portal.",
  commitSha: "abc",
});

describe("record index", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("stores a record and finds it by project and ID", async () => {
    await upsertRecords(db, [sh01()]);
    expect(await getRecord(db, "factory-test-project", "SH-01")).toMatchObject({
      title: "Sarah Kim",
      type: "stakeholder",
    });
    expect(await getRecord(db, "other-project", "SH-01")).toBeUndefined();
  });

  it("replaces a record sent again, keeping one row", async () => {
    await upsertRecords(db, [sh01()]);
    await upsertRecords(db, [sh01("Sarah Kim-Lee")]);
    expect((await getRecord(db, "factory-test-project", "SH-01"))?.title).toBe("Sarah Kim-Lee");
  });
});
