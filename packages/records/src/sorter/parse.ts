// Turns a transcript file into numbered turns. The line number is the line in the original file.
import { extname } from "node:path";

export type Turn = { line: number; time?: string; speaker?: string; text: string };

export class UnsupportedSourceError extends Error {
  constructor(name: string) {
    super(`Unsupported source file: ${name}. Only .txt, .md and .vtt transcripts for now.`);
    this.name = "UnsupportedSourceError";
  }
}

// "[00:12:40] Sarah Kim: text" or "Sarah Kim: text". The speaker has no full stop, so a sentence
// such as "Recorded transcript. Participants: ..." stays a note.
const SPEAKER_LINE =
  /^(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*)?([^:[\]\s.][^:[\].]{0,59}?):\s+(\S.*)$/;
const TIMED_NOTE = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(\S.*)$/;
const CUE_TIME = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})(?:[.,]\d+)?\s+-->/;
const VOICE_TAG = /^<v(?:\.[^\s>]+)?\s+([^>]+)>/;

function hms(t: string): string {
  const parts = t.split(":");
  if (parts.length === 2) parts.unshift("0");
  return parts.map((p) => p.padStart(2, "0")).join(":");
}

function parseText(text: string): Turn[] {
  const turns: Turn[] = [];
  // In a timestamped transcript an untimed "Title: subtitle" line is a note, not a speaker.
  const timed = /^\s*\[\d{1,2}:\d{2}/m.test(text);
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = SPEAKER_LINE.exec(line);
    if (m && (m[1] || !timed)) {
      turns.push({
        line: i + 1,
        ...(m[1] ? { time: hms(m[1]) } : {}),
        speaker: m[2]!.trim(),
        text: m[3]!.trim(),
      });
      return;
    }
    const t = TIMED_NOTE.exec(line);
    if (t) turns.push({ line: i + 1, time: hms(t[1]!), text: t[2]!.trim() });
    else turns.push({ line: i + 1, text: line });
  });
  return turns;
}

function parseVtt(text: string): Turn[] {
  const turns: Turn[] = [];
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cue = CUE_TIME.exec(lines[i]!.trim());
    if (!cue) continue;
    const time = hms(`${cue[1] ?? "0"}:${cue[2]}:${cue[3]}`);
    const first = i + 2; // 1-based line of the cue's first text line
    const body: string[] = [];
    for (i++; i < lines.length && lines[i]!.trim() !== ""; i++) body.push(lines[i]!.trim());
    const joined = body.join(" ");
    const v = VOICE_TAG.exec(joined);
    const words = joined
      .replace(VOICE_TAG, "")
      .replace(/<\/?[^>]+>/g, "")
      .trim();
    if (!words) continue;
    turns.push({ line: first, time, ...(v ? { speaker: v[1]!.trim() } : {}), text: words });
  }
  return turns;
}

export function parseTranscript(name: string, text: string): Turn[] {
  const ext = extname(name).toLowerCase();
  if (ext === ".txt" || ext === ".md") return parseText(text);
  if (ext === ".vtt") return parseVtt(text);
  throw new UnsupportedSourceError(name);
}
