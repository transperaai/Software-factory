import { notFound } from "next/navigation";
import { BrTable } from "@/app/components/Thread";
import { requireAllowed } from "@/lib/session";
import { getQueries } from "@/lib/deps";
import { loadBrTable } from "@/lib/thread-view";
import { PROJECT_RE } from "@/lib/wiring";

export const dynamic = "force-dynamic";

export default async function ThreadTable({ params }: { params: Promise<{ project: string }> }) {
  await requireAllowed();
  const { project } = await params;
  if (!PROJECT_RE.test(project)) notFound();
  const q = getQueries();
  if (!q) return <main>The record index is not available.</main>;
  return (
    <main>
      <BrTable project={project} rows={await loadBrTable(q, project)} />
    </main>
  );
}
