import { notFound } from "next/navigation";
import { ThreadDetail } from "@/app/components/Thread";
import { requireAllowed } from "@/lib/session";
import { getQueries } from "@/lib/deps";
import { loadThread } from "@/lib/thread-view";
import { PROJECT_RE } from "@/lib/wiring";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ project: string; id: string }>;
}) {
  await requireAllowed();
  const { project, id } = await params;
  if (!PROJECT_RE.test(project)) notFound();
  const q = getQueries();
  if (!q) return <main>The record index is not available.</main>;
  const thread = await loadThread(q, project, id);
  if (!thread) notFound();
  return (
    <main>
      <ThreadDetail project={project} thread={thread} />
    </main>
  );
}
