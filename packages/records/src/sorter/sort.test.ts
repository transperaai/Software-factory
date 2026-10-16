import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { RecordValidator } from "@factory/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import type { IntakeInput } from "../contracts";
import { localDeps } from "./local-deps";
import { DuplicateSourceError, sortInbox } from "./sort";

const repo = new URL("../../../../", import.meta.url).pathname;
const INBOX = "inbox/kickoff-2026-10-02.txt";
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sorter-"));
  cpSync(join(repo, "fixtures/f01"), dir, { recursive: true });
});

const sort = () =>
  sortInbox(dir, INBOX, localDeps(), {
    project: "E2E",
    date: "2026-10-16",
    runId: "r1",
  });

describe("sortInbox", () => {
  it("creates SRC-001 with a valid meta.yaml", async () => {
    const { source, files } = await sort();
    expect(source).toBe("SRC-001");
    expect(files).toContain("records/sources/SRC-001/meta.yaml");
    const meta = join(dir, "records/sources/SRC-001/meta.yaml");
    const result = new RecordValidator(join(repo, "schemas")).validateFile(meta);
    expect(result.problems).toEqual([]);
    const header = parseYaml(readFileSync(meta, "utf8"));
    expect(header).toMatchObject({
      id: "SRC-001",
      type: "source",
      status: "draft",
      created_by: "script:intake-sorter",
      source_type: "transcript",
      date: "2026-10-02",
      raw_file: "kickoff-2026-10-02.txt",
    });
  });

  it("moves the raw file without changing a byte", async () => {
    const before = readFileSync(join(dir, INBOX));
    await sort();
    expect(existsSync(join(dir, INBOX))).toBe(false);
    const after = readFileSync(join(dir, "records/sources/SRC-001/kickoff-2026-10-02.txt"));
    expect(after.equals(before)).toBe(true);
  });

  it("numbers text.md lines like the original", async () => {
    const original = readFileSync(join(dir, INBOX), "utf8").split("\n");
    await sort();
    const lines = readFileSync(join(dir, "records/sources/SRC-001/text.md"), "utf8")
      .trimEnd()
      .split("\n");
    expect(lines[0]).toBe(`L1 ${original[0]}`);
    expect(lines[2]).toBe(
      "L4 [00:00:15] Austin Smith: Thanks for joining. Can you walk me through how a request reaches the dispatch team today?",
    );
    for (const l of lines) {
      const n = Number(/^L(\d+) /.exec(l)![1]);
      expect(original[n - 1]).toBeTruthy();
    }
  });

  it("maps participants to stakeholders and writes the intake bundle", async () => {
    await sort();
    const input = JSON.parse(
      readFileSync(join(dir, ".factory/runs/r1/input.json"), "utf8"),
    ) as IntakeInput;
    expect(input.participants).toEqual([
      { label: "Austin Smith", stakeholder: "SH-00" },
      { label: "Sarah Kim", stakeholder: "SH-01" },
      { label: "Tom Reyes", stakeholder: "SH-02" },
    ]);
    expect(input).toMatchObject({
      agent: "intake",
      project: "E2E",
      profile: "lite",
      source: {
        id: "SRC-001",
        source_type: "transcript",
        date: "2026-10-02",
        text_path: "records/sources/SRC-001/text.md",
        trust: "strong",
      },
    });
    expect(input.text.split("\n")[0]).toMatch(/^L1 /);
  });

  it("refuses the same file twice, naming the first SRC", async () => {
    await sort();
    cpSync(
      join(dir, "records/sources/SRC-001/kickoff-2026-10-02.txt"),
      join(dir, "inbox/again.txt"),
    );
    const err = await sortInbox(dir, "inbox/again.txt", localDeps(), {
      project: "E2E",
      date: "2026-10-16",
      runId: "r2",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DuplicateSourceError);
    expect((err as Error).message).toContain("SRC-001");
  });

  it("allocates and bundles under the given project name", async () => {
    const calls: { project: string }[] = [];
    const deps = {
      ...localDeps(),
      allocate: async (o: { project: string }) => {
        calls.push(o);
        return ["SRC-007"];
      },
    };
    await sortInbox(dir, INBOX, deps, { project: "factory-e2e", date: "2026-10-16", runId: "r3" });
    expect(calls[0]?.project).toBe("factory-e2e");
    const input = JSON.parse(
      readFileSync(join(dir, ".factory/runs/r3/input.json"), "utf8"),
    ) as IntakeInput;
    expect(input.project).toBe("factory-e2e");
    expect(input.source.id).toBe("SRC-007");
  });

  it("reads the date from a dashboard upload name", async () => {
    for (const [n, want] of [
      ["20261016-101500-kickoff-2026-10-02.txt", "2026-10-02"],
      ["20261016-101500-notes.txt", "2026-10-16"],
    ] as const) {
      const d2 = mkdtempSync(join(tmpdir(), "sorter-"));
      cpSync(join(repo, "fixtures/f01"), d2, { recursive: true });
      writeFileSync(join(d2, "inbox", n), "Sarah Kim: hello\n");
      await sortInbox(d2, `inbox/${n}`, localDeps(), {
        project: "E2E",
        date: "2026-01-01",
        runId: "r",
      });
      const meta = parseYaml(readFileSync(join(d2, "records/sources/SRC-001/meta.yaml"), "utf8"));
      expect(meta.date).toBe(want);
    }
  });

  it("does not use WEBVTT as a title", async () => {
    writeFileSync(
      join(dir, "inbox/call.vtt"),
      "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Sarah Kim>Hello there.\n",
    );
    await sortInbox(dir, "inbox/call.vtt", localDeps(), {
      project: "E2E",
      date: "2026-10-16",
      runId: "r5",
    });
    const meta = parseYaml(readFileSync(join(dir, "records/sources/SRC-001/meta.yaml"), "utf8"));
    expect(meta.title).not.toBe("WEBVTT");
  });

  it("refuses a path outside inbox/", async () => {
    const err = await sortInbox(dir, "records/stakeholders/SH-01.md", localDeps(), {
      project: "E2E",
      date: "2026-10-16",
      runId: "r6",
    }).catch((e: unknown) => e);
    expect((err as Error).message).toContain("records/stakeholders/SH-01.md");
    expect(existsSync(join(dir, "records/stakeholders/SH-01.md"))).toBe(true);
  });
});
