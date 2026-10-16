import { describe, expect, it, vi } from "vitest";
import { cleanName, uploadSource } from "@/lib/inbox";

function setup() {
  const github = {
    commitFiles: vi.fn(async () => "sha"),
    openAndMerge: vi.fn(async () => {}),
    dispatch: vi.fn(async () => {}),
  };
  return { github, deps: { github, now: () => new Date("2026-10-16T09:08:07Z") } };
}
const bytes = (s: string) => new TextEncoder().encode(s);

describe("uploadSource", () => {
  it("refuses .mp3 and files over 1 MB", async () => {
    const { deps, github } = setup();
    await expect(
      uploadSource({ project: "p", name: "a.mp3", bytes: bytes("x") }, deps),
    ).rejects.toThrow(".txt");
    await expect(
      uploadSource({ project: "p", name: "a.txt", bytes: new Uint8Array(1_000_001) }, deps),
    ).rejects.toThrow("1 MB");
    expect(github.commitFiles).not.toHaveBeenCalled();
  });

  it("cleans names", () => {
    expect(cleanName("../my notes (v2).txt")).toBe("my_notes__v2_.txt");
    expect(cleanName("..hidden.md")).toBe("hidden.md");
  });

  it("commits to the inbox path and dispatches intake on that branch", async () => {
    const { deps, github } = setup();
    const out = await uploadSource(
      { project: "p", name: "kick off.txt", bytes: bytes("hello") },
      deps,
    );
    expect(out).toEqual({
      path: "inbox/20261016-090807-kick_off.txt",
      branch: "intake/20261016-090807",
    });
    expect(github.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "intake/20261016-090807",
        files: [{ path: "inbox/20261016-090807-kick_off.txt", content: "hello" }],
      }),
    );
    expect(github.dispatch).toHaveBeenCalledWith("intake.yml", "intake/20261016-090807", {
      inbox_path: "inbox/20261016-090807-kick_off.txt",
    });
  });
});
