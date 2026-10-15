// Claude Code PreToolUse hook: limits which paths a factory agent may write.
// Installed into projects as .claude/hooks/factory/guard-writes.mjs (built from this file).
// The launcher sets FACTORY_AGENT; with no FACTORY_AGENT set, the hook allows everything.
// Scopes live next to the hook in write-scopes.json. An agent with no entry may write nothing.
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export function decide(input, agent, scopes, projectDir) {
    if (!agent)
        return { allow: true };
    const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (!target)
        return { allow: true };
    const rel = relative(projectDir, isAbsolute(target) ? target : resolve(projectDir, target));
    const allowed = scopes[agent] ?? [];
    const inside = !rel.startsWith("..") && !isAbsolute(rel);
    if (inside &&
        allowed.some((prefix) => rel === prefix.replace(/\/$/, "") || rel.startsWith(prefix))) {
        return { allow: true };
    }
    const where = allowed.length > 0 ? allowed.join(", ") : "nowhere";
    return { allow: false, reason: `Agent "${agent}" may only write in: ${where}. Blocked: ${rel}` };
}
function main() {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const scopes = JSON.parse(readFileSync(new URL("./write-scopes.json", import.meta.url), "utf8"));
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    const result = decide(input, process.env.FACTORY_AGENT, scopes, projectDir);
    if (!result.allow) {
        // Exit code 2 blocks the tool call and shows stderr to the agent.
        process.stderr.write(`${result.reason}\n`);
        process.exit(2);
    }
}
// Run only when executed as a script, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main();
