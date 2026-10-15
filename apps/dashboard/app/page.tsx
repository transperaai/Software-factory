import { getBuildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

export default function Home() {
  const build = getBuildInfo();
  return (
    <main>
      <h1>Transpera Factory</h1>
      <p>Empty dashboard. Nothing to show yet.</p>
      <p>
        <small>
          {build.environment} · {build.branch} · {build.commit}
        </small>
      </p>
    </main>
  );
}
