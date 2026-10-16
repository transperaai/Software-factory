import { defineConfig } from "vitest/config";

// Some tests here spawn real builds (tsc, esbuild). On a busy CI runner, with other packages'
// PGlite tests running at the same time, they can take longer than vitest's 5 s default.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
