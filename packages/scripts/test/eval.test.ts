import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatter } from "@factory/schemas";
import { describe, expect, it } from "vitest";
import { judgeCommand, makeJudge } from "../src/eval/judge.ts";
import { scoreRule } from "../src/eval/rules.ts";
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
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "FACTORY_AGENT",
      "OTEL_RESOURCE_ATTRIBUTES",
      "PATH",
    ]);
    expect(env.FACTORY_AGENT).toBe("scribe");
    expect(env.OTEL_RESOURCE_ATTRIBUTES).toContain("factory.agent=scribe");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-sonnet-5-5");
  });
});

describe("proposal rules", () => {
  const ws = () => {
    const dir = mkdtempSync(join(tmpdir(), "rules-test-"));
    mkdirSync(join(dir, ".factory/schemas"), { recursive: true });
    mkdirSync(join(dir, ".factory/runs/r1"), { recursive: true });
    for (const name of ["intake-proposal", "ba-proposal"])
      copyFileSync(
        join(repoRoot, `schemas/${name}.schema.json`),
        join(dir, `.factory/schemas/${name}.schema.json`),
      );
    return dir;
  };
  const put = (dir: string, path: string, data: unknown) =>
    writeFileSync(join(dir, path), typeof data === "string" ? data : JSON.stringify(data));
  const ctx = (workspace: string) => ({ workspace, reply: "", files: [] });
  const P = ".factory/runs/r1/proposal.json";
  const I = ".factory/runs/r1/input.json";
  const claim = (words: string, said_by: string | null = "SH-01") => ({
    words,
    location: "L1",
    claim_type: "fact",
    trust: "strong",
    quote: "verbatim",
    said_by,
  });

  it("json_schema passes a valid proposal and lists problems for a bad one", async () => {
    const dir = ws();
    const rule = { rule: "json_schema", file: P, schema: "intake-proposal" } as const;
    put(dir, P, { source: "SRC-01", claims: [claim("hello")] });
    expect(await scoreRule(rule, ctx(dir))).toMatchObject({ passed: true });
    put(dir, P, { source: "SRC-01", claims: [{ words: "x" }] });
    const bad = await scoreRule(rule, ctx(dir));
    expect(bad.passed).toBe(false);
    expect(bad.detail).toMatch(/location/);
    put(dir, P, "not json");
    expect((await scoreRule(rule, ctx(dir))).passed).toBe(false);
    expect(
      await scoreRule({ ...rule, file: ".factory/runs/r1/none.json" }, ctx(dir)),
    ).toMatchObject({ passed: false, detail: ".factory/runs/r1/none.json was not written" });
    expect((await scoreRule({ ...rule, schema: "nope" }, ctx(dir))).passed).toBe(false);
  });

  it("claims_match finds expected claims by words and speaker, and lists misses", async () => {
    const dir = ws();
    put(dir, P, {
      source: "SRC-01",
      claims: [claim("We get about 120 requests a day", "SH-02"), claim("Cost is  $250", "SH-01")],
    });
    const rule = (expected: { words: string; said_by: string | null }[], min_recall = 1) =>
      ({ rule: "claims_match", file: P, expected, min_recall }) as const;
    expect(
      await scoreRule(
        rule([
          { words: "120 requests a day", said_by: "SH-02" },
          { words: "cost is $250", said_by: "SH-01" },
        ]),
        ctx(dir),
      ),
    ).toMatchObject({ passed: true });
    const wrongSpeaker = await scoreRule(
      rule([{ words: "120 requests a day", said_by: "SH-01" }]),
      ctx(dir),
    );
    expect(wrongSpeaker.passed).toBe(false);
    expect(wrongSpeaker.detail).toMatch(/missed.*120 requests a day/);
    const half = rule(
      [
        { words: "120 requests a day", said_by: "SH-02" },
        { words: "kanban", said_by: "SH-01" },
      ],
      0.5,
    );
    expect(await scoreRule(half, ctx(dir))).toMatchObject({ passed: true });
  });

  it("no_invented fails on any verbatim claim whose words are not in the input text", async () => {
    const dir = ws();
    put(dir, I, { text: "L1 [00:00:15] Tom: We get about 120 requests a day." });
    const rule = { rule: "no_invented", file: P, input: I } as const;
    put(dir, P, { claims: [claim("We get about 120 requests a day.")] });
    expect(await scoreRule(rule, ctx(dir))).toMatchObject({ passed: true });
    put(dir, P, {
      claims: [claim("We get about 120 requests a day."), claim("We get 500 a day")],
    });
    const bad = await scoreRule(rule, ctx(dir));
    expect(bad.passed).toBe(false);
    expect(bad.detail).toMatch(/500/);
    // Paraphrases are not checked word for word.
    put(dir, P, { claims: [{ ...claim("about five hundred"), quote: "paraphrase" }] });
    expect(await scoreRule(rule, ctx(dir))).toMatchObject({ passed: true });
  });

  it("evidence_subset fails when a BR cites a claim not in the input", async () => {
    const dir = ws();
    put(dir, I, { claims: [{ id: "CLM-01" }, { id: "CLM-02" }] });
    const rule = { rule: "evidence_subset", file: P, input: I } as const;
    put(dir, P, { brs: [{ evidence: ["CLM-01", "CLM-02"] }], parked: [] });
    expect(await scoreRule(rule, ctx(dir))).toMatchObject({ passed: true });
    put(dir, P, { brs: [{ evidence: ["CLM-01", "CLM-09"] }], parked: [] });
    const bad = await scoreRule(rule, ctx(dir));
    expect(bad.passed).toBe(false);
    expect(bad.detail).toMatch(/CLM-09/);
  });
});

