// Trace rules that F-01 can check (design doc, "ID and trace schema"). Later phases add more.
import type { TraceFinding } from "./contracts";
import { readProject } from "./io";
import { schemaDirFor, validateProject } from "./validate";

export function traceCheck(dir: string, schemaDir = schemaDirFor(dir)): TraceFinding[] {
  const { records } = readProject(dir);
  const findings = validateProject(dir, schemaDir);

  for (const [id, { path, header }] of records) {
    if (
      header.type === "business_requirement" &&
      (header.status === "review" || header.status === "approved")
    ) {
      for (const ref of header.links?.evidence ?? []) {
        const claim = records.get(ref);
        if (claim?.header.type === "claim" && claim.header.confirmation !== "confirmed")
          findings.push({
            kind: "unconfirmed_evidence",
            recordId: id,
            path,
            detail: `cites ${ref}, which is ${String(claim.header.confirmation)}, not confirmed`,
          });
      }
    }

    if (header.approval) {
      const approved = records
        .get(header.approval)
        ?.header.links?.approves?.map((r) => r.split("@"))
        .find(([target]) => target === id);
      if (approved && Number(approved[1]) !== header.version)
        findings.push({
          kind: "changed_after_approval",
          recordId: id,
          path,
          detail: `${header.approval} approved version ${approved[1]}, now version ${header.version}`,
        });
    }
  }
  return findings;
}
