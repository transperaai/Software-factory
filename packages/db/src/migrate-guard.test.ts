import { describe, expect, it } from "vitest";
import { databaseKind, decide, endpointId } from "../scripts/migrate-guard.mjs";

const PROD = "ep-prod-darkness-123456";
const url = (endpoint: string, pooler = false) =>
  `postgresql://user:s3cret@${endpoint}${pooler ? "-pooler" : ""}.ap-southeast-2.aws.neon.tech/neondb?sslmode=require`;
const preview = (endpoint: string, extra: Record<string, string> = {}) => ({
  VERCEL_ENV: "preview",
  FACTORY_PROD_DB_ENDPOINT: PROD,
  DATABASE_URL: url(endpoint, true),
  DATABASE_URL_UNPOOLED: url(endpoint),
  ...extra,
});

describe("endpointId", () => {
  it("reads the endpoint from pooled and direct hosts", () => {
    expect(endpointId(url(PROD))).toBe(PROD);
    expect(endpointId(url(PROD, true))).toBe(PROD);
  });
  it("gives undefined for a non-Neon or malformed URL", () => {
    expect(endpointId("postgres://localhost:5432/db")).toBeUndefined();
    expect(endpointId("not a url")).toBeUndefined();
    expect(endpointId(undefined)).toBeUndefined();
  });
});

describe("decide", () => {
  it("migrates production builds", () => {
    expect(decide({ VERCEL_ENV: "production", DATABASE_URL: url(PROD) }).action).toBe("migrate");
  });

  it("fails a production build with no database", () => {
    expect(decide({ VERCEL_ENV: "production" })).toEqual({
      action: "fail",
      reason: "DATABASE_URL is not set",
    });
  });

  it("migrates a preview on its own branch", () => {
    expect(decide(preview("ep-branch-999"))).toEqual({
      action: "migrate",
      reason: "preview branch ep-branch-999",
    });
  });

  it("fails a preview connected to production, pooled or direct", () => {
    expect(decide(preview(PROD)).action).toBe("fail");
    // Only one of the two URLs pointing at production is enough to refuse.
    expect(decide(preview("ep-branch-999", { DATABASE_URL: url(PROD, true) })).action).toBe("fail");
    // The production ID is accepted with or without -pooler.
    expect(decide(preview(PROD, { FACTORY_PROD_DB_ENDPOINT: `${PROD}-pooler` })).action).toBe(
      "fail",
    );
  });

  it("skips a preview when it can't prove the database isn't production", () => {
    expect(decide(preview("ep-branch-999", { FACTORY_PROD_DB_ENDPOINT: "" })).action).toBe("skip");
    expect(
      decide(preview("ep-branch-999", { DATABASE_URL: "postgres://localhost/db" })).action,
    ).toBe("skip");
    expect(decide({ VERCEL_ENV: "preview", FACTORY_PROD_DB_ENDPOINT: PROD }).action).toBe("skip");
  });

  it("skips local and development builds unless forced", () => {
    expect(decide({ DATABASE_URL: url(PROD) }).action).toBe("skip");
    expect(decide({ VERCEL_ENV: "development", DATABASE_URL: url(PROD) }).action).toBe("skip");
    expect(decide({ DATABASE_URL: url(PROD) }, ["--force"]).action).toBe("migrate");
  });

  it("never puts the password or URL in a reason", () => {
    const envs = [
      preview(PROD),
      preview("ep-branch-999"),
      { VERCEL_ENV: "production", DATABASE_URL: url(PROD) },
    ];
    for (const env of envs) expect(decide(env).reason).not.toMatch(/s3cret|neon\.tech/);
  });
});

describe("databaseKind", () => {
  it("tells production, branch and unknown apart", () => {
    expect(databaseKind({ FACTORY_PROD_DB_ENDPOINT: PROD, DATABASE_URL: url(PROD, true) })).toBe(
      "production",
    );
    expect(
      databaseKind({ FACTORY_PROD_DB_ENDPOINT: PROD, DATABASE_URL: url("ep-branch-999") }),
    ).toBe("branch");
    expect(databaseKind({ DATABASE_URL: url(PROD) })).toBe("unknown");
    expect(databaseKind({ FACTORY_PROD_DB_ENDPOINT: PROD })).toBe("unknown");
  });
});
