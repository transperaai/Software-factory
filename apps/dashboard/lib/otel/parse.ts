import type { TokenEvent } from "@factory/db";

// OTLP http/json shapes, only as far as we read them. int64 values may arrive as strings.
type AnyValue = {
  stringValue?: string;
  intValue?: number | string;
  doubleValue?: number | string;
  boolValue?: boolean;
};
type KeyValue = { key?: string; value?: AnyValue };
type LogRecord = {
  timeUnixNano?: number | string;
  observedTimeUnixNano?: number | string;
  body?: AnyValue;
  attributes?: KeyValue[];
};
type LogsPayload = {
  resourceLogs?: {
    resource?: { attributes?: KeyValue[] };
    scopeLogs?: { logRecords?: LogRecord[] }[];
  }[];
};

/** The factory tags set through OTEL_RESOURCE_ATTRIBUTES, and the token_events column each fills. */
const TAGS = {
  project: "factory.project",
  client: "factory.client",
  agent: "factory.agent",
  slice: "factory.slice",
} as const;

export type ParsedLogs = { events: TokenEvent[]; rejected: number; rejectedReason?: string };

export class PayloadError extends Error {}

function toMap(list: KeyValue[] | undefined, into = new Map<string, AnyValue>()) {
  for (const kv of list ?? []) if (kv?.key && kv.value) into.set(kv.key, kv.value);
  return into;
}

function str(v: AnyValue | undefined): string {
  if (!v) return "";
  if (typeof v.stringValue === "string") return v.stringValue.trim();
  const scalar = v.intValue ?? v.doubleValue ?? v.boolValue;
  return scalar === undefined ? "" : String(scalar);
}

function num(v: AnyValue | undefined): number {
  const n = Number(v?.intValue ?? v?.doubleValue ?? v?.stringValue ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fromNanos(n: number | string | undefined): Date | undefined {
  if (n === undefined || n === "" || n === 0 || n === "0") return undefined;
  try {
    return new Date(Number(BigInt(n) / 1_000_000n));
  } catch {
    return undefined;
  }
}

function eventTime(attrs: Map<string, AnyValue>, record: LogRecord): Date {
  const iso = str(attrs.get("event.timestamp"));
  const candidates = [
    iso ? new Date(iso) : undefined,
    fromNanos(record.timeUnixNano),
    fromNanos(record.observedTimeUnixNano),
  ];
  return candidates.find((d) => d && !Number.isNaN(d.getTime())) ?? new Date();
}

function isApiRequest(attrs: Map<string, AnyValue>, record: LogRecord) {
  return (
    str(attrs.get("event.name")) === "api_request" || str(record.body) === "claude_code.api_request"
  );
}

/**
 * Pulls Claude Code `api_request` events out of an OTLP logs payload. Other events are ignored.
 * Tags come from the resource, overridden by the record's own attributes when it carries them.
 * An event with no request ID can't be de-duplicated, so it is rejected rather than stored.
 */
export function parseLogs(payload: unknown): ParsedLogs {
  const body = payload as LogsPayload;
  if (!body || typeof body !== "object" || !Array.isArray(body.resourceLogs)) {
    throw new PayloadError("expected an OTLP logs payload with resourceLogs");
  }
  const events: TokenEvent[] = [];
  let rejected = 0;
  for (const rl of body.resourceLogs) {
    const resource = toMap(rl?.resource?.attributes);
    for (const sl of rl?.scopeLogs ?? []) {
      for (const record of sl?.logRecords ?? []) {
        const attrs = toMap(record?.attributes, new Map(resource));
        if (!isApiRequest(attrs, record)) continue;
        const requestId = str(attrs.get("request_id")) || str(attrs.get("client_request_id"));
        if (!requestId) {
          rejected++;
          continue;
        }
        const tags = {
          project: str(attrs.get(TAGS.project)),
          client: str(attrs.get(TAGS.client)),
          agent: str(attrs.get(TAGS.agent)),
          slice: str(attrs.get(TAGS.slice)),
        };
        events.push({
          requestId,
          occurredAt: eventTime(attrs, record),
          sessionId: str(attrs.get("session.id")),
          project: tags.project,
          client: tags.client,
          agent: tags.agent,
          sliceId: tags.slice,
          missingTags: (Object.keys(tags) as (keyof typeof tags)[]).filter((k) => !tags[k]),
          model: str(attrs.get("model")),
          inputTokens: Math.round(num(attrs.get("input_tokens"))),
          outputTokens: Math.round(num(attrs.get("output_tokens"))),
          cacheReadTokens: Math.round(num(attrs.get("cache_read_tokens"))),
          cacheCreationTokens: Math.round(num(attrs.get("cache_creation_tokens"))),
          costUsd: num(attrs.get("cost_usd")).toFixed(6),
        });
      }
    }
  }
  return rejected
    ? { events, rejected, rejectedReason: "api_request events without request_id" }
    : { events, rejected };
}

/** Account identifiers removed from raw metrics before they are stored. Tags and session IDs stay. */
const IDENTITY_KEYS = new Set([
  "user.email",
  "user.account_uuid",
  "user.account_id",
  "organization.id",
]);

/** Returns a copy of an OTLP payload without account identity attributes. */
export function withoutIdentity<T>(payload: T): T {
  const strip = (o: unknown): unknown => {
    if (Array.isArray(o)) {
      return o
        .filter(
          (x) => !(x && typeof x === "object" && IDENTITY_KEYS.has((x as KeyValue).key ?? "")),
        )
        .map(strip);
    }
    if (o && typeof o === "object") {
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, strip(v)]));
    }
    return o;
  };
  return strip(payload) as T;
}
