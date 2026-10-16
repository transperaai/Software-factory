import { uploadAction } from "@/app/actions";
import { getQueries, listProjects } from "@/lib/deps";
import { requireAllowed } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  await requireAllowed();
  const projects = await listProjects();
  const q = getQueries();
  const sources = q
    ? (
        await Promise.all(
          projects.map(async (project) =>
            Promise.all(
              (await q.listRecords({ project, type: "source" })).map(async (s) => ({
                project,
                id: s.id,
                title: s.title,
                claims: (await q.listRecords({ project, type: "claim", from_source: s.id })).length,
              })),
            ),
          ),
        )
      ).flat()
    : [];
  return (
    <main>
      <h1>Inbox</h1>
      <form action={uploadAction}>
        <label>
          Project{" "}
          <select name="project" required>
            {projects.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>{" "}
        <input type="file" name="file" accept=".txt,.vtt,.md" required />{" "}
        <button type="submit">Upload</button>
        <p>
          <small>.txt, .vtt or .md, up to 1 MB.</small>
        </p>
      </form>
      <h2>Latest sources</h2>
      {sources.length === 0 && <p>No sources yet.</p>}
      <ul>
        {sources
          .slice(-20)
          .reverse()
          .map((s) => (
            <li key={`${s.project}|${s.id}`}>
              {s.project} · {s.id} · {s.title} · {s.claims} claims
            </li>
          ))}
      </ul>
    </main>
  );
}
