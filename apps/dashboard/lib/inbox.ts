import { INBOX_DIR, WORKFLOWS } from "@factory/records";
import type { GitHubOps } from "@/lib/github-app";

export const MAX_UPLOAD_BYTES = 1_000_000;
const EXTENSIONS = [".txt", ".vtt", ".md"];

export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
}

/** yyyymmdd-hhmmss in UTC. */
export function stamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
}

/** Commits a transcript to the project's inbox on its own branch and starts intake on that branch. */
export async function uploadSource(
  args: { project: string; name: string; bytes: Uint8Array },
  deps: { github: GitHubOps; now: () => Date },
): Promise<{ path: string; branch: string }> {
  const name = cleanName(args.name);
  if (!EXTENSIONS.some((e) => name.toLowerCase().endsWith(e)))
    throw new Error("Only .txt, .vtt and .md files are accepted.");
  if (args.bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("The file is over 1 MB.");

  const s = stamp(deps.now());
  const path = `${INBOX_DIR}/${s}-${name}`;
  const branch = `intake/${s}`;
  const content = new TextDecoder().decode(args.bytes);
  await deps.github.commitFiles({ branch, message: `Inbox: ${name}`, files: [{ path, content }] });
  await deps.github.dispatch(WORKFLOWS.intake.file, branch, { inbox_path: path });
  return { path, branch };
}
