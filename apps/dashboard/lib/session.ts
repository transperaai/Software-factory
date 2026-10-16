import { redirect } from "next/navigation";
import { auth, authConfigured } from "@/auth";
import { isAllowed } from "@/lib/allowlist";

/** Redirects to sign-in unless the signed-in GitHub account is allowed. Pages and server actions both call it. */
export async function requireAllowed() {
  if (!authConfigured) redirect("/signin");
  const session = await auth();
  // Checked on every request, so a changed allowlist takes effect at once.
  if (!session || !isAllowed((session as { githubId?: string }).githubId)) redirect("/signin");
  return session;
}
