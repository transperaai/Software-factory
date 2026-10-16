// The BA agent's input bundle: confirmed, attributed claims from one source, plus stakeholders.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  RUN_DIR,
  type BaInput,
  type IndexQueryRequest,
  type IndexQueryResponse,
  type IndexedRecord,
  type RecordHeader,
} from "../contracts";

export type BuildBaOptions = {
  project: string;
  profile: string;
  source: string;
  /** Offline: read the working tree here. */
  dir?: string;
  /** Online: the dashboard URL and index token. */
  url?: string;
  token?: string;
  fetch?: typeof fetch;
};

type Rec = { header: RecordHeader; body: string };

function readFolder(dir: string, folder: string): Rec[] {
  const base = join(dir, "records", folder);
  let names: string[];
  try {
    names = readdirSync(base).filter((n) => n.endsWith(".md"));
  } catch {
    return [];
  }
  return names.sort().map((n) => {
    const text = readFileSync(join(base, n), "utf8").replace(/\r\n/g, "\n");
    const end = text.indexOf("\n---", 4);
    if (!text.startsWith("---\n") || end < 0) throw new Error(`${folder}/${n}: no record header`);
    return { header: parseYaml(text.slice(4, end)) as RecordHeader, body: "" };
  });
}

async function query(o: BuildBaOptions, req: IndexQueryRequest): Promise<Rec[]> {
  const res = await (o.fetch ?? fetch)(`${o.url}/api/index/query`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${o.token}` },
    body: JSON.stringify(req),
  });
  // Never put the token in an error message.
  if (res.status !== 200) throw new Error(`Index query failed with status ${res.status}.`);
  const { records } = (await res.json()) as IndexQueryResponse;
  return records.map((r: IndexedRecord) => ({ header: r.header, body: r.body }));
}

const first = (v: unknown): string | undefined =>
  Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined;

export async function buildBaInput(o: BuildBaOptions): Promise<BaInput> {
  let claims: Rec[];
  let stakeholders: Rec[];
  if (o.dir) {
    claims = readFolder(o.dir, "claims");
    stakeholders = readFolder(o.dir, "stakeholders");
  } else if (o.url && o.token) {
    claims = await query(o, {
      project: o.project,
      type: "claim",
      confirmation: "confirmed",
      from_source: o.source,
    });
    stakeholders = await query(o, { project: o.project, type: "stakeholder" });
  } else {
    throw new Error("buildBaInput needs a project directory, or a URL and token.");
  }

  const out: BaInput["claims"] = [];
  for (const { header: h } of claims) {
    const said_by = first(h.links?.said_by);
    if (h.confirmation !== "confirmed" || !said_by) continue;
    if (first(h.links?.from_source) !== o.source) continue;
    out.push({
      id: h.id,
      words: h.words as string,
      said_by,
      location: h.location as string,
      claim_type: h.claim_type as BaInput["claims"][number]["claim_type"],
    });
  }
  return {
    agent: "ba",
    project: o.project,
    profile: o.profile,
    source: o.source,
    claims: out,
    stakeholders: stakeholders.map(({ header: h }) => ({
      id: h.id,
      name: (h.name as string | undefined) ?? h.title,
      role: (h.role as string | undefined) ?? "",
      organisation: (h.organisation as string | undefined) ?? "",
    })),
  };
}

export function writeBaInput(dir: string, runId: string, input: BaInput): string {
  const runDir = join(dir, RUN_DIR, runId);
  mkdirSync(runDir, { recursive: true });
  const path = join(runDir, "input.json");
  writeFileSync(path, JSON.stringify(input, null, 2) + "\n");
  return path;
}
