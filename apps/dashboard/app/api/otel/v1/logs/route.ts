import { otelHandlers } from "@/lib/otel/handlers";

// OTLP logs from Claude Code (OTEL_EXPORTER_OTLP_ENDPOINT=<dashboard>/api/otel appends /v1/logs).
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return otelHandlers.logs(req);
}
