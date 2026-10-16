import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allocateIds } from "./allocate";
import type { BaProposal, IntakeProposal } from "./contracts";
import { readProject } from "./io";
import { claimFile, cleanUpProjects, makeProject, writeFile } from "./test-project";
import { validateProject } from "./validate";
import { ProposalRejected, writeBa, writeIntake } from "./writer";

afterEach(cleanUpProjects);

const opts = (dir: string) => ({
  allocate: (prefix: string, count: number) => allocateIds({ project: "E2E", prefix, count, dir }),
  date: "2026-10-16",
});

const intake = (over: Partial<IntakeProposal["claims"][number]> = {}): IntakeProposal => ({
  source: "SRC-001",
  claims: [
    {
      words: "We lose about two hours a day re-keying requests.",
      location: "L2",
      claim_type: "fact",
      trust: "strong",
      quote: "verbatim",
      said_by: "SH-01",
      ...over,
    },
  ],
});

describe("writeIntake", () => {
  it("writes valid pending claims", async () => {
    const dir = makeProject();
    const proposal = intake();
    proposal.claims.push({
      words: "The queue is checked by hand every morning.",
      location: "00:02:30",
      claim_type: "fact",
      trust: "strong",
      quote: "verbatim",
      said_by: null,
      flags: ["unlabelled_speaker"],
      note: "Speaker unclear",
    });
    const paths = await writeIntake(dir, proposal, opts(dir));
    expect(paths).toEqual(["records/claims/CLM-0001.md", "records/claims/CLM-0002.md"]);
    const { records } = readProject(dir);
    const first = records.get("CLM-0001")!;
    expect(first.header).toMatchObject({
      status: "draft",
      version: 1,
      created_by: "agent:intake",
      confirmation: "pending",
      links: { from_source: ["SRC-001"], said_by: ["SH-01"] },
    });
    const second = records.get("CLM-0002")!;
    expect(second.header.links).toEqual({ from_source: ["SRC-001"] });
    expect(second.body).toContain("Flags: unlabelled_speaker");
    expect(second.body).toContain("Note: Speaker unclear");
    expect(validateProject(dir)).toEqual([]);
  });

  it("cuts long titles at a word break within 80 characters", async () => {
    const dir = makeProject();
    const words = "word ".repeat(30).trim();
    await writeIntake(dir, intake({ words, quote: "paraphrase" }), opts(dir));
    const title = readProject(dir).records.get("CLM-0001")!.header.title;
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("word")).toBe(true);
  });

  it("rejects words that aren't at their line, listing every problem, and writes nothing", async () => {
    const dir = makeProject();
    const proposal = intake({ words: "Something nobody said." });
    proposal.claims.push({ ...proposal.claims[0]!, words: "Also invented.", location: "L3" });
    const err = await writeIntake(dir, proposal, opts(dir)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProposalRejected);
    expect((err as ProposalRejected).problems).toHaveLength(2);
    expect(existsSync(join(dir, "records/claims"))).toBe(false);
  });

  it("matches whitespace-normalised words, and a wrong line fails", async () => {
    const dir = makeProject();
    await writeIntake(
      dir,
      intake({ words: "The queue is checked by hand every morning.", location: "L3" }),
      opts(dir),
    );
    const dir2 = makeProject();
    await expect(writeIntake(dir2, intake({ location: "L3" }), opts(dir2))).rejects.toBeInstanceOf(
      ProposalRejected,
    );
  });

  it("rejects a proposal that fails its schema", async () => {
    const dir = makeProject();
    const bad = { source: "SRC-001", claims: [{ words: "x" }] } as unknown as IntakeProposal;
    await expect(writeIntake(dir, bad, opts(dir))).rejects.toBeInstanceOf(ProposalRejected);
  });
});

const ba = (evidence: string[]): BaProposal => ({
  brs: [
    {
      title: "Stop re-keying requests",
      value: "Saves two hours a day",
      priority: "must",
      owner: "SH-01",
      evidence,
      body: "Why: re-keying.",
    },
  ],
  parked: [{ ask: "Add SMS", reason: "No evidence", question: "Who asked for SMS?" }],
});

describe("writeBa", () => {
  it("writes BRs in review and a parked summary", async () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "confirmed"));
    const paths = await writeBa(dir, ba(["CLM-0001"]), { ...opts(dir), run: "ba-1" });
    expect(paths).toEqual(["records/brs/BR-01.md", ".factory/runs/ba-1/parked.md"]);
    const br = readProject(dir).records.get("BR-01")!;
    expect(br.header).toMatchObject({
      status: "review",
      version: 1,
      created_by: "agent:ba",
      links: { evidence: ["CLM-0001"] },
    });
    expect(readFileSync(join(dir, ".factory/runs/ba-1/parked.md"), "utf8")).toContain("Add SMS");
    expect(validateProject(dir)).toEqual([]);
  });

  it("rejects a BR citing a pending claim, and writes nothing", async () => {
    const dir = makeProject();
    writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
    await expect(writeBa(dir, ba(["CLM-0001", "CLM-0009"]), opts(dir))).rejects.toThrow(
      /CLM-0001 is not confirmed[\s\S]*CLM-0009 does not exist/,
    );
    expect(existsSync(join(dir, "records/brs"))).toBe(false);
    expect(existsSync(join(dir, ".factory"))).toBe(false);
  });
});
