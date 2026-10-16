import { afterEach, describe, expect, it } from "vitest";
import { checkFile } from "./hook";
import { claimFile, cleanUpProjects, makeProject, writeFile } from "./test-project";

afterEach(cleanUpProjects);

describe("validate-records hook", () => {
  it("blocks a bad record and allows a good one", () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    writeFile(dir, "records/claims/CLM-0002.md", "---\nid: CLM-0002\ntype: claim\n---\n");
    expect(checkFile("records/claims/CLM-0001.md", dir)).toEqual([]);
    expect(checkFile("records/claims/CLM-0002.md", dir).join("\n")).toContain("missing title");
    expect(checkFile("records/sources/SRC-001/meta.yaml", dir)).toEqual([]);
  });

  it("blocks a bad proposal and allows a good one", () => {
    const dir = makeProject();
    const run = ".factory/runs/r1";
    writeFile(dir, `${run}/input.json`, JSON.stringify({ agent: "intake" }));
    writeFile(dir, `${run}/proposal.json`, JSON.stringify({ source: "SRC-001", claims: [{}] }));
    expect(checkFile(`${run}/proposal.json`, dir).length).toBeGreaterThan(0);
    writeFile(
      dir,
      `${run}/proposal.json`,
      JSON.stringify({
        source: "SRC-001",
        claims: [
          {
            words: "x",
            location: "L2",
            claim_type: "fact",
            trust: "strong",
            quote: "paraphrase",
            said_by: null,
          },
        ],
      }),
    );
    expect(checkFile(`${run}/proposal.json`, dir)).toEqual([]);
  });

  it("ignores unrelated files", () => {
    const dir = makeProject();
    writeFile(dir, "notes.md", "hello");
    writeFile(dir, "records/sources/SRC-001/raw.txt", "raw");
    expect(checkFile("notes.md", dir)).toEqual([]);
    expect(checkFile("records/sources/SRC-001/text.md", dir)).toEqual([]);
    expect(checkFile("/elsewhere/file.md", dir)).toEqual([]);
  });
});
