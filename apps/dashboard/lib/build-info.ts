export type BuildInfo = {
  commit: string;
  branch: string;
  environment: string;
};

// Vercel sets these at build and run time. Locally they are absent.
export function getBuildInfo(env: Record<string, string | undefined> = process.env): BuildInfo {
  return {
    commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: env.VERCEL_GIT_COMMIT_REF ?? "local",
    environment: env.VERCEL_ENV ?? "development",
  };
}
