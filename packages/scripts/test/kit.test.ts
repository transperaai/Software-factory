import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { decide } from "../src/hooks/guard-writes.mts";
import {
  KitDeviationError,
  checkKit,
  installKit,
  readLock,
  readManifest,
} from "../src/kit/install.ts";
import { checkoutRef } from "../src/kit/source.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const source = { repo: "transperaai/Software-factory", ref: "kit-v0.1.0", sha: "a".repeat(40) };
const temps: string[] = [];

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "kit-test-"));
  temps.push(dir);
  return dir;
}

/** A copy of the real kit plus one schema, so tests never touch the repo. */
function kitRoot(): string {
  const root = temp();
  cpSync(join(repoRoot, "kit"), join(root, "kit"), { recursive: true });
  mkdirSync(join(root, "schemas"));
  writeFileSync(join(root, "schemas/stakeholder.schema.json"), "{}\n");
  writeFileSync(join(root, "schemas/README.md"), "not installed\n");
  return root;
}

const read = (dir: string, p: string) => readFileSync(join(dir, p), "utf8");

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("installKit", () => {
  it("installs agents, skills, hooks and schemas, and writes the lockfile", () => {
    const kit = kitRoot();
    const project = temp();
    installKit(kit, project, source);

    expect(existsSync(join(project, ".claude/agents/scribe.md"))).toBe(true);
    expect(existsSync(join(project, ".claude/skills/factory-records/SKILL.md"))).toBe(true);
    expect(existsSync(join(project, ".claude/hooks/factory/guard-writes.mjs"))).toBe(true);
    expect(existsSync(join(project, ".factory/schemas/stakeholder.schema.json"))).toBe(true);
    expect(existsSync(join(project, ".factory/schemas/README.md"))).toBe(false);

    const lock = readLock(project)!;
    expect(lock).toMatchObject({
      kit: "transpera-kit",
      version: readManifest(kit).version,
      source,
    });
    expect(Object.keys(lock.files)).toContain(".claude/agents/scribe.md");
    expect(Object.keys(lock.files)).toContain(".factory/tools/schema-check.mjs");
    expect(read(project, ".claude/settings.json")).toContain(
      ".claude/hooks/factory/guard-writes.mjs",
    );
    expect(checkKit(project).ok).toBe(true);
  });

  it("changes nothing when run a second time", () => {
    const kit = kitRoot();
    const project = temp();
    installKit(kit, project, source);
    const before = read(project, "kit.lock.json") + read(project, ".claude/settings.json");
    const again = installKit(kit, project, source);
    expect(again.changed).toEqual([]);
    expect(again.removed).toEqual([]);
    expect(read(project, "kit.lock.json") + read(project, ".claude/settings.json")).toBe(before);
  });

  it("keeps the project's own settings and hooks", () => {
    const kit = kitRoot();
    const project = temp();
    mkdirSync(join(project, ".claude"));
    const own = {
      permissions: { allow: ["Bash(pnpm test)"] },
      hooks: {
        PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo mine" }] }],
      },
    };
    writeFileSync(join(project, ".claude/settings.json"), JSON.stringify(own));
    installKit(kit, project, source);
    installKit(kit, project, source);

    const settings = JSON.parse(read(project, ".claude/settings.json"));
    expect(settings.permissions).toEqual(own.permissions);
    expect(settings.hooks.PostToolUse).toEqual(own.hooks.PostToolUse);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  it("removes files the new kit version no longer ships", () => {
    const kit = kitRoot();
    const project = temp();
    installKit(kit, project, source);
    rmSync(join(kit, "kit/skills/factory-records"), { recursive: true });
    const result = installKit(kit, project, { ...source, ref: "kit-v0.1.1" });
    expect(result.removed).toEqual([".claude/skills/factory-records/SKILL.md"]);
    expect(existsSync(join(project, ".claude/skills/factory-records/SKILL.md"))).toBe(false);
    expect(readLock(project)!.source.ref).toBe("kit-v0.1.1");
  });

  it("refuses to overwrite a kit file the project has edited", () => {
    const kit = kitRoot();
    const project = temp();
    installKit(kit, project, source);
    writeFileSync(join(project, ".claude/agents/scribe.md"), "edited\n");
    expect(() => installKit(kit, project, source)).toThrow(KitDeviationError);
    expect(read(project, ".claude/agents/scribe.md")).toBe("edited\n");
  });
});

describe("checkKit", () => {
  it("fails when a kit file was edited, removed, or its hook unwired", () => {
    const kit = kitRoot();
    const project = temp();
    installKit(kit, project, source);
    writeFileSync(join(project, ".claude/agents/scribe.md"), "edited\n");
    rmSync(join(project, ".claude/skills/factory-records/SKILL.md"));
    writeFileSync(join(project, ".claude/settings.json"), "{}\n");

    const result = checkKit(project);
    expect(result.ok).toBe(false);
    expect(result.modified).toEqual([".claude/agents/scribe.md"]);
    expect(result.missing).toEqual([".claude/skills/factory-records/SKILL.md"]);
    expect(result.settings).toEqual([".claude/hooks/factory/guard-writes.mjs"]);
  });

  it("fails when there is no lockfile", () => {
    expect(checkKit(temp())).toMatchObject({ ok: false, missing: ["kit.lock.json"] });
  });
});

describe("checkoutRef", () => {
  it("reads the kit at a tag, not the working tree", () => {
    const repo = temp();
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    cpSync(join(repoRoot, "kit"), join(repo, "kit"), { recursive: true });
    git("add", ".");
    git("commit", "-qm", "kit");
    git("tag", "kit-v0.1.0");
    const sha = git("rev-parse", "HEAD");
    writeFileSync(join(repo, "kit/agents/scribe.md"), "unreleased\n");

    const { root, source: src } = checkoutRef(repo, "kit-v0.1.0");
    temps.push(root);
    expect(src).toMatchObject({ ref: "kit-v0.1.0", sha });
    expect(read(root, "kit/agents/scribe.md")).toBe(read(repoRoot, "kit/agents/scribe.md"));
  });
});

describe("guard-writes hook", () => {
  const scopes = { scribe: ["records/stakeholders/"] };
  const project = "/work/project";
  const write = (file_path: string) => ({ tool_name: "Write", tool_input: { file_path } });

  it("allows everything when no factory agent is set", () => {
    expect(decide(write("/etc/passwd"), undefined, scopes, project)).toEqual({ allow: true });
  });

  it("allows writes inside the agent's scope", () => {
    expect(
      decide(write("/work/project/records/stakeholders/SH-01.md"), "scribe", scopes, project).allow,
    ).toBe(true);
    expect(decide(write("records/stakeholders/SH-02.md"), "scribe", scopes, project).allow).toBe(
      true,
    );
  });

  it("blocks writes outside the scope, including path tricks", () => {
    for (const p of [
      "/work/project/records/brs/BR-01.md",
      "/work/project/records/stakeholders/../brs/BR-01.md",
      "/work/project/.claude/settings.json",
      "/tmp/elsewhere.md",
    ]) {
      expect(decide(write(p), "scribe", scopes, project).allow, p).toBe(false);
    }
  });

  it("blocks every write for an agent with no scope", () => {
    const result = decide(
      write("/work/project/records/stakeholders/SH-01.md"),
      "coder",
      scopes,
      project,
    );
    expect(result).toEqual({ allow: false, reason: expect.stringContaining("nowhere") });
  });

  it("built file blocks with exit code 2 when run by Claude Code", () => {
    const hook = join(repoRoot, "kit/hooks/guard-writes.mjs");
    const run = (file_path: string) =>
      spawnSync("node", [hook], {
        input: JSON.stringify(write(file_path)),
        env: { ...process.env, FACTORY_AGENT: "scribe", CLAUDE_PROJECT_DIR: project },
        encoding: "utf8",
      });
    expect(run("/work/project/records/stakeholders/SH-01.md").status).toBe(0);
    const blocked = run("/work/project/README.md");
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('Agent "scribe" may only write in');
  });

  it("built file is up to date with its TypeScript source", () => {
    const out = temp();
    execFileSync("pnpm", ["exec", "tsc", "-p", "tsconfig.hooks.json", "--outDir", out], {
      cwd: join(repoRoot, "packages/scripts"),
    });
    expect(read(repoRoot, "kit/hooks/guard-writes.mjs")).toBe(read(out, "guard-writes.mjs"));
  });
});
