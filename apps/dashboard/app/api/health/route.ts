import { databaseKind } from "@factory/db/guard";
import { getBuildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

// `database` says which Neon database this deployment uses (production, its own preview branch,
// or unknown), without showing the host. Spike 5 uses it to prove a preview has its own branch.
export function GET() {
  return Response.json({ ok: true, ...getBuildInfo(), database: databaseKind(process.env) });
}
