import { defineConfig } from "drizzle-kit";

// Migrations are generated from src/schema.ts into ./migrations and applied with `drizzle-kit migrate`.
// DATABASE_URL_UNPOOLED is set by the Neon integration; migrations need a direct (unpooled) connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
