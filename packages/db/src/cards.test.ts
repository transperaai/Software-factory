import { describe, expect, it } from "vitest";
import type { TraceFinding } from "@factory/records";
import { syncProject } from "./index-sync";
import { createIndexQueries } from "./query";
import { createTestDb } from "./testing";
import { rec, threadFixture } from "./test-records";

const dead = (recordId: string, detail: string): TraceFinding => ({
  kind: "dead_link",
  recordId,
  path: "records/x.md",
  detail,
});

describe("cards", () => {
  it("shows each kind when it should, and drops it once cleared", async () => {
    const db = await createTestDb();
    const q = createIndexQueries(db);
    const sync = (records = threadFixture(), findings: TraceFinding[] = []) =>
      syncProject(db, { project: "p", commitSha: "c", records, findings });

    await sync(threadFixture(), [dead("BR-01", "CLM-9")]);
    expect(await q.cards("p")).toEqual([
      {
        kind: "confirm_claims",
        project: "p",
        source: "SRC-001",
        sourceTitle: "Kickoff call",
        claims: ["CLM-0003"],
      },
      {
        kind: "approve",
        project: "p",
        record: "BR-01",
        type: "business_requirement",
        title: "BR-01",
        version: 1,
      },
      { kind: "broken_link", project: "p", record: "BR-01", detail: "CLM-9" },
    ]);

    // Confirm the claim, approve the BR, fix the link.
    const said = { from_source: ["SRC-001"], said_by: ["SH-01"] };
    const fixed = threadFixture().map((r) =>
      r.recordId === "CLM-0003"
        ? rec("CLM-0003", "claim", { confirmation: "confirmed", links: said })
        : r.recordId === "BR-01"
          ? rec("BR-01", "business_requirement", { status: "review", approval: "APR-0001" })
          : r,
    );
    await sync(fixed);
    expect(await q.cards("p")).toEqual([]);
  });

  it("holds back claims nobody is recorded as saying", async () => {
    const db = await createTestDb();
    const recs = [
      rec("SRC-001", "source"),
      rec("CLM-0001", "claim", { confirmation: "pending", links: { from_source: ["SRC-001"] } }),
    ];
    await syncProject(db, { project: "p", commitSha: "c", records: recs, findings: [] });
    expect(await createIndexQueries(db).cards()).toEqual([]);
  });

  it("filters by project and ignores deleted records", async () => {
    const db = await createTestDb();
    const q = createIndexQueries(db);
    const records = threadFixture();
    await syncProject(db, { project: "p", commitSha: "c", records, findings: [] });
    await syncProject(db, {
      project: "o",
      commitSha: "c",
      records: threadFixture("o"),
      findings: [],
    });
    expect(await q.cards("o")).toHaveLength(2);
    expect(await q.cards()).toHaveLength(4);
    await syncProject(db, { project: "o", commitSha: "d", records: [], findings: [] });
    expect(await q.cards("o")).toEqual([]);
  });

  it("uses only each project's latest sync for broken links", async () => {
    const db = await createTestDb();
    const base = { project: "p", records: [], commitSha: "1" };
    await syncProject(db, { ...base, findings: [dead("A-01", "x")] });
    await syncProject(db, { ...base, commitSha: "2", findings: [] });
    expect(await createIndexQueries(db).cards("p")).toEqual([]);
  });
});
