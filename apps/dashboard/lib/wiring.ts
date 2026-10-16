import type { IndexQueries } from "@factory/records";
import { getQueries } from "@/lib/deps";

export const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function requireQueries(): IndexQueries {
  const q = getQueries();
  if (!q) throw new Error("The record index is not available.");
  return q;
}
