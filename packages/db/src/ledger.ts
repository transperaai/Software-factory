import { desc, gte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { costLedger, otelMetricBatches, tokenEvents } from "./schema";

/** Any Drizzle Postgres client: Neon over HTTP in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type TokenEvent = typeof tokenEvents.$inferInsert;
export type LedgerRow = typeof costLedger.$inferSelect;

// Well under Postgres's 65,535 bind parameter limit at 14 columns a row.
const CHUNK = 500;

/** UTC calendar day of a timestamp, as YYYY-MM-DD. The ledger's days are UTC. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Stores api_request events and rebuilds the ledger for the days they fall on.
 * Safe to repeat: a known request_id is skipped, and the rebuild recomputes each day from scratch,
 * so a resent batch changes nothing and a batch whose rebuild failed is repaired when resent.
 */
export async function ingestTokenEvents(db: Db, events: TokenEvent[]) {
  let inserted = 0;
  for (let i = 0; i < events.length; i += CHUNK) {
    const rows = await db
      .insert(tokenEvents)
      .values(events.slice(i, i + CHUNK))
      .onConflictDoNothing({ target: tokenEvents.requestId })
      .returning({ requestId: tokenEvents.requestId });
    inserted += rows.length;
  }
  const days = [...new Set(events.map((e) => utcDay(e.occurredAt)))];
  await rebuildLedger(db, days);
  return { received: events.length, inserted, days };
}

/** Recomputes the Claude Code rows of cost_ledger for the given UTC days from token_events. */
export async function rebuildLedger(db: Db, days: string[]) {
  if (days.length === 0) return;
  const day = sql`(${tokenEvents.occurredAt} at time zone 'UTC')::date`;
  const dayList = sql.join(
    days.map((d) => sql`${d}::date`),
    sql`, `,
  );
  await db.execute(sql`
    insert into ${costLedger} (date, project, client, agent, model, source, category, amount, basis, updated_at)
    select ${day}, ${tokenEvents.project}, ${tokenEvents.client}, ${tokenEvents.agent}, ${tokenEvents.model},
           'claude_code', 'ai', sum(${tokenEvents.costUsd}), 'allocated', now()
    from ${tokenEvents}
    where ${day} in (${dayList})
    group by 1, 2, 3, 4, 5
    on conflict (date, project, client, agent, model, source, category)
    do update set amount = excluded.amount, updated_at = excluded.updated_at
  `);
}

/** Keeps a raw metrics batch for cross-checking. A resent batch has the same hash and is skipped. */
export async function storeMetricBatch(db: Db, sha256: string, payload: unknown) {
  const rows = await db
    .insert(otelMetricBatches)
    .values({ sha256, payload })
    .onConflictDoNothing({ target: otelMetricBatches.sha256 })
    .returning({ sha256: otelMetricBatches.sha256 });
  return { inserted: rows.length };
}

/** Ledger rows from the given UTC day on, newest first. */
export async function listLedger(db: Db, sinceDay: string): Promise<LedgerRow[]> {
  return db
    .select()
    .from(costLedger)
    .where(gte(costLedger.date, sinceDay))
    .orderBy(desc(costLedger.date), costLedger.project, costLedger.agent, costLedger.model);
}

/** How many events since the given time arrived without one or more factory tags. */
export async function countUntaggedEvents(db: Db, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tokenEvents)
    .where(
      sql`${tokenEvents.occurredAt} >= ${since.toISOString()}::timestamptz and cardinality(${tokenEvents.missingTags}) > 0`,
    );
  return row?.n ?? 0;
}
