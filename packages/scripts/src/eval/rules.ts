// Scoring rules. schema_valid, field_equals and regex score record files; json_schema, claims_match,
// no_invented and evidence_subset score the JSON proposals of the F-01 agents. judge hands a rubric to
// a model (the real one is in judge.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RecordValidator, frontmatter } from "@factory/schemas";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Rule } from "./cases.ts";

export type RuleOutcome = { rule: Rule["rule"]; passed: boolean; detail: string };

/** What a rule can see after the agent ran. */
export type ScoringContext = {
  workspace: string;
  reply: string;
  /** Record files the agent created or changed, relative to the workspace. */
  files: string[];
};

/** Judges a case against a rubric with a model. `file` is the workspace file the judge reads. */
export interface Judge {
  score(rubric: string, ctx: ScoringContext, file?: string): Promise<RuleOutcome>;
}

/** For tests and runs without `--judge`: judge rules fail. */
export const noJudge: Judge = {
  score: async () => ({
    rule: "judge",
    passed: false,
    detail: "no judge was given; run with --judge opus",
  }),
};

function readJson(ctx: ScoringContext, file: string): unknown {
  const path = join(ctx.workspace, file);
  if (!existsSync(path)) throw new Error(`${file} was not written`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

type LooseClaim = { words?: string; said_by?: string | null; quote?: string };

function readHeader(ctx: ScoringContext, file: string): Record<string, unknown> {
  const path = join(ctx.workspace, file);
  if (!existsSync(path)) throw new Error(`${file} was not written`);
  return frontmatter(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function regexSubject(ctx: ScoringContext, target: Extract<Rule, { rule: "regex" }>["in"]): string {
  if (target === "reply") return ctx.reply;
  if (target === "files") return ctx.files.join("\n");
  const path = join(ctx.workspace, target.file);
  if (!existsSync(path)) throw new Error(`${target.file} was not written`);
  return readFileSync(path, "utf8");
}

const show = (v: unknown) => JSON.stringify(v);

export async function scoreRule(
  rule: Rule,
  ctx: ScoringContext,
  judge: Judge = noJudge,
): Promise<RuleOutcome> {
  try {
    switch (rule.rule) {
      case "schema_valid": {
        if (!existsSync(join(ctx.workspace, rule.file)))
          throw new Error(`${rule.file} was not written`);
        const result = new RecordValidator(join(ctx.workspace, ".factory/schemas")).validateFile(
          join(ctx.workspace, rule.file),
        );
        const problems = result.problems.map((p) => `${p.path} ${p.message}`).join("; ");
        return {
          rule: rule.rule,
          passed: result.ok,
          detail: result.ok ? `${rule.file} is valid` : problems,
        };
      }
      case "field_equals": {
        const actual = readHeader(ctx, rule.file)[rule.field];
        const passed = show(actual) === show(rule.value);
        return {
          rule: rule.rule,
          passed,
          detail: `${rule.file} ${rule.field} is ${show(actual)}${passed ? "" : `, expected ${show(rule.value)}`}`,
        };
      }
      case "regex": {
        const found = new RegExp(rule.pattern, rule.flags ?? "").test(regexSubject(ctx, rule.in));
        const wanted = rule.match ?? true;
        const where = typeof rule.in === "string" ? rule.in : rule.in.file;
        return {
          rule: rule.rule,
          passed: found === wanted,
          detail: `/${rule.pattern}/ ${found ? "found" : "not found"} in ${where}${wanted ? "" : " (must not match)"}`,
        };
      }
      case "json_schema": {
        const data = readJson(ctx, rule.file);
        const schemaPath = join(ctx.workspace, ".factory/schemas", `${rule.schema}.schema.json`);
        if (!existsSync(schemaPath)) throw new Error(`schema ${rule.schema} is not installed`);
        const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
          JSON.parse(readFileSync(schemaPath, "utf8")),
        );
        const ok = validate(data);
        const problems = (validate.errors ?? [])
          .map((e) => `${e.instancePath || "/"} ${e.message}`)
          .join("; ");
        return {
          rule: rule.rule,
          passed: ok,
          detail: ok ? `${rule.file} matches ${rule.schema}` : problems,
        };
      }
      case "claims_match": {
        const claims = ((readJson(ctx, rule.file) as { claims?: LooseClaim[] }).claims ??
          []) as LooseClaim[];
        const missed = rule.expected.filter(
          (e) =>
            !claims.some(
              (c) =>
                norm(c.words ?? "")
                  .toLowerCase()
                  .includes(norm(e.words).toLowerCase()) && (c.said_by ?? null) === e.said_by,
            ),
        );
        const found = rule.expected.length - missed.length;
        const recall = rule.expected.length === 0 ? 1 : found / rule.expected.length;
        const passed = recall >= (rule.min_recall ?? 1);
        return {
          rule: rule.rule,
          passed,
          detail:
            `recall ${found}/${rule.expected.length}` +
            (missed.length
              ? `; missed: ${missed.map((m) => `${show(m.words)} by ${show(m.said_by)}`).join(", ")}`
              : ""),
        };
      }
      case "no_invented": {
        const text = norm((readJson(ctx, rule.input) as { text?: string }).text ?? "");
        const claims = ((readJson(ctx, rule.file) as { claims?: LooseClaim[] }).claims ??
          []) as LooseClaim[];
        const invented = claims.filter(
          (c) => c.quote === "verbatim" && !text.includes(norm(c.words ?? "")),
        );
        return {
          rule: rule.rule,
          passed: invented.length === 0,
          detail: invented.length
            ? `not in the source: ${invented.map((c) => show(c.words)).join(", ")}`
            : "every verbatim claim is in the source",
        };
      }
      case "evidence_subset": {
        const known = new Set(
          ((readJson(ctx, rule.input) as { claims?: { id: string }[] }).claims ?? []).map(
            (c) => c.id,
          ),
        );
        const brs = ((readJson(ctx, rule.file) as { brs?: { evidence?: string[] }[] }).brs ??
          []) as { evidence?: string[] }[];
        const unknown = [...new Set(brs.flatMap((b) => b.evidence ?? []))].filter(
          (id) => !known.has(id),
        );
        return {
          rule: rule.rule,
          passed: unknown.length === 0,
          detail: unknown.length
            ? `evidence not in the input: ${unknown.join(", ")}`
            : "all evidence IDs are in the input",
        };
      }
      case "judge":
        return await judge.score(rule.rubric, ctx, rule.file);
    }
  } catch (err) {
    return { rule: rule.rule, passed: false, detail: (err as Error).message };
  }
}
