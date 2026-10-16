import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// The kit's standalone checker (kit/tools/schema-check.mjs), run the way a project runs it.
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const fixtures = fileURLToPath(new URL("fixtures/valid/", import.meta.url));
const project = mkdtempSync(join(tmpdir(), "kit-tool-"));
afterAll(() => rmSync(project, { recursive: true, force: true }));

function setUp() {
  mkdirSync(join(project, ".factory/tools"), { recursive: true });
  mkdirSync(join(project, ".factory/schemas"), { recursive: true });
  mkdirSync(join(project, "records/stakeholders"), { recursive: true });
  for (const f of readdirSync(join(repo, "schemas")).filter((f) => f.endsWith(".json"))) {
    cpSync(join(repo, "schemas", f), join(project, ".factory/schemas", f));
  }
  cpSync(join(repo, "kit/tools/schema-check.mjs"), join(project, ".factory/tools/schema-check.mjs"));
  cpSync(join(fixtures, "project.yaml"), join(project, "project.yaml"));
  cpSync(join(fixtures, "stakeholder.md"), join(project, "records/stakeholders/SH-01.md"));
}

const check = () =>
  spawnSync("node", [".factory/tools/schema-check.mjs"], { cwd: project, encoding: "utf8" });

describe("kit schema checker", () => {
  it("is built from the current source", () => {
    const r = spawnSync("node", ["build-kit-tool.mjs", "--check"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("passes a valid project with only node and the installed files", () => {
    setUp();
    const r = check();
    expect(r.stdout).toContain("2 record file(s) checked, 0 failed.");
    expect(r.status).toBe(0);
  });

  it("fails a broken record and names the problems", () => {
    setUp();
    writeFileSync(join(project, "records/stakeholders/SH-2.md"), "---\nid: SH-2\ntype: stakeholder\n---\n");
    const r = check();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("missing organisation");
    expect(r.stderr).toContain('/id must match pattern "^SH-\\d{2,}$"');
  });
});
