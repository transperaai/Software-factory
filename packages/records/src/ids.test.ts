import { describe, expect, it } from "vitest";
import { formatId, parseRef } from "./ids";

describe("formatId", () => {
  it("pads each prefix to its width", () => {
    expect(formatId("SRC", 1)).toBe("SRC-001");
    expect(formatId("CLM", 3)).toBe("CLM-0003");
    expect(formatId("APR", 12)).toBe("APR-0012");
    expect(formatId("BR", 1)).toBe("BR-01");
  });

  it("keeps going past the width", () => {
    expect(formatId("BR", 123)).toBe("BR-123");
  });

  it("refuses bad input", () => {
    expect(() => formatId("br", 1)).toThrow();
    expect(() => formatId("BR", 0)).toThrow();
  });
});

describe("parseRef", () => {
  it("reads plain, qualified and versioned refs", () => {
    expect(parseRef("CLM-0003")).toEqual({ prefix: "CLM", n: 3, id: "CLM-0003" });
    expect(parseRef("ACME-OPS:BR-01")).toEqual({
      project: "ACME-OPS",
      prefix: "BR",
      n: 1,
      id: "BR-01",
    });
    expect(parseRef("BR-01@2")).toEqual({ prefix: "BR", n: 1, id: "BR-01", version: 2 });
  });

  it("rejects what isn't a ref", () => {
    for (const bad of ["BR-1", "br-01", "BR-01 ", "PR-118x"])
      expect(parseRef(bad), bad).toBeUndefined();
  });
});
