import { cardsRoute } from "@/lib/e2e";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return cardsRoute(req);
}
