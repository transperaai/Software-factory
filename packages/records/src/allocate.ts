// ID allocation (F-01 plan, K5/K6): the dashboard hands out IDs online; offline continues the tree.
import { readProject } from "./io";
import { formatId, parseRef } from "./ids";
import type { AllocateIdsRequest, AllocateIdsResponse } from "./contracts";

export type AllocateOptions = {
  project: string;
  prefix: string;
  count: number;
  dir: string;
  url?: string;
  token?: string;
  fetch?: typeof fetch;
};

/** The highest number of this prefix in the working tree (0 if none). */
export function maxInTree(dir: string, prefix: string): number {
  const { records, duplicates } = readProject(dir);
  let max = 0;
  for (const id of [...records.keys(), ...duplicates.map((d) => d.id)]) {
    const ref = parseRef(id);
    if (ref?.prefix === prefix) max = Math.max(max, ref.n);
  }
  return max;
}

export async function allocateIds(opts: AllocateOptions): Promise<string[]> {
  const max = maxInTree(opts.dir, opts.prefix);
  if (!opts.url || !opts.token) {
    return Array.from({ length: opts.count }, (_, i) => formatId(opts.prefix, max + i + 1));
  }
  const body: AllocateIdsRequest = {
    project: opts.project,
    prefix: opts.prefix,
    count: opts.count,
    maxInTree: max,
  };
  const res = await (opts.fetch ?? fetch)(`${opts.url.replace(/\/$/, "")}/api/ids`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) throw new Error(`ID allocation failed: HTTP ${res.status}`);
  return ((await res.json()) as AllocateIdsResponse).ids;
}
