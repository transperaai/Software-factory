import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type { RecordFile } from "@factory/records";

const OWNER = "transperaai";

/** The slice of Octokit this file uses; tests fake it at this boundary. */
export type GitHubApi = Pick<Octokit, "rest">;

/** Accepts the PEM with real newlines or with `\n` escapes (how env vars often carry it). */
export function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/** An installation client for transperaai/<repo>, from KIT_BOT_APP_ID and KIT_BOT_PRIVATE_KEY. */
export async function appOctokit(
  repo: string,
  env: Record<string, string | undefined> = process.env,
): Promise<GitHubApi> {
  const appId = env.KIT_BOT_APP_ID;
  const key = env.KIT_BOT_PRIVATE_KEY;
  if (!appId || !key) throw new Error("The GitHub App is not configured.");
  const privateKey = normalizePrivateKey(key);
  const app = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });
  const { data } = await app.rest.apps.getRepoInstallation({ owner: OWNER, repo });
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: data.id },
  });
}

export type CommitOpts = {
  branch: string;
  message: string;
  files: RecordFile[];
  deletes?: string[];
};

/** One commit on a new branch from main, through the git data API. Returns the commit SHA. */
export async function commitFiles(
  repo: string,
  opts: CommitOpts,
  octokit?: GitHubApi,
): Promise<string> {
  const { rest } = octokit ?? (await appOctokit(repo));
  const base = { owner: OWNER, repo };
  const { data: ref } = await rest.git.getRef({ ...base, ref: "heads/main" });
  const { data: parent } = await rest.git.getCommit({ ...base, commit_sha: ref.object.sha });
  const { data: tree } = await rest.git.createTree({
    ...base,
    base_tree: parent.tree.sha,
    tree: [
      ...opts.files.map((f) => ({
        path: f.path,
        mode: "100644" as const,
        type: "blob" as const,
        content: f.content,
      })),
      ...(opts.deletes ?? []).map((path) => ({
        path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: null,
      })),
    ],
  });
  const { data: commit } = await rest.git.createCommit({
    ...base,
    message: opts.message,
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  await rest.git.createRef({ ...base, ref: `refs/heads/${opts.branch}`, sha: commit.sha });
  return commit.sha;
}

/** Opens a PR into main and squash-merges it, deleting the branch (D2). */
export async function openAndMerge(
  repo: string,
  branch: string,
  title: string,
  body: string,
  octokit?: GitHubApi,
): Promise<void> {
  const { rest } = octokit ?? (await appOctokit(repo));
  const base = { owner: OWNER, repo };
  const { data: pr } = await rest.pulls.create({
    ...base,
    head: branch,
    base: "main",
    title,
    body,
  });
  await rest.pulls.merge({ ...base, pull_number: pr.number, merge_method: "squash" });
  await rest.git.deleteRef({ ...base, ref: `heads/${branch}` });
}

export async function dispatch(
  repo: string,
  workflow: string,
  ref: string,
  inputs: Record<string, string>,
  octokit?: GitHubApi,
): Promise<void> {
  const { rest } = octokit ?? (await appOctokit(repo));
  await rest.actions.createWorkflowDispatch({
    owner: OWNER,
    repo,
    workflow_id: workflow,
    ref,
    inputs,
  });
}

/** The calls the recorder and inbox need, bound to one repo. */
export interface GitHubOps {
  commitFiles(opts: CommitOpts): Promise<string>;
  openAndMerge(branch: string, title: string, body: string): Promise<void>;
  dispatch(workflow: string, ref: string, inputs: Record<string, string>): Promise<void>;
}

export function githubFor(repo: string, octokit?: GitHubApi): GitHubOps {
  return {
    commitFiles: (o) => commitFiles(repo, o, octokit),
    openAndMerge: (b, t, body) => openAndMerge(repo, b, t, body, octokit),
    dispatch: (w, r, i) => dispatch(repo, w, r, i, octokit),
  };
}
