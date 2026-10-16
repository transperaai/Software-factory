import { createDb, listEvalRuns } from "@factory/db";

export type EvalRunsView =
  | { state: "ok"; runs: Awaited<ReturnType<typeof listEvalRuns>> }
  | { state: "unavailable"; message: string };

/** The latest eval runs, for the home page. Never throws. */
export async function loadEvalRunsView(limit = 5): Promise<EvalRunsView> {
  const db = createDb();
  if (!db) return { state: "unavailable", message: "database not configured" };
  try {
    return { state: "ok", runs: await listEvalRuns(db, limit) };
  } catch (err) {
    return {
      state: "unavailable",
      message: String((err as Error).message).split("\n")[0] ?? "error",
    };
  }
}
