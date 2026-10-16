import { desc, eq } from "drizzle-orm";
import type { Db } from "./ledger";
import { evalResults, evalRuns } from "./schema";

export type EvalRunRow = typeof evalRuns.$inferInsert;
export type EvalResultRow = Omit<typeof evalResults.$inferInsert, "runId">;

/**
 * Stores one eval run and its results. Each run keeps its own ID, so two runs are two rows,
 * and resending the same run (same ID) changes nothing.
 */
export async function storeEvalRun(db: Db, run: EvalRunRow, results: EvalResultRow[]) {
  const inserted = await db
    .insert(evalRuns)
    .values(run)
    .onConflictDoNothing({ target: evalRuns.id })
    .returning({ id: evalRuns.id });
  if (results.length) {
    await db
      .insert(evalResults)
      .values(results.map((r) => ({ ...r, runId: run.id })))
      .onConflictDoNothing({ target: [evalResults.runId, evalResults.caseId] });
  }
  return { stored: inserted.length === 1 };
}

/** The latest runs, newest first. */
export async function listEvalRuns(db: Db, limit = 10) {
  return db.select().from(evalRuns).orderBy(desc(evalRuns.startedAt)).limit(limit);
}

export async function listEvalResults(db: Db, runId: string) {
  return db
    .select()
    .from(evalResults)
    .where(eq(evalResults.runId, runId))
    .orderBy(evalResults.caseId);
}
