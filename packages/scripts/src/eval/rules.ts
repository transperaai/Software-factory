// Scoring rules. Stage 0 has schema_valid, field_equals and regex. judge (Opus as the judge) is an
// interface only; the first real judge comes with the intake agent in F-01.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RecordValidator, frontmatter } from "@factory/schemas";
import type { Rule } from "./cases.ts";

export type RuleOutcome = { rule: Rule["rule"]; passed: boolean; detail: string };

/** What a rule can see after the agent ran. */
export type ScoringContext = {
  workspace: string;
  reply: string;
  /** Record files the agent created or changed, relative to the workspace. */
  files: string[];
};

/** Judges a case against a rubric with a model. Not implemented in Stage 0. */
export interface Judge {
  score(rubric: string, ctx: ScoringContext): Promise<RuleOutcome>;
}

export const noJudge: Judge = {
  score: async () => ({
    rule: "judge",
    passed: false,
    detail: "judge rules are not available yet; the first one arrives with the intake agent (F-01)",
  }),
};

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
      case "judge":
        return await judge.score(rule.rubric, ctx);
    }
  } catch (err) {
    return { rule: rule.rule, passed: false, detail: (err as Error).message };
  }
}
