import { inboxRoute } from "@/lib/e2e";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return inboxRoute(req);
}
