import type { IndexQueries } from "@factory/records";
import type { ApprovalDeps } from "@/lib/approvals";
import { allocate, buildApproval, getQueries } from "@/lib/deps";
import { githubFor } from "@/lib/github-app";

export const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function requireQueries(): IndexQueries {
  const q = getQueries();
  if (!q) throw new Error("The record index is not available.");
  return q;
}

export function approvalDeps(project: string): ApprovalDeps {
  return {
    queries: requireQueries(),
    allocate,
    buildApproval,
    github: githubFor(project),
    now: () => new Date(),
  };
}

export function inboxDeps(project: string) {
  return { github: githubFor(project), now: () => new Date() };
}
