import type { NeedsYouItem } from "@/lib/cards-view";

export function NeedsYou({ items }: { items: NeedsYouItem[] }) {
  return (
    <section>
      <h2>Needs you</h2>
      {items.length === 0 && <p>Nothing needs you.</p>}
      <ul>
        {items.map((c) => {
          if (c.kind === "confirm_claims")
            return (
              <li key={`confirm|${c.project}|${c.source}`}>
                <h3>
                  Confirm claims from {c.source} ({c.claims.length} claims): tell Claude in your
                  project session.
                </h3>
                <p>
                  {c.sourceTitle} ({c.project})
                </p>
                <ul>
                  {c.claims.map((cl) => (
                    <li key={cl.id}>
                      {cl.id}: “{cl.words}” — {cl.speaker}
                    </li>
                  ))}
                </ul>
              </li>
            );
          if (c.kind === "approve")
            return (
              <li key={`approve|${c.project}|${c.record}`}>
                <h3>
                  Approve {c.record} v{c.version}: {c.title} ({c.project})
                </h3>
                <p>Value: {c.value}</p>
                <ul>
                  {c.evidence.map((e) => (
                    <li key={e.id}>“{e.quote}”</li>
                  ))}
                </ul>
                <p>
                  Tell Claude in your project session.{" "}
                  <a href={`/thread/${c.project}/${c.record}`}>See the full thread</a>
                </p>
              </li>
            );
          return (
            <li key={`broken|${c.project}|${c.record}|${c.detail}`}>
              Broken link in <a href={`/thread/${c.project}/${c.record}`}>{c.record}</a> (
              {c.project}): {c.detail}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
