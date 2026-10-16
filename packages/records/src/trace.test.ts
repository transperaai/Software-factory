import { afterEach, describe, expect, it } from "vitest";
import { brFile, claimFile, cleanUpProjects, makeProject, writeFile } from "./test-project";
import { traceCheck } from "./trace";

afterEach(cleanUpProjects);

describe("traceCheck", () => {
  it("is clean for a good project", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "confirmed"));
    writeFile(dir, "records/brs/BR-01.md", brFile("BR-01", "review", "CLM-0001"));
    expect(traceCheck(dir)).toEqual([]);
  });

  it("flags a BR in review that cites an unconfirmed claim", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    writeFile(dir, "records/brs/BR-01.md", brFile("BR-01", "review", "CLM-0001"));
    const findings = traceCheck(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "unconfirmed_evidence", recordId: "BR-01" });
  });

  it("ignores a draft BR", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    writeFile(dir, "records/brs/BR-01.md", brFile("BR-01", "draft", "CLM-0001"));
    expect(traceCheck(dir)).toEqual([]);
  });

  it("flags a record changed after it was approved", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "confirmed"));
    writeFile(
      dir,
      "records/brs/BR-01.md",
      brFile("BR-01", "approved", "CLM-0001", "approval: APR-0001").replace(
        "version: 1",
        "version: 2",
      ),
    );
    writeFile(
      dir,
      "records/approvals/APR-0001.md",
      [
        "---",
        "id: APR-0001",
        "type: approval",
        "title: Approval of BR-01",
        "status: approved",
        "version: 1",
        "created_by: human:austin",
        "decision: approved",
        "approver: SH-00",
        "role: Delivery lead",
        "date: 2026-10-16",
        "links:",
        "  approves: [BR-01@1]",
        "---",
        "",
      ].join("\n"),
    );
    const findings = traceCheck(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "changed_after_approval", recordId: "BR-01" });
    expect(findings[0]!.detail).toContain("version 1");
  });

  it("includes the project checks", () => {
    const dir = makeProject();
    writeFile(dir, "records/brs/BR-01.md", brFile("BR-01", "draft", "CLM-0099"));
    expect(traceCheck(dir).map((f) => f.kind)).toEqual(["dead_link"]);
  });
});
