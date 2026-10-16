import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApproval, recordApproval } from "./approve";
import { parseRecord, readProject } from "./io";
import { brFile, claimFile, cleanUpProjects, makeProject, writeFile } from "./test-project";
import { traceCheck } from "./trace";

afterEach(cleanUpProjects);

const base = {
  aprId: "APR-0001",
  approver: "SH-00",
  role: "Delivery lead",
  date: "2026-10-16",
};

function project() {
  const dir = makeProject();
  writeFile(dir, "records/claims/CLM-0001.md", claimFile("CLM-0001", "pending"));
  writeFile(dir, "records/brs/BR-01.md", brFile("BR-01", "review", "CLM-0001"));
  return dir;
}

function apply(dir: string, files: Array<{ path: string; content: string }>) {
  for (const f of files) writeFile(dir, f.path, f.content);
}

describe("buildApproval", () => {
  it("confirms claims: APR plus the claim, versions unchanged, schemas pass", () => {
    const dir = project();
    const files = buildApproval({
      ...base,
      records: readProject(dir).records,
      kind: "confirm",
      targets: ["CLM-0001"],
      decision: "approved",
      comment: "Checked against the call",
    });
    expect(files.map((f) => f.path)).toEqual([
      "records/approvals/APR-0001.md",
      "records/claims/CLM-0001.md",
    ]);
    const apr = parseRecord(files[0]!.content).header;
    expect(apr).toMatchObject({
      status: "approved",
      created_by: "human:austin",
      decision: "approved",
      links: { approves: ["CLM-0001@1"] },
    });
    const claim = parseRecord(files[1]!.content).header;
    expect(claim).toMatchObject({ confirmation: "confirmed", version: 1 });
    expect(claim.approval).toBeUndefined();
    apply(dir, files);
    expect(traceCheck(dir)).toEqual([]);
  });

  it("a rejected confirmation marks the claim rejected", () => {
    const dir = project();
    const files = buildApproval({
      ...base,
      records: readProject(dir).records,
      kind: "confirm",
      targets: ["CLM-0001"],
      decision: "rejected",
    });
    expect(parseRecord(files[1]!.content).header.confirmation).toBe("rejected");
  });

  it("approves a BR: status approved and approval set", () => {
    const dir = project();
    apply(
      dir,
      buildApproval({
        ...base,
        records: readProject(dir).records,
        kind: "confirm",
        targets: ["CLM-0001"],
        decision: "approved",
      }),
    );
    const files = buildApproval({
      ...base,
      aprId: "APR-0002",
      records: readProject(dir).records,
      kind: "approve",
      targets: ["BR-01"],
      decision: "approved",
    });
    expect(parseRecord(files[1]!.content).header).toMatchObject({
      status: "approved",
      approval: "APR-0002",
      version: 1,
    });
    apply(dir, files);
    expect(traceCheck(dir)).toEqual([]);
  });

  it("a rejected BR goes back to draft", () => {
    const dir = project();
    const files = buildApproval({
      ...base,
      records: readProject(dir).records,
      kind: "approve",
      targets: ["BR-01"],
      decision: "rejected",
    });
    const br = parseRecord(files[1]!.content).header;
    expect(br.status).toBe("draft");
    expect(br.approval).toBeUndefined();
  });

  it("throws if a target is missing", () => {
    const dir = project();
    expect(() =>
      buildApproval({
        ...base,
        records: readProject(dir).records,
        kind: "approve",
        targets: ["BR-09"],
        decision: "approved",
      }),
    ).toThrow(/BR-09/);
  });
});

describe("recordApproval", () => {
  const opts = {
    allocate: async (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(4, "0")}`),
    date: "2026-10-16",
  };
  const snapshot = (dir: string) =>
    ["records/claims/CLM-0001.md", "records/claims/CLM-0002.md", "records/brs/BR-01.md"].map((p) =>
      existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : "",
    );

  it("confirm writes one APR and confirms every claim", async () => {
    const dir = project();
    writeFile(dir, "records/claims/CLM-0002.md", claimFile("CLM-0002", "pending"));
    const written = await recordApproval(dir, {
      ...opts,
      kind: "confirm",
      targets: ["CLM-0001", "CLM-0002"],
      decision: "approved",
      versions: ["CLM-0001@1"],
      comment: "yes",
    });
    expect(written[0]).toBe("APR-0001");
    expect(written.slice(1)).toEqual([
      "records/approvals/APR-0001.md",
      "records/claims/CLM-0001.md",
      "records/claims/CLM-0002.md",
    ]);
    const { records } = readProject(dir);
    expect(records.get("CLM-0001")!.header.confirmation).toBe("confirmed");
    expect(records.get("CLM-0002")!.header.confirmation).toBe("confirmed");
    expect(records.get("APR-0001")!.header).toMatchObject({
      approver: "SH-00",
      role: "delivery lead",
      comment: "yes",
    });
  });

  it("approve sets status approved and the approval", async () => {
    const dir = project();
    const written = await recordApproval(dir, {
      ...opts,
      kind: "approve",
      targets: ["BR-01"],
      decision: "approved",
      versions: ["BR-01@1"],
    });
    expect(written[0]).toBe("APR-0001");
    expect(readProject(dir).records.get("BR-01")!.header).toMatchObject({
      status: "approved",
      approval: "APR-0001",
    });
  });

  it("refuses and writes nothing on a version mismatch, wrong state or missing target", async () => {
    const dir = project();
    const before = snapshot(dir);
    const base = { ...opts, decision: "approved" as const };
    await expect(
      recordApproval(dir, { ...base, kind: "approve", targets: ["BR-01"], versions: ["BR-01@2"] }),
    ).rejects.toThrow(/version/);
    await expect(
      recordApproval(dir, { ...base, kind: "approve", targets: ["CLM-0001"] }),
    ).rejects.toThrow(/review/);
    await expect(
      recordApproval(dir, { ...base, kind: "confirm", targets: ["BR-01"] }),
    ).rejects.toThrow(/pending/);
    await expect(
      recordApproval(dir, { ...base, kind: "approve", targets: ["BR-09"] }),
    ).rejects.toThrow(/BR-09/);
    expect(snapshot(dir)).toEqual(before);
    expect(existsSync(join(dir, "records/approvals"))).toBe(false);
  });

  it("refuses to approve a record that already has an approval", async () => {
    const dir = project();
    writeFile(
      dir,
      "records/brs/BR-01.md",
      brFile("BR-01", "review", "CLM-0001", "approval: APR-0009"),
    );
    await expect(
      recordApproval(dir, { ...opts, kind: "approve", targets: ["BR-01"], decision: "approved" }),
    ).rejects.toThrow(/already/);
  });
});
