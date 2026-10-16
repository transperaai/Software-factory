// Eval cases: one YAML file per case in evals/<agent>/. See evals/README.md for the format.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/** Where a regex looks: the agent's reply, the list of record files it wrote, or one file. */
export type RegexTarget = "reply" | "files" | { file: string };

export type Rule =
  | { rule: "schema_valid"; file: string }
  | { rule: "field_equals"; file: string; field: string; value: unknown }
  | { rule: "regex"; in: RegexTarget; pattern: string; flags?: string; match?: boolean }
  | { rule: "json_schema"; file: string; schema: string }
  | {
      rule: "claims_match";
      file: string;
      expected: { words: string; said_by: string | null }[];
      min_recall?: number;
    }
  | { rule: "no_invented"; file: string; input: string }
  | { rule: "evidence_subset"; file: string; input: string }
  /** `file` is the proposal the judge reads; the rubric holds anything else it needs to know. */
  | { rule: "judge"; rubric: string; file?: string };

export type EvalCase = {
  id: string;
  description: string;
  /** The text given to the agent as its prompt. */
  input: string;
  /** Files placed in the workspace before the run, by path. */
  setup: Record<string, string>;
  rules: Rule[];
};

export class CaseError extends Error {}

const RULES = new Set([
  "schema_valid",
  "field_equals",
  "regex",
  "json_schema",
  "claims_match",
  "no_invented",
  "evidence_subset",
  "judge",
]);
const NEEDS_FILE = new Set([
  "schema_valid",
  "field_equals",
  "json_schema",
  "claims_match",
  "no_invented",
  "evidence_subset",
]);

function need(cond: unknown, file: string, message: string): asserts cond {
  if (!cond) throw new CaseError(`${file}: ${message}`);
}

/** Checks one parsed case file and returns it typed. Throws CaseError naming the file and problem. */
export function parseCase(data: unknown, file: string): EvalCase {
  need(data && typeof data === "object" && !Array.isArray(data), file, "must be a YAML mapping");
  const c = data as Record<string, unknown>;
  need(
    typeof c.id === "string" && /^[a-z0-9-]+$/.test(c.id),
    file,
    "id must be lower-case words joined by -",
  );
  need(typeof c.input === "string" && c.input.trim(), file, "input is required");
  need(Array.isArray(c.rules) && c.rules.length > 0, file, "rules must list at least one rule");
  const setup = (c.setup ?? {}) as Record<string, unknown>;
  need(
    typeof setup === "object" && !Array.isArray(setup),
    file,
    "setup must map paths to file contents",
  );
  for (const [path, content] of Object.entries(setup)) {
    need(typeof content === "string", file, `setup ${path} must be text`);
    need(
      !path.startsWith("/") && !path.split("/").includes(".."),
      file,
      `setup ${path} must stay inside the workspace`,
    );
  }
  for (const [i, r] of (c.rules as Record<string, unknown>[]).entries()) {
    const at = `rule ${i + 1}`;
    need(
      r && RULES.has(r.rule as string),
      file,
      `${at}: rule must be one of ${[...RULES].join(", ")}`,
    );
    if (NEEDS_FILE.has(r.rule as string))
      need(typeof r.file === "string", file, `${at}: file is required`);
    if (r.rule === "json_schema")
      need(typeof r.schema === "string", file, `${at}: schema is required`);
    if (r.rule === "no_invented" || r.rule === "evidence_subset")
      need(typeof r.input === "string", file, `${at}: input is required`);
    if (r.rule === "claims_match") {
      const expected = r.expected as { words?: unknown; said_by?: unknown }[] | undefined;
      need(
        Array.isArray(expected) &&
          expected.every(
            (e) =>
              e &&
              typeof e.words === "string" &&
              (typeof e.said_by === "string" || e.said_by === null),
          ),
        file,
        `${at}: expected must list { words, said_by } entries`,
      );
      need(
        r.min_recall === undefined ||
          (typeof r.min_recall === "number" && r.min_recall >= 0 && r.min_recall <= 1),
        file,
        `${at}: min_recall must be a number from 0 to 1`,
      );
    }
    if (r.rule === "field_equals")
      need(
        typeof r.field === "string" && "value" in r,
        file,
        `${at}: field and value are required`,
      );
    if (r.rule === "regex") {
      need(typeof r.pattern === "string", file, `${at}: pattern is required`);
      const target = r.in;
      need(
        target === "reply" ||
          target === "files" ||
          (typeof target === "object" && typeof (target as { file?: unknown })?.file === "string"),
        file,
        `${at}: in must be reply, files or {file: <path>}`,
      );
      try {
        new RegExp(r.pattern as string, (r.flags as string | undefined) ?? "");
      } catch (err) {
        throw new CaseError(`${file}: ${at}: bad pattern: ${(err as Error).message}`);
      }
    }
    if (r.rule === "judge") need(typeof r.rubric === "string", file, `${at}: rubric is required`);
  }
  return {
    id: c.id,
    description: typeof c.description === "string" ? c.description.trim() : "",
    input: c.input,
    setup: setup as Record<string, string>,
    rules: c.rules as Rule[],
  };
}

/** Loads every *.yaml case in a folder, sorted by file name. Case IDs must be unique. */
export function loadCases(dir: string): EvalCase[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  if (files.length === 0) throw new CaseError(`${dir}: no .yaml cases found`);
  const cases = files.map((f) => parseCase(parseYaml(readFileSync(join(dir, f), "utf8")), f));
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) throw new CaseError(`${dir}: case id ${c.id} is used twice`);
    seen.add(c.id);
  }
  return cases;
}
