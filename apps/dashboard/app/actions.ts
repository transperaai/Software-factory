"use server";

import { revalidatePath } from "next/cache";
import { recordDecision } from "@/lib/approvals";
import { uploadSource } from "@/lib/inbox";
import { requireAllowed } from "@/lib/session";
import { PROJECT_RE, approvalDeps, inboxDeps } from "@/lib/wiring";

function project(form: FormData): string {
  const p = String(form.get("project") ?? "");
  if (!PROJECT_RE.test(p)) throw new Error("Bad project name.");
  return p;
}

function decision(form: FormData) {
  const d = String(form.get("decision"));
  if (d !== "approved" && d !== "rejected") throw new Error("Bad decision.");
  return d;
}

function version(v: unknown): number {
  const n = Number(v);
  if (!/^\d+$/.test(String(v)) || n < 1) throw new Error("Bad version.");
  return n;
}

/** Confirm or reject the ticked claims. Unticked claims stay pending. */
export async function confirmClaimsAction(form: FormData) {
  await requireAllowed();
  const claims = form.getAll("claim").map((v) => {
    const [id = "", ver = ""] = String(v).split("@");
    if (!/^CLM-\d+$/.test(id)) throw new Error("Bad claim.");
    return [id, version(ver)] as const;
  });
  if (claims.length === 0) return;
  const p = project(form);
  await recordDecision(
    {
      project: p,
      kind: "confirm",
      targets: claims.map(([id]) => id),
      versions: Object.fromEntries(claims),
      decision: decision(form),
    },
    approvalDeps(p),
  );
  revalidatePath("/");
}

export async function approveAction(form: FormData) {
  await requireAllowed();
  const p = project(form);
  const comment = String(form.get("comment") ?? "").trim();
  const record = String(form.get("record"));
  await recordDecision(
    {
      project: p,
      kind: "approve",
      targets: [record],
      versions: { [record]: version(form.get("version")) },
      decision: decision(form),
      ...(comment ? { comment } : {}),
    },
    approvalDeps(p),
  );
  revalidatePath("/");
}

export async function uploadAction(form: FormData) {
  await requireAllowed();
  const p = project(form);
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Choose a file.");
  await uploadSource(
    { project: p, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
    inboxDeps(p),
  );
  revalidatePath("/inbox");
}
