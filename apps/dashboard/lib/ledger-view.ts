import { countUntaggedEvents, createDb, listLedger, utcDay } from "@factory/db";
import type { LedgerRow } from "@factory/db";

export type LedgerView =
  | { state: "ok"; rows: LedgerRow[]; untagged: number; sinceDay: string }
  | { state: "unavailable"; message: string };

/** The last `days` UTC days of the cost ledger, for the home page. Never throws. */
export async function loadLedgerView(days = 7, now = new Date()): Promise<LedgerView> {
  const db = createDb();
  if (!db) return { state: "unavailable", message: "database not configured" };
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  const sinceDay = utcDay(since);
  try {
    const [rows, untagged] = await Promise.all([
      listLedger(db, sinceDay),
      countUntaggedEvents(db, new Date(`${sinceDay}T00:00:00Z`)),
    ]);
    return { state: "ok", rows, untagged, sinceDay };
  } catch (err) {
    return {
      state: "unavailable",
      message: String((err as Error).message).split("\n")[0] ?? "error",
    };
  }
}
