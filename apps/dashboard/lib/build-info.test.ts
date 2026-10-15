import { describe, expect, it } from "vitest";
import { getBuildInfo } from "./build-info";

describe("getBuildInfo", () => {
  it("reads Vercel's git variables", () => {
    expect(
      getBuildInfo({
        VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_ENV: "production",
      }),
    ).toEqual({ commit: "abcdef1", branch: "main", environment: "production" });
  });

  it("falls back to local values outside Vercel", () => {
    expect(getBuildInfo({})).toEqual({
      commit: "local",
      branch: "local",
      environment: "development",
    });
  });
});
