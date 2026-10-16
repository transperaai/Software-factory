import { Pool, neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import type { Db } from "./ledger";

export * from "./schema";
export * from "./ledger";
export * from "./evals";
export * from "./records";
export * from "./index-sync";
export * from "./ids";
export * from "./query";
export * from "./cards";

export type DbStatus =
  | { state: "connected"; latencyMs: number }
  | { state: "not_configured" }
  | { state: "error"; message: string };

/** A Drizzle client over Neon's HTTP driver, or undefined when no database is configured. */
export function createDb(url: string | undefined = process.env.DATABASE_URL) {
  return url ? drizzle(neon(url)) : undefined;
}

/**
 * A client with transactions, which Neon's HTTP driver lacks (index sync needs one). Over a pool:
 * call close() when the request is done. Undefined when no database is configured.
 */
export function createTxDb(url: string | undefined = process.env.DATABASE_URL) {
  if (!url) return undefined;
  const pool = new Pool({ connectionString: url });
  return { db: drizzlePool(pool) as Db, close: () => pool.end() };
}

type Query = (sql: string) => Promise<unknown>;

/** Checks the database answers. The query function is injectable so tests need no database. */
export async function checkDb(
  url: string | undefined = process.env.DATABASE_URL,
  query: Query = (sql) => neon(url ?? "").query(sql),
): Promise<DbStatus> {
  if (!url) return { state: "not_configured" };
  const started = Date.now();
  try {
    await query("select 1");
    return { state: "connected", latencyMs: Date.now() - started };
  } catch (err) {
    // Never echo the connection string: keep only the first line of the driver's message.
    const message =
      (err as Error).message.split("\n")[0]?.replace(url, "[database url]") ?? "unknown error";
    return { state: "error", message };
  }
}
