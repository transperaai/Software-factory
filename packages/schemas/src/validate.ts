import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { parse as parseYaml } from "yaml";

// ajv-formats is CommonJS; under NodeNext its default export arrives wrapped.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

export type Problem = { path: string; message: string };
export type FileResult = { file: string; ok: boolean; problems: Problem[] };

type Index = Record<string, { type: string; schema: string }>;

export class RecordValidator {
  private readonly byType = new Map<string, ValidateFunction>();
  private readonly project: ValidateFunction;

  constructor(schemaDir: string) {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
    addFormats(ajv);
    const index = JSON.parse(readFileSync(join(schemaDir, "index.json"), "utf8")) as Index;
    for (const { type, schema } of Object.values(index)) {
      this.byType.set(type, ajv.compile(readJson(join(schemaDir, schema))));
    }
    this.project = ajv.compile(readJson(join(schemaDir, "project.schema.json")));
  }

  get types(): string[] {
    return [...this.byType.keys()];
  }

  validateData(data: unknown, kind: "record" | "project" = "record"): Problem[] {
    if (kind === "project") return problems(this.project, data);
    if (!isObject(data)) return [{ path: "", message: "header must be a YAML mapping" }];
    const type = data.type;
    if (typeof type !== "string") return [{ path: "/type", message: "missing record type" }];
    const validate = this.byType.get(type);
    if (!validate) return [{ path: "/type", message: `unknown record type "${type}"` }];
    return problems(validate, data);
  }

  validateFile(file: string): FileResult {
    const name = basename(file);
    let result: Problem[];
    try {
      const raw = readFileSync(file, "utf8");
      if (name === "project.yaml") result = this.validateData(parseYaml(raw), "project");
      else if (name.endsWith(".yaml") || name.endsWith(".yml")) result = this.validateData(parseYaml(raw));
      else result = this.validateData(frontmatter(raw));
    } catch (err) {
      result = [{ path: "", message: (err as Error).message }];
    }
    return { file, ok: result.length === 0, problems: result };
  }
}

/** Reads the YAML header between the opening and closing `---` lines of a Markdown record. */
export function frontmatter(markdown: string): unknown {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new Error("no YAML header: the file must start with ---");
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) throw new Error("YAML header is not closed with ---");
  return parseYaml(lines.slice(1, end).join("\n"));
}

/**
 * Record files in a project: project.yaml, records/**\/*.md and records/sources/*\/meta.yaml.
 * Under records/sources/ only meta.yaml is a record: the raw file and the sorter's text.md sit beside it (K1).
 */
export function findRecordFiles(root: string): string[] {
  const found: string[] = [];
  const projectFile = join(root, "project.yaml");
  if (exists(projectFile)) found.push(projectFile);
  const sources = join(root, "records", "sources");
  const walk = (dir: string, inSources: boolean) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, inSources || path === sources);
      else if (entry.name === "meta.yaml" || (!inSources && entry.name.endsWith(".md"))) found.push(path);
    }
  };
  const records = join(root, "records");
  if (exists(records)) walk(records, false);
  return found.sort();
}

function problems(validate: ValidateFunction, data: unknown): Problem[] {
  if (validate(data)) return [];
  return (validate.errors ?? []).filter((e) => e.keyword !== "if").map(toProblem);
}

function toProblem(e: ErrorObject): Problem {
  const path = e.instancePath || "/";
  if (e.keyword === "required") return { path, message: `missing ${String(e.params.missingProperty)}` };
  if (e.keyword === "additionalProperties")
    return { path, message: `unknown property ${String(e.params.additionalProperty)}` };
  if (e.keyword === "enum")
    return { path, message: `must be one of: ${(e.params.allowedValues as unknown[]).join(", ")}` };
  return { path, message: e.message ?? e.keyword };
}

function readJson(path: string): object {
  return JSON.parse(readFileSync(path, "utf8")) as object;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
