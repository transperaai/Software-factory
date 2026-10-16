import { defineConfig } from "vitest/config";

// The kit-tool test spawns a real esbuild run, which can be slow on a busy CI runner.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
