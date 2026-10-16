import type { BrRow, ThreadView } from "@/lib/thread-view";

export function BrTable({ project, rows }: { project: string; rows: BrRow[] }) {
  return (
    <section>
      <h1>Thread explorer: {project}</h1>
      {rows.length === 0 ? (
        <p>No business requirements yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={`/thread/${project}/${r.id}`}>{r.id}</a>
                </td>
                <td>{r.title}</td>
                <td>{r.status}</td>
                <td>{r.approval || "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ThreadDetail({ project, thread }: { project: string; thread: ThreadView }) {
  const { br, evidence } = thread;
  return (
    <section>
      <nav>
        <a href={`/thread/${project}`}>← {project} requirements</a>
      </nav>
      <h1>
        {br.id}: {br.title}
      </h1>
      <p>
        Status: {br.status} · Approval: {br.approval || "none"}
      </p>
      <p>Value: {br.value}</p>
      <h2>Evidence</h2>
      {evidence.length === 0 && <p>No evidence found.</p>}
      <ul>
        {evidence.map((e) => (
          <li key={e.id}>
            <blockquote>“{e.quote}”</blockquote>
            {e.speaker} · {e.source} · {e.location} ({e.id})
          </li>
        ))}
      </ul>
    </section>
  );
}
