import { evalHandler } from "@/lib/evals/handler";

// Eval results from `factory eval store`.
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return evalHandler(req);
}
