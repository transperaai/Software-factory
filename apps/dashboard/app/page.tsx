import { redirect } from "next/navigation";
import { checkDb } from "@factory/db";
import { auth, authConfigured, signOut } from "@/auth";
import { isAllowed } from "@/lib/allowlist";
import { getBuildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

const DB_LABEL = {
  connected: "connected",
  not_configured: "not configured",
  error: "error",
} as const;

export default async function Home() {
  if (!authConfigured) redirect("/signin");
  const session = await auth();
  // Checked again here, not only at sign-in, so a changed allowlist takes effect at once.
  if (!session || !isAllowed((session as { githubId?: string }).githubId)) redirect("/signin");

  const [db, build] = [await checkDb(), getBuildInfo()];
  return (
    <main>
      <h1>Transpera Factory</h1>
      <p>Signed in as {session.user?.name ?? "you"}. Nothing to show yet.</p>
      <p>
        Database: {DB_LABEL[db.state]}
        {db.state === "connected" && ` (${db.latencyMs} ms)`}
        {db.state === "error" && ` (${db.message})`}
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button type="submit">Sign out</button>
      </form>
      <p>
        <small>
          {build.environment} · {build.branch} · {build.commit}
        </small>
      </p>
    </main>
  );
}
