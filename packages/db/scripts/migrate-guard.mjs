/* global URL */
// Decides whether a build may migrate the database it is connected to (spike 5).
// Production builds migrate production. Preview builds migrate only their own Neon branch, and only
// when they can prove it isn't production: each Neon branch has its own compute endpoint, and the
// production endpoint ID is given in FACTORY_PROD_DB_ENDPOINT (not a secret). Pure: no I/O.

/** The Neon endpoint ID in a connection URL (`ep-...`, without `-pooler`), or undefined. */
export function endpointId(url) {
  if (!url) return undefined;
  try {
    const match = /^(ep-[a-z0-9-]+?)(?:-pooler)?\./.exec(new URL(url).hostname);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function prodEndpoint(env) {
  return env.FACTORY_PROD_DB_ENDPOINT?.trim().replace(/-pooler$/, "") || undefined;
}

function urls(env) {
  return [env.DATABASE_URL_UNPOOLED, env.DATABASE_URL].filter(Boolean);
}

/** Which database this environment points at: "production", "branch" or "unknown". */
export function databaseKind(env) {
  const prod = prodEndpoint(env);
  const ids = urls(env).map(endpointId);
  if (!prod || ids.length === 0 || ids.some((id) => !id)) return "unknown";
  return ids.includes(prod) ? "production" : "branch";
}

/**
 * @returns {{ action: "migrate" | "skip" | "fail", reason: string }}
 * Reasons name endpoint IDs only, never a URL or password.
 */
export function decide(env, argv = []) {
  const vercelEnv = env.VERCEL_ENV ?? "local";
  if (urls(env).length === 0) {
    if (vercelEnv === "production") return { action: "fail", reason: "DATABASE_URL is not set" };
    return { action: "skip", reason: `${vercelEnv} build has no database` };
  }
  if (argv.includes("--force")) return { action: "migrate", reason: "forced" };
  if (vercelEnv === "production") return { action: "migrate", reason: "production build" };
  if (vercelEnv !== "preview")
    return { action: "skip", reason: `${vercelEnv} build; pass --force to migrate` };

  const prod = prodEndpoint(env);
  if (!prod)
    return { action: "skip", reason: "preview build; FACTORY_PROD_DB_ENDPOINT is not set" };
  const kind = databaseKind(env);
  if (kind === "production") {
    return {
      action: "fail",
      reason: `preview build is connected to the production database (${prod}); refusing to deploy`,
    };
  }
  if (kind === "unknown")
    return { action: "skip", reason: "preview build; can't tell which database this is" };
  return { action: "migrate", reason: `preview branch ${endpointId(urls(env)[0])}` };
}
