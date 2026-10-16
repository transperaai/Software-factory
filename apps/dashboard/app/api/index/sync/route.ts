import { indexHandlers } from "@/lib/index-api/handlers";

// Replaces a project's index with the files pushed from its repo (plan K6).
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return indexHandlers.sync(req);
}
