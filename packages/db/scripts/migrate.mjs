/* global process, console, URL */
// Applies pending migrations from ./migrations. Runs in the dashboard's Vercel build.
// Production builds migrate production. Preview builds migrate their own Neon branch, and fail
// rather than touch production (see migrate-guard.mjs). Pass --force to migrate a local database.
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { decide } from "./migrate-guard.mjs";

const { action, reason } = decide(process.env, process.argv);
if (action === "skip") {
  console.log(`migrate: skipped (${reason})`);
  process.exit(0);
}
if (action === "fail") {
  console.error(`migrate: ${reason}`);
  process.exit(1);
}
console.log(`migrate: migrating (${reason})`);

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
try {
  await migrate(drizzle(neon(url)), { migrationsFolder });
  console.log("migrate: up to date");
} catch (err) {
  // Never echo the connection string.
  console.error(
    `migrate: failed: ${String(err?.message ?? err)
      .split("\n")[0]
      .replace(url, "[database url]")}`,
  );
  process.exit(1);
}
