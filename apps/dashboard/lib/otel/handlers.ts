import { createHash, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createDb, ingestTokenEvents, storeMetricBatch } from "@factory/db";
import type { Db } from "@factory/db";
import { parseLogs, PayloadError, withoutIdentity } from "./parse";

export type OtelDeps = {
  /** The shared ingest token (OTEL_INGEST_TOKEN). Read per request so tests can vary it. */
  token: () => string | undefined;
  db: () => Db | undefined;
};

class UnsupportedError extends Error {}

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/** Constant-time check of `Authorization: Bearer <token>`. No token configured means no access. */
export function authorized(header: string | null, token: string | undefined): boolean {
  if (!token || !header?.startsWith("Bearer ")) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header.slice("Bearer ".length).trim()), digest(token));
}

/** Reads an OTLP http/json body, gzipped or not. Returns the raw bytes too, for hashing. */
async function readBody(req: Request): Promise<{ raw: Buffer; payload: unknown }> {
  if (!(req.headers.get("content-type") ?? "").includes("json")) {
    throw new UnsupportedError(
      "only OTLP http/json is accepted; set OTEL_EXPORTER_OTLP_PROTOCOL=http/json",
    );
  }
  let raw = Buffer.from(await req.arrayBuffer());
  try {
    if (req.headers.get("content-encoding") === "gzip") raw = gunzipSync(raw);
    return { raw, payload: JSON.parse(raw.toString("utf8")) };
  } catch {
    throw new PayloadError("body is not valid JSON");
  }
}

/**
 * Wraps an ingest step with the shared checks. Status codes follow the OTLP spec: the exporter
 * retries 503, so a database hiccup is retried, while bad requests are not.
 */
function handler(
  deps: OtelDeps,
  ingest: (db: Db, raw: Buffer, payload: unknown) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    if (!authorized(req.headers.get("authorization"), deps.token())) {
      return json(401, { error: "unauthorized" });
    }
    let body: { raw: Buffer; payload: unknown };
    try {
      body = await readBody(req);
    } catch (err) {
      if (err instanceof UnsupportedError) return json(415, { error: err.message });
      return json(400, { error: (err as Error).message });
    }
    const db = deps.db();
    if (!db) return json(503, { error: "database not configured" });
    try {
      return await ingest(db, body.raw, body.payload);
    } catch (err) {
      if (err instanceof PayloadError) return json(400, { error: err.message });
      // Keep the first line only: driver errors can carry query text.
      console.error("otel ingest failed:", String((err as Error).message).split("\n")[0]);
      return json(503, { error: "ingest failed; retry" });
    }
  };
}

export function makeOtelHandlers(deps: OtelDeps) {
  return {
    logs: handler(deps, async (db, _raw, payload) => {
      const { events, rejected, rejectedReason } = parseLogs(payload);
      if (events.length) await ingestTokenEvents(db, events);
      // OTLP success response; partialSuccess tells the exporter what was dropped.
      return json(
        200,
        rejected
          ? { partialSuccess: { rejectedLogRecords: rejected, errorMessage: rejectedReason } }
          : {},
      );
    }),
    metrics: handler(deps, async (db, raw, payload) => {
      if (!payload || typeof payload !== "object" || !("resourceMetrics" in payload)) {
        throw new PayloadError("expected an OTLP metrics payload with resourceMetrics");
      }
      const sha256 = createHash("sha256").update(raw).digest("hex");
      await storeMetricBatch(db, sha256, withoutIdentity(payload));
      return json(200, {});
    }),
  };
}

/** The live handlers: token and database from the environment. */
export const otelHandlers = makeOtelHandlers({
  token: () => process.env.OTEL_INGEST_TOKEN,
  db: () => createDb(),
});
