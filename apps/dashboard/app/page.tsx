import { redirect } from "next/navigation";
import { checkDb } from "@factory/db";
import { auth, authConfigured, signOut } from "@/auth";
import { isAllowed } from "@/lib/allowlist";
import { getBuildInfo } from "@/lib/build-info";
import { loadEvalRunsView } from "@/lib/evals-view";
import { loadLedgerView } from "@/lib/ledger-view";

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

  const [db, ledger, evals, build] = [
    await checkDb(),
    await loadLedgerView(),
    await loadEvalRunsView(),
    getBuildInfo(),
  ];
  return (
    <main>
      <h1>Transpera Factory</h1>
      <p>Signed in as {session.user?.name ?? "you"}. Nothing to show yet.</p>
      <p>
        Database: {DB_LABEL[db.state]}
        {db.state === "connected" && ` (${db.latencyMs} ms)`}
        {db.state === "error" && ` (${db.message})`}
      </p>
      <h2>Cost ledger, last 7 days (UTC)</h2>
      {ledger.state === "unavailable" && <p>Not available ({ledger.message}).</p>}
      {ledger.state === "ok" && ledger.rows.length === 0 && <p>No usage recorded yet.</p>}
      {ledger.state === "ok" && ledger.rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Agent</th>
              <th>Model</th>
              <th>Amount (USD)</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.map((r) => (
              <tr key={`${r.date}|${r.project}|${r.client}|${r.agent}|${r.model}|${r.source}`}>
                <td>{r.date}</td>
                <td>{r.project || "(untagged)"}</td>
                <td>{r.agent || "(untagged)"}</td>
                <td>{r.model}</td>
                <td>{Number(r.amount).toFixed(4)}</td>
                <td>{r.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ledger.state === "ok" && ledger.untagged > 0 && (
        <p>{ledger.untagged} requests arrived without a full set of tags.</p>
      )}
      <p>
        <small>On Max, amounts are the API-equivalent price, allocated rather than billed.</small>
      </p>
      <h2>Recent eval runs</h2>
      {evals.state === "unavailable" && <p>Not available ({evals.message}).</p>}
      {evals.state === "ok" && evals.runs.length === 0 && <p>No eval runs yet.</p>}
      {evals.state === "ok" && evals.runs.length > 0 && (
        <ul>
          {evals.runs.map((r) => (
            <li key={r.id}>
              {r.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {r.agent} ·{" "}
              {r.casesPassed}/{r.casesTotal} passed · kit {r.kitVersion} · {r.trigger}
            </li>
          ))}
        </ul>
      )}
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
