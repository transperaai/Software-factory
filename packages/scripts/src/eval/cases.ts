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
  | { rule: "judge"; rubric: string };

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

const RULES = new Set(["schema_valid", "field_equals", "regex", "judge"]);

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
    if (r.rule === "schema_valid" || r.rule === "field_equals")
      need(typeof r.file === "string", file, `${at}: file is required`);
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
