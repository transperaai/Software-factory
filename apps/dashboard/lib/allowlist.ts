// Only these GitHub accounts may sign in. GitHub user IDs never change, unlike usernames.
// 318214427 is transperaai (Austin). The ID is not a secret; ALLOWED_GITHUB_USER_IDS
// (comma-separated) overrides it without a code change.
export const DEFAULT_ALLOWED_GITHUB_IDS = ["318214427"];

export function allowedGithubIds(env: Record<string, string | undefined> = process.env): string[] {
  const fromEnv = env.ALLOWED_GITHUB_USER_IDS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_GITHUB_IDS;
}

export function isAllowed(githubId: unknown, allowed: string[] = allowedGithubIds()): boolean {
  if (typeof githubId !== "string" && typeof githubId !== "number") return false;
  return allowed.includes(String(githubId));
}