describe("judge", () => {
  const dir = mkdtempSync(join(tmpdir(), "judge-test-"));
  writeFileSync(join(dir, "p.json"), '{"brs":[]}');
  const ctx = { workspace: dir, reply: "", files: [] };

  it("passes the rubric and file to the model and reads its verdict", async () => {
    let prompt = "";
    const judge = makeJudge(async (p) => {
      prompt = p;
      return 'Sure.\n{ "pass": true, "reason": "states an outcome" }';
    });
    const out = await judge.score("Title is an outcome", ctx, "p.json");
    expect(out).toEqual({ rule: "judge", passed: true, detail: "states an outcome" });
    expect(prompt).toContain("Title is an outcome");
    expect(prompt).toContain('{"brs":[]}');
  });

  it("fails on a negative verdict, an unreadable answer, or a missing file", async () => {
    const no = makeJudge(async () => '{"pass": false, "reason": "names a kanban board"}');
    expect(await no.score("r", ctx, "p.json")).toMatchObject({
      passed: false,
      detail: "names a kanban board",
    });
    const junk = makeJudge(async () => "looks fine to me");
    expect((await junk.score("r", ctx, "p.json")).passed).toBe(false);
    expect((await makeJudge(async () => "{}").score("r", ctx, "missing.json")).passed).toBe(false);
  });

  it("runs claude with no project settings and Sonnet for background calls", () => {
    const { args, env } = judgeCommand({ PATH: "/bin", DATABASE_URL: "x" });
    expect(args).toEqual(
      expect.arrayContaining(["-p", "--model", "opus", "--output-format", "json"]),
    );
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-sonnet-5-5");
    expect(env.DATABASE_URL).toBeUndefined();
  });
});

