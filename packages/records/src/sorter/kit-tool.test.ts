import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProject } from "../validate";

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
    expect(validateProject(dir, join(repo, "schemas"))).toEqual([]);
  });
});
