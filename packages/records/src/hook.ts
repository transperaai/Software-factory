// Claude Code PostToolUse hook: checks a record or proposal the moment an agent writes it.
// Installed into projects as .claude/hooks/factory/validate-records.mjs (bundled from this file).
// Problems go to stderr with exit code 2, so the agent sees them and fixes the file.
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RecordValidator } from "@factory/schemas";
import { parse as parseYaml } from "yaml";
import { RUN_DIR } from "./contracts";
import { parseRecord } from "./io";
import { schemaDirFor } from "./validate";
import { validateProposal } from "./writer";

type HookInput = { cwd?: string; tool_input?: { file_path?: string } };

/** Problems with the file just written; empty when it's fine or isn't one the hook checks. */
export function checkFile(filePath: string, projectDir: string): string[] {
  const rel = relative(projectDir, isAbsolute(filePath) ? filePath : resolve(projectDir, filePath));
  if (rel.startsWith("..") || isAbsolute(rel)) return [];
  const full = join(projectDir, rel);
  if (!existsSync(full)) return [];
  const schemaDir = schemaDirFor(projectDir);

  const isRecord =
    rel.startsWith("records/") &&
    (rel.startsWith("records/sources/") ? rel.endsWith("/meta.yaml") : rel.endsWith(".md"));
  if (isRecord) {
    try {
      const raw = readFileSync(full, "utf8");
      const header = rel.endsWith(".yaml") ? (parseYaml(raw) as unknown) : parseRecord(raw).header;
      return new RecordValidator(schemaDir)
        .validateData(header)
        .map((p) => `${rel}: ${p.path} ${p.message}`);
    } catch (err) {
      return [`${rel}: ${(err as Error).message}`];
    }
  }

  if (rel.startsWith(`${RUN_DIR}/`) && rel.endsWith("/proposal.json")) {
    try {
      const input = JSON.parse(readFileSync(join(dirname(full), "input.json"), "utf8")) as {
        agent?: string;
      };
      if (input.agent !== "intake" && input.agent !== "ba")
        return [`${rel}: input.json names no known agent, so the proposal can't be checked`];
      return validateProposal(input.agent, JSON.parse(readFileSync(full, "utf8")), schemaDir).map(
        (p) => `${rel}: ${p}`,
      );
    } catch (err) {
      return [`${rel}: ${(err as Error).message}`];
    }
  }
  return [];
}

function main(): void {
  const input = JSON.parse(readFileSync(0, "utf8")) as HookInput;
  const file = input.tool_input?.file_path;
  if (!file) return;
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const problems = checkFile(file, projectDir);
  if (problems.length > 0) {
    process.stderr.write(`${problems.join("\n")}\nFix the file and write it again.\n`);
    process.exit(2);
  }
}

// Run only when executed as a script, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
