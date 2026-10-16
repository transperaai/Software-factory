import { describe, expect, it } from "vitest";
import { checkDb } from "./index";

describe("checkDb", () => {
  it("reports not configured when there is no URL", async () => {
    expect(await checkDb(undefined)).toEqual({ state: "not_configured" });
  });

  it("reports connected when the query succeeds", async () => {
    const status = await checkDb("postgres://x", async () => [{ "?column?": 1 }]);
    expect(status.state).toBe("connected");
  });

  it("reports the error without leaking the connection string", async () => {
    const url = "postgres://user:secret@host/db";
    const status = await checkDb(url, async () => {
      throw new Error(`connect failed for ${url}\nstack...`);
    });
    expect(status).toEqual({ state: "error", message: "connect failed for [database url]" });
  });
});
