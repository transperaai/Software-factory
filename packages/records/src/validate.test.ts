import { afterEach, describe, expect, it } from "vitest";
import { brFile, claimFile, cleanUpProjects, makeProject, writeFile } from "./test-project";
import { validateProject } from "./validate";

afterEach(cleanUpProjects);

describe("validateProject", () => {
  it("is clean for a good project", () => {
    expect(validateProject(makeProject())).toEqual([]);
  });

  it("finds a dead link", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    writeFile(dir, "records/brs/BR-01.md", brFile("BR-01", "review", "CLM-0001, CLM-0099"));
    const findings = validateProject(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "dead_link", recordId: "BR-01" });
    expect(findings[0]!.detail).toContain("CLM-0099");
  });

  it("skips cross-project refs", () => {
    const dir = makeProject();
    writeFile(dir, "records/brs/BR-01.md", brFile("BR-01", "review", "ACME:CLM-0001"));
    expect(validateProject(dir)).toEqual([]);
  });

  it("finds a reused ID", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    writeFile(dir, "records/claims/other.md", claimFile("CLM-0001", "pending"));
    const findings = validateProject(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "id_reused",
      recordId: "CLM-0001",
      path: "records/claims/other.md",
    });
  });

  it("finds a bad header and a header that can't be read", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", "---\nid: CLM-0001\ntype: claim\n---\n");
    writeFile(dir, "records/claims/CLM-0002.md", "no header here");
    const findings = validateProject(dir);
    expect(findings.map((f) => f.kind)).toEqual(["schema", "schema"]);
    expect(findings.find((f) => f.recordId === "CLM-0001")!.detail).toContain("missing title");
    expect(findings.find((f) => f.recordId === "")!.path).toBe("records/claims/CLM-0002.md");
  });
});
