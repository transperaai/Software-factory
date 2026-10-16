import { createDb, storeEvalRun } from "@factory/db";
import type { Db, EvalResultRow, EvalRunRow } from "@factory/db";
import { authorized } from "../otel/handlers";

export type EvalDeps = { token: () => string | undefined; db: () => Db | undefined };

export class EvalFileError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function need(cond: unknown, message: string): asserts cond {
  if (!cond) throw new EvalFileError(message);
}

const isText = (v: unknown, max = 200): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Checks a results file from `factory eval run` (format 1) and maps it to table rows. */
export function parseEvalRunFile(body: unknown): { run: EvalRunRow; results: EvalResultRow[] } {
  need(body && typeof body === "object" && !Array.isArray(body), "expected an eval results file");
  const f = body as Record<string, unknown>;
  need(f.format === 1, "unsupported results format; expected format 1");
  need(typeof f.id === "string" && UUID.test(f.id), "id must be a UUID");
  need(isText(f.agent, 64), "agent is required");
  need(isTime(f.startedAt) && isTime(f.finishedAt), "startedAt and finishedAt must be timestamps");
  need(
    isText(f.kitVersion, 32) && isText(f.gitSha, 64) && isText(f.trigger),
    "kitVersion, gitSha and trigger are required",
  );
  need(isAmount(f.costUsd), "costUsd must be a non-negative number");
  need(
    Array.isArray(f.results) && f.results.length > 0 && f.results.length <= 500,
    "results must list 1 to 500 cases",
  );

  const ids = new Set<string>();
  const results = (f.results as Record<string, unknown>[]).map((r, i): EvalResultRow => {
    const at = `results[${i}]`;
    need(r && typeof r === "object", `${at} must be an object`);
    need(isText(r.caseId, 100) && !ids.has(r.caseId), `${at}.caseId is missing or repeated`);
    ids.add(r.caseId);
    need(typeof r.passed === "boolean", `${at}.passed must be true or false`);
    need(
      typeof r.score === "number" && r.score >= 0 && r.score <= 1,
      `${at}.score must be between 0 and 1`,
    );
    need(Array.isArray(r.rules), `${at}.rules must be a list`);
    need(
      isAmount(r.costUsd) && isCount(r.durationMs),
      `${at}.costUsd and durationMs must be numbers`,
    );
    return {
      caseId: r.caseId,
      passed: r.passed,
      score: r.score.toFixed(4),
      rules: r.rules,
      reply: typeof r.reply === "string" ? r.reply.slice(0, 10_000) : "",
      error: typeof r.error === "string" ? r.error.slice(0, 2_000) : null,
      model: typeof r.model === "string" ? r.model.slice(0, 200) : "",
      costUsd: r.costUsd.toFixed(6),
      durationMs: r.durationMs,
    };
  });

  return {
    run: {
      id: f.id,
      agent: f.agent,
      startedAt: new Date(f.startedAt),
      finishedAt: new Date(f.finishedAt),
      kitVersion: f.kitVersion,
      gitSha: f.gitSha,
      trigger: f.trigger,
      // Counted here rather than trusted from the file.
      casesTotal: results.length,
      casesPassed: results.filter((r) => r.passed).length,
      costUsd: f.costUsd.toFixed(6),
    },
    results,
  };
}

/** POST /api/evals/runs: stores one results file. Same bearer token as the OTel ingest. */
export function makeEvalHandler(deps: EvalDeps) {
  return async (req: Request): Promise<Response> => {
    if (!authorized(req.headers.get("authorization"), deps.token())) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let parsed: ReturnType<typeof parseEvalRunFile>;
    try {
      parsed = parseEvalRunFile(await req.json());
    } catch (err) {
      const message = err instanceof EvalFileError ? err.message : "body is not valid JSON";
      return Response.json({ error: message }, { status: 400 });
    }
    const db = deps.db();
    if (!db) return Response.json({ error: "database not configured" }, { status: 503 });
    try {
      const { stored } = await storeEvalRun(db, parsed.run, parsed.results);
      return Response.json({ stored, id: parsed.run.id });
    } catch (err) {
      console.error("eval store failed:", String((err as Error).message).split("\n")[0]);
      return Response.json({ error: "store failed; retry" }, { status: 503 });
    }
  };
}

export const evalHandler = makeEvalHandler({
  token: () => process.env.OTEL_INGEST_TOKEN,
  db: () => createDb(),
});
