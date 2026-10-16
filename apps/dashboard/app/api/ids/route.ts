import { indexHandlers } from "@/lib/index-api/handlers";

// Hands out record IDs so parallel agent runs never collide (plan K6).
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return indexHandlers.ids(req);
}
