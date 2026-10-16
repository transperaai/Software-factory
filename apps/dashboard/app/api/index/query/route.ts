import { indexHandlers } from "@/lib/index-api/handlers";

// Lists indexed records for run input bundles (plan K6).
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return indexHandlers.query(req);
}
