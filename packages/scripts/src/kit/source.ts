// Gets the kit's files at a pinned git ref from the factory repo, so installs never use unreleased work.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { KitSource } from "./install.ts";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function repoName(factoryDir: string): string {
  try {
    const url = git(factoryDir, "remote", "get-url", "origin");
    const match = /([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url);
    return match?.[1] ?? url;
  } catch {
    return "local";
  }
}

/** Extracts kit/ and schemas/ at `ref` into a temporary directory. */
export function checkoutRef(factoryDir: string, ref: string): { root: string; source: KitSource } {
  const sha = git(factoryDir, "rev-parse", `${ref}^{commit}`);
  const root = mkdtempSync(join(tmpdir(), "factory-kit-"));
  const paths = git(factoryDir, "ls-tree", "--name-only", sha).split("\n");
  const wanted = ["kit", "schemas"].filter((p) => paths.includes(p));
  // Through a file, not a pipe buffer: the bundled kit tools are over execFileSync's 1 MB default.
  const tarFile = join(mkdtempSync(join(tmpdir(), "factory-kit-tar-")), "kit.tar");
  execFileSync("git", ["archive", "--format=tar", "-o", tarFile, sha, ...wanted], {
    cwd: factoryDir,
  });
  execFileSync("tar", ["-xf", tarFile, "-C", root]);
  rmSync(dirname(tarFile), { recursive: true, force: true });
  return { root, source: { repo: repoName(factoryDir), ref, sha } };
}
