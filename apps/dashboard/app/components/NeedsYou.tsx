import type { NeedsYouItem } from "@/lib/cards-view";

type Action = (form: FormData) => void | Promise<void>;

export function NeedsYou({
  items,
  confirmClaims,
  approve,
}: {
  items: NeedsYouItem[];
  confirmClaims: Action;
  approve: Action;
}) {
  return (
    <section>
      <h2>Needs you</h2>
      {items.length === 0 && <p>Nothing needs you.</p>}
      <ul>
        {items.map((c) => {
          if (c.kind === "confirm_claims")
            return (
              <li key={`confirm|${c.project}|${c.source}`}>
                <form action={confirmClaims}>
                  <input type="hidden" name="project" value={c.project} />
                  <h3>
                    Confirm claims from {c.sourceTitle} ({c.project}, {c.source})
                  </h3>
                  <ul>
                    {c.claims.map((cl) => (
                      <li key={cl.id}>
                        <label>
                          <input type="checkbox" name="claim" value={cl.id} defaultChecked /> “
                          {cl.words}” — {cl.speaker}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button type="submit" name="decision" value="approved">
                    Confirm
                  </button>{" "}
                  <button type="submit" name="decision" value="rejected">
                    Reject
                  </button>
                </form>
              </li>
            );
          if (c.kind === "approve")
            return (
              <li key={`approve|${c.project}|${c.record}`}>
                <form action={approve}>
                  <input type="hidden" name="project" value={c.project} />
                  <input type="hidden" name="record" value={c.record} />
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
                    <a href={`/thread/${c.project}/${c.record}`}>See the full thread</a>
                  </p>
                  <label>
                    Comment <textarea name="comment" />
                  </label>{" "}
                  <button type="submit" name="decision" value="approved">
                    Approve
                  </button>{" "}
                  <button type="submit" name="decision" value="rejected">
                    Reject
                  </button>
                </form>
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
