import { describe, expect, it } from "vitest";
import { matchSpeakers } from "./match";

const stakeholders = [
  { id: "SH-01", name: "Sarah Kim", aliases: ["Sarah", "SK"], email: "sarah@acme.test" },
  { id: "SH-02", name: "Tom Reyes" },
];

describe("matchSpeakers", () => {
  it("matches name, alias and email, ignoring case", () => {
    expect(
      matchSpeakers(["sarah kim", "SK", "Sarah@Acme.test", "TOM REYES"], stakeholders),
    ).toEqual([
      { label: "sarah kim", stakeholder: "SH-01" },
      { label: "SK", stakeholder: "SH-01" },
      { label: "Sarah@Acme.test", stakeholder: "SH-01" },
      { label: "TOM REYES", stakeholder: "SH-02" },
    ]);
  });

  it("leaves unknown speakers unmatched", () => {
    expect(matchSpeakers(["Speaker 2", "Tom"], stakeholders)).toEqual([
      { label: "Speaker 2" },
      { label: "Tom" },
    ]);
  });
});
