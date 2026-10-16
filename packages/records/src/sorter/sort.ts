// Turns a file dropped in inbox/ into a SRC record: the raw file moved untouched, meta.yaml,
// clean numbered text, and the intake agent's input bundle.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { RUN_DIR, type IntakeInput, type RecordHeader } from "../contracts";
import type { Deps } from "./deps";
import { matchSpeakers, type StakeholderLike } from "./match";
import { parseTranscript, type Turn } from "./parse";

export const MAX_SOURCE_BYTES = 1024 * 1024;

export class DuplicateSourceError extends Error {
  constructor(
    readonly existing: string,
    file: string,
  ) {
    super(`${file} is already stored as ${existing} (same contents).`);
    this.name = "DuplicateSourceError";
  }
}

/** One line per turn, "L<n> [time] Speaker: text", where n is the line in the original file. */
export function renderText(turns: Turn[]): string {
  return (
    turns
      .map(
        (t) =>
          `L${t.line} ${t.time ? `[${t.time}] ` : ""}${t.speaker ? `${t.speaker}: ` : ""}${t.text}`,
      )
      .join("\n") + "\n"
  );
}

function dateFromName(name: string): string | undefined {
  const m = /(?<!\d)(\d{4})-?(\d{2})-?(\d{2})(?!\d)/.exec(name);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  return Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31
    ? `${y}-${mo}-${d}`
    : undefined;
}

// meta.yaml is plain YAML: reuse the record serializer for key order, then drop the fences.
function metaYaml(deps: Deps, header: RecordHeader): string {
  const lines = deps.serializeRecord(header, "").split("\n");
  return lines.slice(1, lines.indexOf("---", 1)).join("\n") + "\n";
}

export async function sortInbox(
  dir: string,
  inboxPath: string,
  deps: Deps,
  opts: { date: string; runId: string },
): Promise<{ source: string; files: string[] }> {
  const file = resolve(dir, inboxPath);
  const name = basename(file);
  if (statSync(file).size > MAX_SOURCE_BYTES) {
    throw new Error(`${name} is over the 1 MB limit for a source file.`);
  }
  const raw = readFileSync(file);
  const turns = parseTranscript(name, raw.toString("utf8"));

  const sha256 = createHash("sha256").update(raw).digest("hex");
  const { records } = deps.readProject(dir);
  for (const r of records.values()) {
    if (r.header.type === "source" && r.header.sha256 === sha256) {
      throw new DuplicateSourceError(r.header.id, name);
    }
  }

  const project = parseYaml(readFileSync(join(dir, "project.yaml"), "utf8")) as {
    key: string;
    profile: string;
  };
  const [src] = await deps.allocate({ project: project.key, prefix: "SRC", count: 1, dir });
  if (!src) throw new Error("No SRC ID was allocated.");

  const stakeholders: StakeholderLike[] = [...records.values()]
    .filter((r) => r.header.type === "stakeholder")
    .map((r) => ({
      id: r.header.id,
      name: r.header.name as string | undefined,
      aliases: r.header.aliases as string[] | undefined,
      email: r.header.email as string | undefined,
    }));
  const labels = [...new Set(turns.flatMap((t) => (t.speaker ? [t.speaker] : [])))];
  const participants = matchSpeakers(labels, stakeholders);

  const srcDir = join("records", "sources", src);
  mkdirSync(join(dir, srcDir), { recursive: true });
  renameSync(file, join(dir, srcDir, name));

  const date = dateFromName(name) ?? opts.date;
  const title =
    raw
      .toString("utf8")
      .split(/\r?\n/)
      .find((l) => l.trim() !== "")
      ?.trim() || name;
  const header: RecordHeader = {
    id: src,
    type: "source",
    title,
    status: "draft",
    version: 1,
    created_by: "script:intake-sorter",
    source_type: "transcript",
    date,
    participants,
    raw_file: name,
    sha256,
  };
  const text = renderText(turns);
  writeFileSync(join(dir, srcDir, "meta.yaml"), metaYaml(deps, header));
  writeFileSync(join(dir, srcDir, "text.md"), text);

  const input: IntakeInput = {
    agent: "intake",
    project: project.key,
    profile: project.profile,
    source: {
      id: src,
      source_type: "transcript",
      date,
      text_path: join(srcDir, "text.md"),
      trust: "strong",
    },
    participants,
    text,
  };
  const runDir = join(dir, RUN_DIR, opts.runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "input.json"), JSON.stringify(input, null, 2) + "\n");

  return {
    source: src,
    files: [join(srcDir, name), join(srcDir, "meta.yaml"), join(srcDir, "text.md")],
  };
}
