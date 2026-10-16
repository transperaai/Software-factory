// Speaker labels to stakeholders. Exact match only: a wrong guess would put words in the wrong
// mouth, so an unmatched label stays unmatched and the intake agent holds its claims as pending.
import type { Participant } from "../contracts";

export type StakeholderLike = { id: string; name?: string; aliases?: string[]; email?: string };

export function matchSpeakers(labels: string[], stakeholders: StakeholderLike[]): Participant[] {
  const byKey = new Map<string, string>();
  for (const s of stakeholders) {
    for (const key of [s.name, ...(s.aliases ?? []), s.email]) {
      const k = key?.trim().toLowerCase();
      if (k && !byKey.has(k)) byKey.set(k, s.id);
    }
  }
  return labels.map((label) => {
    const stakeholder = byKey.get(label.trim().toLowerCase());
    return stakeholder ? { label, stakeholder } : { label };
  });
}