describe("F-01 agents", () => {
  it("loads the intake and ba cases", () => {
    expect(loadCases(join(repoRoot, "evals/intake")).map((c) => c.id)).toEqual([
      "intake-kickoff",
      "intake-compound",
      "intake-injection",
      "intake-numbers",
    ]);
    expect(loadCases(join(repoRoot, "evals/ba")).map((c) => c.id)).toEqual([
      "ba-outcome-br",
      "ba-solution-parked",
      "ba-no-evidence",
    ]);
  });

  it("agent files have frontmatter and write scopes", () => {
    const head = (name: string) =>
      frontmatter(readFileSync(join(repoRoot, `kit/agents/${name}.md`), "utf8")) as Record<
        string,
        unknown
      >;
    expect(head("intake")).toMatchObject({ name: "intake", tools: "Read, Write", model: "sonnet" });
    expect(head("ba")).toMatchObject({ name: "ba", tools: "Read, Write", model: "opus" });
    const scopes = JSON.parse(readFileSync(join(repoRoot, "kit/hooks/write-scopes.json"), "utf8"));
    expect(scopes.intake).toEqual([".factory/runs/"]);
    expect(scopes.ba).toEqual([".factory/runs/"]);
    expect(scopes.scribe).toEqual(["records/stakeholders/"]);
  });

  describe("case claims match the fixture transcript", () => {
    const speakers: Record<string, string> = {
      "Austin Smith": "SH-00",
      "Sarah Kim": "SH-01",
      "Tom Reyes": "SH-02",
    };
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const turns = readFileSync(join(repoRoot, "fixtures/f01/inbox/kickoff-2026-10-02.txt"), "utf8")
      .split("\n")
      .filter((l) => l.startsWith("["))
      .map((line) => {
        const who = /^\[[^\]]*\]\s*([^:]+):/.exec(line)?.[1] ?? "";
        return { text: norm(line), said_by: speakers[who] };
      });

    it("evals/ba claims are real, by the right speaker, at the right line", () => {
      const cases = loadCases(join(repoRoot, "evals/ba"));
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        const input = JSON.parse(c.setup[".factory/runs/r1/input.json"] ?? "{}");
        for (const claim of input.claims as {
          words: string;
          said_by: string;
          location: string;
        }[]) {
          const turn = turns[Number(claim.location.slice(1)) - 1];
          const label = `${c.id} ${claim.location} "${claim.words}"`;
          expect(turn, label).toBeDefined();
          expect(turn?.text, label).toContain(norm(claim.words));
          expect(turn?.said_by, label).toBe(claim.said_by);
        }
      }
    });

    it("evals/intake/01-kickoff expected claims are on a line by their speaker", () => {
      const c = loadCases(join(repoRoot, "evals/intake")).find((x) => x.id === "intake-kickoff");
      const rule = c?.rules.find((r) => r.rule === "claims_match");
      if (rule?.rule !== "claims_match") throw new Error("no claims_match rule");
      const input = JSON.parse(c?.setup[".factory/runs/r1/input.json"] ?? "{}");
      const lines = (input.text as string).split("\n").map((l) => {
        const who = /^L\d+ \[[^\]]*\]\s*([^:]+):/.exec(l)?.[1] ?? "";
        return { text: norm(l), said_by: speakers[who] };
      });
      expect(rule.expected.length).toBeGreaterThan(0);
      for (const e of rule.expected) {
        const hit = lines.some((l) => l.text.includes(norm(e.words)) && l.said_by === e.said_by);
        expect(hit, `${e.words} by ${e.said_by}`).toBe(true);
      }
    });
  });

  it("keeps one copy of each spec, in kit/agents", () => {
    const specs = readFileSync(join(repoRoot, "docs/agent-specs.md"), "utf8");
    for (const [title, agent] of [
      ["Agent 1: Intake", "intake"],
      ["Agent 2: BA agent", "ba"],
    ] as const) {
      const start = specs.indexOf(`## ${title}`);
      const end = specs.indexOf("\n## ", start + 1);
      const body = specs
        .slice(start, end)
        .split("\n")
        .slice(1)
        .filter((l) => l.trim());
      expect(body).toEqual([`Built in F-01: see \`kit/agents/${agent}/spec.md\`.`]);
      expect(existsSync(join(repoRoot, `kit/agents/${agent}/spec.md`))).toBe(true);
    }
  });
});
