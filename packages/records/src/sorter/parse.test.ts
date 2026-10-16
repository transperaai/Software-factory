import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTranscript, UnsupportedSourceError } from "./parse";

const fixture = new URL("../../../../fixtures/f01/inbox/kickoff-2026-10-02.txt", import.meta.url);
const text = readFileSync(fixture, "utf8");

describe("parseTranscript", () => {
  it("reads the fixture transcript", () => {
    const turns = parseTranscript("kickoff-2026-10-02.txt", text);
    // 15 spoken turns plus the title and the participants note.
    expect(turns).toHaveLength(17);
    expect(turns[0]).toEqual({
      line: 1,
      text: "Acme Logistics ops portal: kickoff call, 2 October 2026",
    });
    expect(turns[1]!.speaker).toBeUndefined();
    expect(turns[2]).toEqual({
      line: 4,
      time: "00:00:15",
      speaker: "Austin Smith",
      text: "Thanks for joining. Can you walk me through how a request reaches the dispatch team today?",
    });
    const speakers = new Set(turns.flatMap((t) => (t.speaker ? [t.speaker] : [])));
    expect([...speakers].sort()).toEqual(["Austin Smith", "Sarah Kim", "Tom Reyes"]);
    expect(turns.at(-1)).toMatchObject({ time: "00:07:15", speaker: "Austin Smith" });
  });

  it("gives the same turns from .vtt and plain Name: forms", () => {
    const bracketed = parseTranscript("a.txt", "[00:12:40] Sarah Kim: We copy it by hand.\n");
    const vtt = parseTranscript(
      "a.vtt",
      "WEBVTT\n\n1\n00:12:40.000 --> 00:12:44.000\n<v Sarah Kim>We copy it by hand.</v>\n",
    );
    const plain = parseTranscript("a.md", "Sarah Kim: We copy it by hand.\n");
    const strip = (t: (typeof bracketed)[number]) => ({ ...t, line: 0 });
    expect(vtt.map(strip)).toEqual(bracketed.map(strip));
    expect(plain.map(strip)).toEqual([
      { line: 0, speaker: "Sarah Kim", text: "We copy it by hand." },
    ]);
  });

  it("numbers vtt turns by the line of the cue text", () => {
    const vtt = parseTranscript(
      "a.vtt",
      "WEBVTT\n\n00:01:00.000 --> 00:01:02.000\n<v Tom>Hi</v>\n",
    );
    expect(vtt[0]!.line).toBe(4);
  });

  it("refuses audio and video", () => {
    expect(() => parseTranscript("call.mp3", "x")).toThrow(UnsupportedSourceError);
  });
});
