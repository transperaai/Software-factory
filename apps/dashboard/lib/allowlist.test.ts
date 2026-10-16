import { describe, expect, it } from "vitest";
import { allowedGithubIds, isAllowed } from "./allowlist";

describe("GitHub allowlist", () => {
  it("allows only Austin's account by default", () => {
    expect(isAllowed(318214427, allowedGithubIds({}))).toBe(true);
    expect(isAllowed("318214427", allowedGithubIds({}))).toBe(true);
    expect(isAllowed(1, allowedGithubIds({}))).toBe(false);
  });

  it("refuses a missing or odd ID", () => {
    for (const id of [undefined, null, "", {}, []])
      expect(isAllowed(id, ["318214427"])).toBe(false);
  });

  it("can be overridden by ALLOWED_GITHUB_USER_IDS", () => {
    const allowed = allowedGithubIds({ ALLOWED_GITHUB_USER_IDS: " 7, 8 " });
    expect(allowed).toEqual(["7", "8"]);
    expect(isAllowed(318214427, allowed)).toBe(false);
  });
});
