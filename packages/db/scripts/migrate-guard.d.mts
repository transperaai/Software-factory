export type Env = Record<string, string | undefined>;
export type DatabaseKind = "production" | "branch" | "unknown";
export function endpointId(url: string | undefined): string | undefined;
export function databaseKind(env: Env): DatabaseKind;
export function decide(
  env: Env,
  argv?: string[],
): { action: "migrate" | "skip" | "fail"; reason: string };
