import { RecordValidator } from "@factory/schemas";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = new URL("../../../../", import.meta.url).pathname;
const tool = join(repo, "kit/tools/intake-sort.mjs");

describe("kit/tools/intake-sort.mjs", () => {
  it("sorts the fixture inbox file and passes the schema check", () => {
    const dir = mkdtempSync(join(tmpdir(), "sort-tool-"));
    cpSync(join(repo, "fixtures/f01"), dir, { recursive: true });
    const out = execFileSync(
      "node",
      [tool, "sort", "inbox/kickoff-2026-10-02.txt", "--run", "test"],
      {
        cwd: dir,
        encoding: "utf8",
      },
    );
    expect(out.trim()).toBe("SRC-001");
    expect(existsSync(join(dir, ".factory/runs/test/input.json"))).toBe(true);
    const validator = new RecordValidator(join(repo, "schemas"));
    // switch to S1's validateProject(dir) once S1 is merged
    const files = [
      "records/sources/SRC-001/meta.yaml",
      "records/stakeholders/SH-00.md",
      "records/stakeholders/SH-01.md",
      "records/stakeholders/SH-02.md",
    ];
    const results = files.map((f) => validator.validateFile(join(dir, f)));
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
