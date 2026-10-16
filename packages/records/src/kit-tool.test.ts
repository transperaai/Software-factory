import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUpProjects, claimFile, makeProject, repo, writeFile } from "./test-project";

afterEach(cleanUpProjects);

// The bundled CLI and hook, run the way a project runs them: plain node, schemas in .factory/.
function install(): string {
  const dir = makeProject();
  mkdirSync(join(dir, ".factory/tools"), { recursive: true });
  mkdirSync(join(dir, ".factory/hooks"), { recursive: true });
  cpSync(join(dir, "schemas"), join(dir, ".factory/schemas"), { recursive: true });
  cpSync(join(repo, "kit/tools/records.mjs"), join(dir, ".factory/tools/records.mjs"));
  cpSync(
    join(repo, "kit/hooks/validate-records.mjs"),
    join(dir, ".factory/hooks/validate-records.mjs"),
  );
  return dir;
}

const records = (dir: string, ...args: string[]) =>
  spawnSync("node", [".factory/tools/records.mjs", ...args], { cwd: dir, encoding: "utf8" });

describe("kit tools", () => {
  it("are built from the current source", () => {
    const r = spawnSync("node", ["build-kit-tool.mjs", "--check"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("validate and trace pass on the fixture project", () => {
    const dir = install();
    expect(records(dir, "validate").status).toBe(0);
    expect(records(dir, "trace").status).toBe(0);
    expect(records(dir, "trace", "--json").stdout).toBe("[]\n");
  });

  it("allocates, writes an intake proposal, and fails readably on a bad one", () => {
    const dir = install();
    expect(records(dir, "allocate", "SH", "2").stdout).toBe("SH-03\nSH-04\n");
    const claim = {
      words: "We lose about two hours a day re-keying requests.",
      location: "L2",
      claim_type: "fact",
      trust: "strong",
      quote: "verbatim",
      said_by: "SH-01",
    };
    writeFile(
      dir,
      ".factory/runs/r1/proposal.json",
      JSON.stringify({ source: "SRC-001", claims: [claim] }),
    );
    const ok = records(
      dir,
      "write",
      "intake",
      ".factory/runs/r1/proposal.json",
      "--date",
      "2026-10-16",
    );
    expect(ok.stdout).toBe("records/claims/CLM-0001.md\n");
    expect(records(dir, "validate").status).toBe(0);

    writeFile(
      dir,
      ".factory/runs/r2/proposal.json",
      JSON.stringify({ source: "SRC-001", claims: [{ ...claim, words: "Invented." }] }),
    );
    const bad = records(dir, "write", "intake", ".factory/runs/r2/proposal.json");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("not at L2");
  });

  it("the hook exits 2 on a bad record and 0 on a good one", () => {
    const dir = install();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    writeFile(dir, "records/claims/CLM-0002.md", "---\nid: CLM-0002\ntype: claim\n---\n");
    const run = (file: string) =>
      spawnSync("node", [".factory/hooks/validate-records.mjs"], {
        cwd: dir,
        encoding: "utf8",
        input: JSON.stringify({ cwd: dir, tool_input: { file_path: join(dir, file) } }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      });
    expect(run("records/claims/CLM-0001.md").status).toBe(0);
    const bad = run("records/claims/CLM-0002.md");
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("missing title");
  });

  it("the hook still checks when the project is reached through a symlink", () => {
    const dir = install();
    writeFile(dir, "records/claims/CLM-0002.md", "---\nid: CLM-0002\ntype: claim\n---\n");
    const link = join(tmpdir(), `records-link-${process.pid}-${Date.now()}`);
    symlinkSync(dir, link);
    try {
      const r = spawnSync("node", [join(link, ".factory/hooks/validate-records.mjs")], {
        cwd: link,
        encoding: "utf8",
        input: JSON.stringify({
          cwd: link,
          tool_input: { file_path: join(link, "records/claims/CLM-0002.md") },
        }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: link },
      });
      expect(r.status).toBe(2);
    } finally {
      unlinkSync(link);
    }
  });
});
