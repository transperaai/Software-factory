import { sql } from "drizzle-orm";
import { formatId } from "@factory/records";
import type { AllocateIdsRequest } from "@factory/records";
import type { Db } from "./ledger";
import { idCounters } from "./schema";

const MAX_COUNT = 200;

/**
 * Hands out the next `count` IDs of a prefix. One statement, so parallel runs can't get the same ID:
 * the counter moves to max(counter, highest number in the caller's tree) + count.
 */
export async function allocateIds(db: Db, req: AllocateIdsRequest): Promise<string[]> {
  const { project, prefix, count, maxInTree } = req;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT)
    throw new Error(`count must be a whole number from 1 to ${MAX_COUNT}`);
  if (!Number.isInteger(maxInTree) || maxInTree < 0)
    throw new Error("maxInTree must be a whole number, 0 or more");
  formatId(prefix, 1); // refuses a bad prefix before touching the counter

  const [row] = await db
    .insert(idCounters)
    .values({ project, prefix, last: maxInTree + count })
    .onConflictDoUpdate({
      target: [idCounters.project, idCounters.prefix],
      set: { last: sql`greatest(${idCounters.last}, ${maxInTree}::int) + ${count}::int` },
    })
    .returning({ last: idCounters.last });
  const last = row!.last;
  return Array.from({ length: count }, (_, i) => formatId(prefix, last - count + 1 + i));
}
