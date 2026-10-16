/* global process, console, URL */
// Applies pending migrations from ./migrations. Vercel runs it before the build (apps/dashboard/vercel.json),
// outside Turbo, so a cached build can never skip it.
// Only production builds migrate: preview builds share the production database until spike 5
// gives each preview its own branch, and an unmerged branch must never change it.
// Pass --force to migrate outside Vercel (for example a local database).
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const env = process.env.VERCEL_ENV ?? "local";
if (env !== "production" && !process.argv.includes("--force")) {
  console.log(`migrate: skipped (${env} build; only production builds migrate)`);
  process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

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
