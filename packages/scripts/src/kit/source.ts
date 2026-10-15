// Gets the kit's files at a pinned git ref from the factory repo, so installs never use unreleased work.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const tar = execFileSync("git", ["archive", "--format=tar", sha, ...wanted], { cwd: factoryDir });
  execFileSync("tar", ["-x", "-C", root], { input: tar });
  return { root, source: { repo: repoName(factoryDir), ref, sha } };
}
