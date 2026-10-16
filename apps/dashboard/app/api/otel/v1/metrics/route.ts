import { otelHandlers } from "@/lib/otel/handlers";

// OTLP metrics from Claude Code, stored raw to cross-check the ledger.
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return otelHandlers.metrics(req);
}
