// kit/tools/intake-sort.mjs
//   sort <inbox_path> --run <id>             prints the new SRC ID
//   bundle ba --source <SRC> --run <id>      writes .factory/runs/<id>/input.json
// Online mode when FACTORY_URL and INDEX_TOKEN are set (project from FACTORY_PROJECT); else offline.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { allocateIds } from "../allocate";
import { buildBaInput, writeBaInput } from "../bundles/ba";
import { readProject, serializeRecord } from "../io";
import { sortInbox } from "./sort";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(args: string[]): Promise<void> {
  const dir = process.cwd();
  const url = process.env.FACTORY_URL;
  const token = process.env.INDEX_TOKEN;
  const online = url && token ? { url, token } : undefined;
  const project = parseYaml(readFileSync(join(dir, "project.yaml"), "utf8")) as {
    key: string;
    profile: string;
  };
  const projectName = process.env.FACTORY_PROJECT ?? project.key;
  const deps = {
    readProject,
    serializeRecord,
    allocate: (o: Parameters<typeof allocateIds>[0]) => allocateIds({ ...o, ...(online ?? {}) }),
  };
  const runId = flag(args, "run");
  if (!runId) throw new Error("Missing --run <id>.");

  if (args[0] === "sort" && args[1]) {
    const date = new Date().toISOString().slice(0, 10);
    const { source } = await sortInbox(dir, args[1], deps, {
      project: projectName,
      date,
      runId,
    });
    console.log(source);
  } else if (args[0] === "bundle" && args[1] === "ba") {
    const source = flag(args, "source");
    if (!source) throw new Error("Missing --source <SRC>.");
    const input = await buildBaInput({
      project: projectName,
      profile: project.profile,
      source,
      ...(online ? online : { dir }),
    });
    console.log(writeBaInput(dir, runId, input));
  } else {
    throw new Error(
      "Usage: intake-sort sort <inbox_path> --run <id> | bundle ba --source <SRC> --run <id>",
    );
  }
}

main(process.argv.slice(2)).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
