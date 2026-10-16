import { recordsHandler } from "@/lib/records/ingest";

// Record files pushed from a project repo (spike 3 seed; the real index sync is F-01).
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return recordsHandler(req);
}
