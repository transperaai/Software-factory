import { defineConfig } from "vitest/config";

// Several test files start an in-process Postgres (PGlite) at once; under that load setup can take
// longer than vitest's 10 s default for hooks.
export default defineConfig({
  test: { hookTimeout: 30_000, testTimeout: 30_000 },
});
