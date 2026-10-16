import { afterEach, describe, expect, it } from "vitest";
import { parseRecord, readProject, recordPath, serializeRecord } from "./io";
import { cleanUpProjects, claimFile, makeProject, writeFile } from "./test-project";

afterEach(cleanUpProjects);

describe("parseRecord and serializeRecord", () => {
  it("round-trips", () => {
    const header = {
      id: "CLM-0001",
      type: "claim",
      title: "T",
      status: "draft",
      version: 1,
      created_by: "agent:intake",
      words: "x: y",
      links: { from_source: ["SRC-001"] },
    };
    const text = serializeRecord(header, "Body line\n");
    expect(parseRecord(text)).toEqual({ header, body: "Body line\n" });
    expect(serializeRecord(parseRecord(text).header, parseRecord(text).body)).toBe(text);
  });

  it("orders keys: fixed first, others as they came, links last", () => {
    const text = serializeRecord(
      {
        links: { a: ["X-01"] },
        zeta: 1,
        created_by: "a:b",
        version: 1,
        status: "draft",
        approval: "APR-0001",
        title: "T",
        type: "t",
        id: "X-01",
        alpha: 2,
      },
      "",
    );
    const keys = text
      .split("\n")
      .filter((l) => /^[a-z_]+:/.test(l))
      .map((l) => l.split(":")[0]);
    expect(keys).toEqual([
      "id",
      "type",
      "title",
      "status",
      "version",
      "created_by",
      "approval",
      "zeta",
      "alpha",
      "links",
    ]);
    expect(text.endsWith("---\n")).toBe(true);
  });

  it("ends with exactly one newline", () => {
    const text = serializeRecord({ id: "X-01" } as never, "Body\n\n\n");
    expect(text.endsWith("Body\n")).toBe(true);
  });

  it("throws on a missing or unclosed header", () => {
    expect(() => parseRecord("no header")).toThrow(/must start with/);
    expect(() => parseRecord("---\nid: X\n")).toThrow(/not closed/);
  });
});

describe("recordPath", () => {
  it("uses the schema folders", () => {
    expect(recordPath("CLM", "CLM-0001")).toBe("records/claims/CLM-0001.md");
    expect(recordPath("SRC", "SRC-001")).toBe("records/sources/SRC-001/meta.yaml");
    expect(() => recordPath("NOPE", "NOPE-01")).toThrow();
  });
});

describe("readProject", () => {
  it("finds .md records and source meta.yaml, but not text.md", () => {
    const dir = makeProject();
    const { records, duplicates, unreadable } = readProject(dir);
    expect([...records.keys()].sort()).toEqual(["SH-00", "SH-01", "SH-02", "SRC-001"]);
    expect(records.get("SRC-001")?.path).toBe("records/sources/SRC-001/meta.yaml");
    expect(duplicates).toEqual([]);
    expect(unreadable).toEqual([]);
  });

  it("reports a second file with the same ID", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    writeFile(dir, "records/claims/copy.md", claimFile("CLM-0001", "pending"));
    const { records, duplicates } = readProject(dir);
    expect(records.get("CLM-0001")?.path).toBe("records/claims/CLM-0001.md");
    expect(duplicates).toEqual([{ id: "CLM-0001", path: "records/claims/copy.md" }]);
  });
});
