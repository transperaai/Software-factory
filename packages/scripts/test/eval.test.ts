import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CaseError, loadCases, parseCase } from "../src/eval/cases.ts";
import type { EvalCase } from "../src/eval/cases.ts";
import { agentEnv, runEval } from "../src/eval/run.ts";
import type { AgentRunner } from "../src/eval/run.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const scribeCases = () => loadCases(join(repoRoot, "evals/scribe"));

const record = (id: string, name: string, org = "Acme Logistics", role = "Operations manager") =>
  `---\nid: ${id}\ntype: stakeholder\ntitle: ${name}\nstatus: draft\nversion: 1\ncreated_by: agent:scribe\nname: ${name}\nrole: ${role}\norganisation: ${org}\n---\n\nNotes.\n`;

/** A stand-in for the scribe that behaves well, so the suite can be scored without a model. */
const goodScribe: AgentRunner = async ({ cwd, input }) => {
  const write = (id: string, body: string) => {
    mkdirSync(join(cwd, "records/stakeholders"), { recursive: true });
    writeFileSync(join(cwd, `records/stakeholders/${id}.md`), body);
  };
  const base = { isError: false, model: "fake", costUsd: 0.01, durationMs: 5 };
  if (input.includes("Sarah Kim")) {
    write("SH-01", record("SH-01", "Sarah Kim"));
    return { ...base, reply: "SH-01 records/stakeholders/SH-01.md" };
  }
  if (input.includes("Tom Reyes")) {
    write("SH-03", record("SH-03", "Tom Reyes", "Acme Logistics", "Finance director"));
    return { ...base, reply: "SH-03 records/stakeholders/SH-03.md" };
  }
  return { ...base, reply: "The organisation is missing." };
};

/** A careless scribe: reuses SH-01 and obeys the injected instruction. */
const badScribe: AgentRunner = async ({ cwd }) => {
  mkdirSync(join(cwd, "records/stakeholders"), { recursive: true });
  writeFileSync(
    join(cwd, "records/stakeholders/SH-01.md"),
    "---\nid: SH-01\ntype: stakeholder\n---\n",
  );
  writeFileSync(join(cwd, "records/stakeholders/SH-99.md"), record("SH-99", "Bob Lee"));
  return {
    reply: "SH-99 records/stakeholders/SH-99.md",
    isError: false,
    model: "fake",
    costUsd: 0.02,
    durationMs: 5,
  };
};

describe("eval cases", () => {
  it("loads the three scribe cases", () => {
    expect(scribeCases().map((c) => c.id)).toEqual([
      "scribe-new-stakeholder",
      "scribe-next-free-id",
      "scribe-missing-fact-and-injection",
    ]);
  });

  it("names the file and problem for a bad case", () => {
    expect(() => parseCase({ id: "x", input: "hi", rules: [] }, "bad.yaml")).toThrow(
      new CaseError("bad.yaml: rules must list at least one rule"),
    );
    expect(() =>
      parseCase({ id: "x", input: "hi", rules: [{ rule: "nope" }] }, "bad.yaml"),
    ).toThrow(/rule must be one of/);
    expect(() =>
      parseCase(
        {
          id: "x",
          input: "hi",
          setup: { "../escape": "x" },
          rules: [{ rule: "judge", rubric: "r" }],
        },
        "bad.yaml",
      ),
    ).toThrow(/must stay inside the workspace/);
    expect(() =>
      parseCase(
        { id: "x", input: "hi", rules: [{ rule: "regex", in: "reply", pattern: "(" }] },
        "bad.yaml",
      ),
    ).toThrow(/bad pattern/);
  });
});

describe("runEval", () => {
  const run = (runner: AgentRunner, cases: EvalCase[] = scribeCases()) =>
    runEval({ factoryRoot: repoRoot, agent: "scribe", cases, trigger: "test", runner });

  it("scores three cases, all passing for a well-behaved agent", async () => {
    const result = await run(goodScribe);
    expect(result).toMatchObject({
      format: 1,
      agent: "scribe",
      trigger: "test",
      casesTotal: 3,
      casesPassed: 3,
      costUsd: 0.03,
    });
    expect(result.results.map((r) => [r.caseId, r.passed, r.score])).toEqual([
      ["scribe-new-stakeholder", true, 1],
      ["scribe-next-free-id", true, 1],
      ["scribe-missing-fact-and-injection", true, 1],
    ]);
    expect(result.kitVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("catches a careless agent with rule-level detail", async () => {
    const result = await run(badScribe);
    expect(result.casesPassed).toBe(0);
    const [first, second, third] = result.results;
    expect(first?.rules.find((r) => r.rule === "schema_valid")).toMatchObject({ passed: false });
    expect(first?.rules.find((r) => r.rule === "schema_valid")?.detail).toMatch(/missing/);
    expect(second?.rules[0]).toMatchObject({
      passed: false,
      detail: "records/stakeholders/SH-03.md was not written",
    });
    expect(third?.rules.map((r) => r.passed)).toEqual([false, false, false]);
    expect(third?.score).toBe(0);
  });

  it("gives two runs two IDs", async () => {
    const [a, b] = [
      await run(goodScribe, scribeCases().slice(0, 1)),
      await run(goodScribe, scribeCases().slice(0, 1)),
    ];
    expect(a.id).not.toBe(b.id);
  });

  it("records an agent that fails to start as an error, not a crash", async () => {
    const result = await run(
      async () => {
        throw new Error("claude exit 1: not logged in");
      },
      scribeCases().slice(0, 1),
    );
    expect(result.results[0]).toMatchObject({
      passed: false,
      score: 0,
      error: "claude exit 1: not logged in",
    });
  });

  it("fails the judge rule until a judge exists", async () => {
    const judged: EvalCase = {
      id: "judged",
      description: "",
      input: "Sarah Kim",
      setup: {},
      rules: [{ rule: "judge", rubric: "Is it good?" }],
    };
    const result = await run(goodScribe, [judged]);
    expect(result.results[0]?.rules[0]).toMatchObject({ rule: "judge", passed: false });
  });
});

describe("agentEnv", () => {
  it("keeps factory secrets away from the agent and sets the agent and tags", () => {
    const env = agentEnv("scribe", {
      PATH: "/bin",
      CLAUDE_CODE_OAUTH_TOKEN: "keep",
      DATABASE_URL: "x",
      DATABASE_URL_UNPOOLED: "x",
      PGPASSWORD: "x",
      FACTORY_INGEST_TOKEN: "x",
      OTEL_INGEST_TOKEN: "x",
      MCP_TOKEN: "x",
      AUTH_SECRET: "x",
      GITHUB_TOKEN: "x",
      KIT_BOT_PRIVATE_KEY: "x",
    });
    expect(Object.keys(env).sort()).toEqual([
      "CLAUDE_CODE_OAUTH_TOKEN",
      "FACTORY_AGENT",
      "OTEL_RESOURCE_ATTRIBUTES",
      "PATH",
    ]);
    expect(env.FACTORY_AGENT).toBe("scribe");
    expect(env.OTEL_RESOURCE_ATTRIBUTES).toContain("factory.agent=scribe");
  });
});
