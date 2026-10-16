import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { GitHubApi } from "@/lib/github-app";
import { commitFiles, dispatch, normalizePrivateKey, openAndMerge } from "@/lib/github-app";

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

function fakeApi() {
  const calls: string[] = [];
  const spy = <T>(name: string, out: T) =>
    vi.fn(async (args: unknown) => {
      calls.push(`${name} ${JSON.stringify(args)}`);
      return { data: out };
    });
  const rest = {
    git: {
      getRef: spy("getRef", { object: { sha: "main-sha" } }),
      getCommit: spy("getCommit", { tree: { sha: "tree0" } }),
      createTree: spy("createTree", { sha: "tree1" }),
      createCommit: spy("createCommit", { sha: "commit1" }),
      createRef: spy("createRef", {}),
      deleteRef: spy("deleteRef", {}),
    },
    pulls: { create: spy("pulls.create", { number: 7 }), merge: spy("pulls.merge", {}) },
    actions: { createWorkflowDispatch: spy("dispatch", {}) },
  };
  return { api: { rest } as unknown as GitHubApi, rest, calls };
}

describe("normalizePrivateKey", () => {
  it("parses a key with real newlines and with \\n escapes", () => {
    for (const raw of [pem, pem.replace(/\n/g, "\\n")]) {
      expect(() => createPrivateKey(normalizePrivateKey(raw))).not.toThrow();
    }
  });
});

describe("git operations", () => {
  it("commits files and deletes on a new branch from main", async () => {
    const { api, rest } = fakeApi();
    const sha = await commitFiles(
      "acme",
      { branch: "b", message: "m", files: [{ path: "a.md", content: "x" }], deletes: ["old.md"] },
      api,
    );
    expect(sha).toBe("commit1");
    const tree = rest.git.createTree.mock.calls[0]![0] as { base_tree: string; tree: unknown[] };
    expect(tree.base_tree).toBe("tree0");
    expect(tree.tree).toHaveLength(2);
    expect(rest.git.createRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "refs/heads/b", sha: "commit1" }),
    );
  });

  it("opens a PR, squash-merges and deletes the branch", async () => {
    const { api, rest } = fakeApi();
    await openAndMerge("acme", "b", "t", "body", api);
    expect(rest.pulls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 7, merge_method: "squash" }),
    );
    expect(rest.git.deleteRef).toHaveBeenCalledWith(expect.objectContaining({ ref: "heads/b" }));
  });

  it("dispatches a workflow", async () => {
    const { api, rest } = fakeApi();
    await dispatch("acme", "ba.yml", "main", { source: "SRC-001" }, api);
    expect(rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "transperaai",
      repo: "acme",
      workflow_id: "ba.yml",
      ref: "main",
      inputs: { source: "SRC-001" },
    });
  });
});
