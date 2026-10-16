import { threadRoute } from "@/lib/e2e";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return threadRoute(req, (await ctx.params).id);
}
