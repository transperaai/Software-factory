// Installs the kit into a project at a pinned version and records it in kit.lock.json.
// Safe to re-run: installing the same kit twice changes nothing the second time.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const LOCKFILE = "kit.lock.json";
export const SETTINGS_FILE = ".claude/settings.json";
/** Hook commands that point here are kit-managed; everything else in settings belongs to the project. */
export const KIT_HOOK_MARKER = ".claude/hooks/factory/";

export type KitManifest = {
  name: string;
  version: string;
  install: { from: string; to: string; match?: string }[];
  settings?: string;
};

export type KitSource = { repo: string; ref: string; sha: string };

export type Lock = {
  kit: string;
  version: string;
  source: KitSource;
  /** Project-relative path → sha256 of the installed file. */
  files: Record<string, string>;
};

export type InstallResult = { changed: string[]; removed: string[]; lock: Lock };

export class KitDeviationError extends Error {
  constructor(public readonly paths: string[]) {
    super(
      `These kit files were changed in the project, so the install stopped: ${paths.join(", ")}. ` +
        "Restore the file, or propose the change to the kit, then run the install again.",
    );
  }
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function readManifest(kitRoot: string): KitManifest {
  return JSON.parse(readFileSync(join(kitRoot, "kit/kit.json"), "utf8")) as KitManifest;
}

export function readLock(projectDir: string): Lock | undefined {
  const path = join(projectDir, LOCKFILE);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Lock) : undefined;
}

/** Files the kit would install: project-relative target path → source path. */
export function plannedFiles(kitRoot: string, manifest: KitManifest): Map<string, string> {
  const planned = new Map<string, string>();
  for (const rule of manifest.install) {
    const fromDir = join(kitRoot, rule.from);
    if (!existsSync(fromDir)) continue;
    const pattern = rule.match ? new RegExp(rule.match) : undefined;
    for (const file of walk(fromDir)) {
      const rel = toPosix(relative(fromDir, file));
      if (pattern && !pattern.test(rel)) continue;
      planned.set(`${rule.to}/${rel}`, file);
    }
  }
  return new Map([...planned.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function installKit(kitRoot: string, projectDir: string, source: KitSource): InstallResult {
  const manifest = readManifest(kitRoot);
  const previous = readLock(projectDir);
  const planned = plannedFiles(kitRoot, manifest);

  // Refuse to overwrite or remove kit files the project has edited.
  const deviations = previous ? modifiedFiles(projectDir, previous) : [];
  if (deviations.length > 0) throw new KitDeviationError(deviations);

  const changed: string[] = [];
  const removed: string[] = [];
  const files: Record<string, string> = {};

  for (const [target, from] of planned) {
    const content = readFileSync(from);
    files[target] = sha256(content);
    if (writeIfDifferent(join(projectDir, target), content)) changed.push(target);
  }
  for (const old of Object.keys(previous?.files ?? {})) {
    if (old in files) continue;
    rmSync(join(projectDir, old), { force: true });
    removed.push(old);
  }

  const fragment = manifest.settings
    ? (JSON.parse(readFileSync(join(kitRoot, manifest.settings), "utf8")) as Settings)
    : {};
  const settingsPath = join(projectDir, SETTINGS_FILE);
  const current = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, "utf8")) as Settings)
    : {};
  const merged = mergeSettings(current, fragment);
  if (writeIfDifferent(settingsPath, `${JSON.stringify(merged, null, 2)}\n`))
    changed.push(SETTINGS_FILE);

  const lock: Lock = { kit: manifest.name, version: manifest.version, source, files };
  if (writeIfDifferent(join(projectDir, LOCKFILE), `${JSON.stringify(lock, null, 2)}\n`)) {
    changed.push(LOCKFILE);
  }
  return { changed, removed, lock };
}

export type CheckResult = {
  ok: boolean;
  missing: string[];
  modified: string[];
  settings: string[];
};

/** Compares installed kit files with kit.lock.json. Local edits show up as deviations. */
export function checkKit(projectDir: string): CheckResult {
  const lock = readLock(projectDir);
  if (!lock) return { ok: false, missing: [LOCKFILE], modified: [], settings: [] };
  const missing = Object.keys(lock.files).filter((p) => !existsSync(join(projectDir, p)));
  const modified = modifiedFiles(projectDir, lock).filter((p) => !missing.includes(p));
  const settings = missingKitHooks(projectDir, lock);
  return {
    ok: missing.length + modified.length + settings.length === 0,
    missing,
    modified,
    settings,
  };
}

// --- settings merge -------------------------------------------------------

type HookCommand = { type: string; command: string; [k: string]: unknown };
type HookGroup = { matcher?: string; hooks: HookCommand[]; [k: string]: unknown };
type Settings = { hooks?: Record<string, HookGroup[]>; [k: string]: unknown };

const isKitHook = (h: HookCommand) => h.command.includes(KIT_HOOK_MARKER);

/** Replaces the kit's hooks in project settings, leaving every project-owned key and hook alone. */
export function mergeSettings(project: Settings, fragment: Settings): Settings {
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(project.hooks ?? {})) {
    const kept = groups
      .map((g) => ({ ...g, hooks: g.hooks.filter((h) => !isKitHook(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (kept.length > 0) hooks[event] = kept;
  }
  for (const [event, groups] of Object.entries(fragment.hooks ?? {})) {
    hooks[event] = [...(hooks[event] ?? []), ...groups];
  }
  const merged: Settings = { ...project };
  if (Object.keys(hooks).length > 0) merged.hooks = hooks;
  else delete merged.hooks;
  return merged;
}

function missingKitHooks(projectDir: string, lock: Lock): string[] {
  const hookFiles = Object.keys(lock.files).filter(
    (p) => p.startsWith(KIT_HOOK_MARKER) && p.endsWith(".mjs"),
  );
  if (hookFiles.length === 0) return [];
  const path = join(projectDir, SETTINGS_FILE);
  const settings = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Settings) : {};
  const commands = Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((g) => g.hooks.map((h) => h.command));
  return hookFiles.filter((f) => !commands.some((c) => c.includes(f)));
}

// --- helpers --------------------------------------------------------------

function modifiedFiles(projectDir: string, lock: Lock): string[] {
  return Object.entries(lock.files)
    .filter(([p, hash]) => {
      const path = join(projectDir, p);
      return existsSync(path) && sha256(readFileSync(path)) !== hash;
    })
    .map(([p]) => p);
}

function writeIfDifferent(path: string, content: string | Buffer): boolean {
  const next = typeof content === "string" ? Buffer.from(content) : content;
  if (existsSync(path) && readFileSync(path).equals(next)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return true;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}
