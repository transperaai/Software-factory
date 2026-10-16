// The record writer: the only thing that turns an agent proposal into records (F-01 plan, K3).
// Agents never write records/ themselves. A bad proposal is rejected whole and nothing is written.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { BaProposal, IntakeProposal, RecordFile, RecordHeader } from "./contracts";
import { readProject, recordPath, serializeRecord } from "./io";
import { RUN_DIR } from "./contracts";
import { schemaDirFor } from "./validate";

export type WriterOptions = {
  allocate: (prefix: string, count: number) => Promise<string[]>;
  date: string;
  /** Run folder name for parked.md; defaults to the date. */
  run?: string;
  schemaDir?: string;
};

/** Every problem found, so the agent can fix them all in one go. */
export class ProposalRejected extends Error {
  constructor(readonly problems: string[]) {
    super(`Proposal rejected:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  }
}

/** Checks a proposal against schemas/<agent>-proposal.schema.json. Returns readable problems. */
export function validateProposal(
  agent: "intake" | "ba",
  data: unknown,
  schemaDir: string,
): string[] {
  const file = join(schemaDir, `${agent}-proposal.schema.json`);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  const validate = ajv.compile(JSON.parse(readFileSync(file, "utf8")) as object);
  if (validate(data)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? e.keyword}`);
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function titleOf(words: string): string {
  const w = squash(words);
  if (w.length <= 80) return w;
  const cut = w.slice(0, 81);
  const space = cut.lastIndexOf(" ");
  return space > 0 ? cut.slice(0, space) : w.slice(0, 80);
}

function put(dir: string, file: RecordFile): void {
  const full = join(dir, file.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, file.content);
}

export async function writeIntake(
  dir: string,
  proposal: IntakeProposal,
  opts: WriterOptions,
): Promise<string[]> {
  const problems = validateProposal("intake", proposal, opts.schemaDir ?? schemaDirFor(dir));
  if (problems.length > 0) throw new ProposalRejected(problems);

  const textFile = join(dir, "records/sources", proposal.source, "text.md");
  const text = existsSync(textFile) ? readFileSync(textFile, "utf8") : undefined;
  const lines = text?.split(/\r?\n/);
  proposal.claims.forEach((claim, i) => {
    if (claim.quote !== "verbatim") return;
    const at = `claims[${i}]`;
    if (text === undefined || !lines) {
      problems.push(`${at}: records/sources/${proposal.source}/text.md not found`);
      return;
    }
    const line = /^L(\d+)$/.exec(claim.location);
    // text.md lines carry the original file's line number as an `L<n>` prefix; blank lines are left out,
    // so match the prefix rather than the row index.
    const haystack = line ? lines.find((l) => l.startsWith(`L${line[1]} `)) : text;
    if (haystack === undefined || !squash(haystack).includes(squash(claim.words)))
      problems.push(
        `${at}: the words are not at ${claim.location} in ${proposal.source} (quote is verbatim)`,
      );
  });
  if (problems.length > 0) throw new ProposalRejected(problems);
  if (proposal.claims.length === 0) return [];

  const ids = await opts.allocate("CLM", proposal.claims.length);
  const files = proposal.claims.map((claim, i): RecordFile => {
    const id = ids[i]!;
    const header: RecordHeader = {
      id,
      type: "claim",
      title: titleOf(claim.words),
      status: "draft",
      version: 1,
      created_by: "agent:intake",
      words: claim.words,
      location: claim.location,
      claim_type: claim.claim_type,
      trust: claim.trust,
      quote: claim.quote,
      confirmation: "pending",
      links: {
        from_source: [proposal.source],
        ...(claim.said_by ? { said_by: [claim.said_by] } : {}),
      },
    };
    const body = [
      claim.flags?.length ? `Flags: ${claim.flags.join(", ")}` : "",
      claim.note ? `Note: ${claim.note}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return { path: recordPath("CLM", id), content: serializeRecord(header, body) };
  });
  files.forEach((f) => put(dir, f));
  return files.map((f) => f.path);
}

export async function writeBa(
  dir: string,
  proposal: BaProposal,
  opts: WriterOptions,
): Promise<string[]> {
  const problems = validateProposal("ba", proposal, opts.schemaDir ?? schemaDirFor(dir));
  if (problems.length > 0) throw new ProposalRejected(problems);

  const { records } = readProject(dir);
  const evidence = (ref: string) => {
    const r = records.get(ref);
    if (!r) return `${ref} does not exist`;
    return r.header.confirmation === "confirmed" ? undefined : `${ref} is not confirmed`;
  };
  proposal.brs.forEach((br, i) => {
    for (const ref of br.evidence) {
      const why = evidence(ref);
      if (why) problems.push(`brs[${i}]: evidence ${why}`);
    }
  });
  if (problems.length > 0) throw new ProposalRejected(problems);

  const written: string[] = [];
  if (proposal.brs.length > 0) {
    const ids = await opts.allocate("BR", proposal.brs.length);
    proposal.brs.forEach((br, i) => {
      const id = ids[i]!;
      const header: RecordHeader = {
        id,
        type: "business_requirement",
        title: br.title,
        status: "review",
        version: 1,
        created_by: "agent:ba",
        value: br.value,
        priority: br.priority,
        owner: br.owner,
        links: { evidence: br.evidence },
      };
      const file = { path: recordPath("BR", id), content: serializeRecord(header, br.body ?? "") };
      put(dir, file);
      written.push(file.path);
    });
  }

  if (proposal.parked.length > 0) {
    const sections = proposal.parked.map((p) =>
      [
        `## ${p.ask}`,
        `Reason: ${p.reason}`,
        `Question: ${p.question}`,
        ...(p.evidence?.length ? [`Evidence: ${p.evidence.join(", ")}`] : []),
      ].join("\n\n"),
    );
    const path = `${RUN_DIR}/${opts.run ?? opts.date}/parked.md`;
    put(dir, { path, content: `# Parked asks\n\n${sections.join("\n\n")}\n` });
    written.push(path);
  }
  return written;
}
