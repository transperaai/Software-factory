import { getBuildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, ...getBuildInfo() });
}
