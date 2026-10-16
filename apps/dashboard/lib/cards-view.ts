import type { Card, IndexQueries, IndexedRecord } from "@factory/records";

export type ClaimView = { id: string; words: string; speaker: string; version: number };

export type NeedsYouItem =
  | {
      kind: "confirm_claims";
      project: string;
      source: string;
      sourceTitle: string;
      claims: ClaimView[];
    }
  | {
      kind: "approve";
      project: string;
      record: string;
      type: string;
      title: string;
      version: number;
      value: string;
      evidence: Array<{ id: string; quote: string }>;
    }
  | { kind: "broken_link"; project: string; record: string; detail: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function speakerName(q: IndexQueries, project: string, claim: IndexedRecord) {
  const id = claim.header.links?.said_by?.[0];
  if (!id) return "(unknown)";
  return (await q.getRecord(project, id))?.title ?? id;
}

async function claimView(q: IndexQueries, project: string, id: string): Promise<ClaimView> {
  const claim = await q.getRecord(project, id);
  if (!claim) return { id, words: "(missing)", speaker: "(unknown)", version: 0 };
  return {
    id,
    words: str(claim.header.words) || claim.title,
    speaker: await speakerName(q, project, claim),
    version: claim.version ?? 0,
  };
}

/** The "Needs you" list: each card with the words, speakers and quotes Austin needs to decide. */
export async function loadNeedsYou(q: IndexQueries, cards?: Card[]): Promise<NeedsYouItem[]> {
  const out: NeedsYouItem[] = [];
  for (const c of cards ?? (await q.cards())) {
    if (c.kind === "confirm_claims") {
      const claims = await Promise.all(c.claims.map((id) => claimView(q, c.project, id)));
      out.push({ ...c, claims });
    } else if (c.kind === "approve") {
      const rec = await q.getRecord(c.project, c.record);
      const ids = rec?.header.links?.evidence ?? [];
      const evidence = await Promise.all(
        ids.map(async (id) => ({ id, quote: (await claimView(q, c.project, id)).words })),
      );
      out.push({ ...c, value: str(rec?.header.value), evidence });
    } else {
      out.push(c);
    }
  }
  return out;
}
