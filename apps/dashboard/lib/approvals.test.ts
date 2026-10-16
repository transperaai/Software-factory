import { describe, expect, it, vi } from "vitest";
import { parseRecord } from "@factory/records";
import { recordDecision } from "@/lib/approvals";
import type { ApprovalDeps } from "@/lib/approvals";
import { buildApproval as realBuildApproval } from "@/lib/deps";
import type { BuildApproval } from "@/lib/deps";
import { fakeQueries } from "@/lib/fake-index";

function setup() {
  const github = {
    commitFiles: vi.fn(async () => "sha"),
    openAndMerge: vi.fn(async () => {}),
    dispatch: vi.fn(async () => {}),
  };
  const allocate = vi.fn(async () => ["APR-0002"]);
  const buildApproval = vi.fn<BuildApproval>(() => [
    { path: "records/approvals/APR-0002.md", content: "apr" },
    { path: "records/business-requirements/BR-01.md", content: "br" },
  ]);
  const deps: ApprovalDeps = {
    queries: fakeQueries(),
    allocate,
    buildApproval,
    github,
    now: () => new Date("2026-10-16T10:00:00Z"),
  };
  return { deps, github, allocate, buildApproval };
}

describe("recordDecision", () => {
  it("commits the APR and BR on approval/<APR>, then merges", async () => {
    const { deps, github, allocate, buildApproval } = setup();
    const apr = await recordDecision(
      { project: "acme", kind: "approve", targets: ["BR-01"], decision: "approved" },
      deps,
    );
    expect(apr).toBe("APR-0002");
    expect(allocate).toHaveBeenCalledWith({
      project: "acme",
      prefix: "APR",
      count: 1,
      maxInTree: 1,
    });
    expect(buildApproval.mock.calls[0]![0]).toMatchObject({
      aprId: "APR-0002",
      date: "2026-10-16",
    });
    expect(github.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "approval/APR-0002", files: expect.any(Array) }),
    );
    expect(github.openAndMerge).toHaveBeenCalledWith(
      "approval/APR-0002",
      expect.any(String),
      expect.any(String),
    );
    expect(github.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches ba.yml with the source after a confirm", async () => {
    const { deps, github } = setup();
    await recordDecision(
      { project: "acme", kind: "confirm", targets: ["CLM-0002"], decision: "approved" },
      deps,
    );
    expect(github.dispatch).toHaveBeenCalledWith("ba.yml", "main", { source: "SRC-001" });
  });

  it("does not dispatch on reject", async () => {
    const { deps, github } = setup();
    await recordDecision(
      { project: "acme", kind: "confirm", targets: ["CLM-0002"], decision: "rejected" },
      deps,
    );
    expect(github.commitFiles).toHaveBeenCalled();
    expect(github.dispatch).not.toHaveBeenCalled();
  });

  it("throws on a missing target before any GitHub call", async () => {
    const { deps, github } = setup();
    await expect(
      recordDecision(
        { project: "acme", kind: "approve", targets: ["BR-99"], decision: "approved" },
        deps,
      ),
    ).rejects.toThrow("No record BR-99");
    expect(github.commitFiles).not.toHaveBeenCalled();
  });

  it("refuses a version the user did not see, before allocate or GitHub", async () => {
    const { deps, github, allocate } = setup();
    await expect(
      recordDecision(
        {
          project: "acme",
          kind: "approve",
          targets: ["BR-01"],
          decision: "approved",
          versions: { "BR-01": 2 },
        },
        deps,
      ),
    ).rejects.toThrow("BR-01 changed since you saw it (v2, now v1)");
    expect(allocate).not.toHaveBeenCalled();
    expect(github.commitFiles).not.toHaveBeenCalled();
  });

  it("refuses an approve target that is not waiting for approval", async () => {
    const { deps, github } = setup();
    const real = deps.queries.getRecord.bind(deps.queries);
    deps.queries.getRecord = async (p, id) => {
      const r = await real(p, id);
      return r && { ...r, status: "approved" };
    };
    await expect(
      recordDecision(
        { project: "acme", kind: "approve", targets: ["BR-01"], decision: "approved" },
        deps,
      ),
    ).rejects.toThrow("BR-01 is not waiting for approval.");
    expect(github.commitFiles).not.toHaveBeenCalled();
  });

  it("writes a real APR and the approved BR with the S1 builder", async () => {
    const { deps, github } = setup();
    await recordDecision(
      {
        project: "acme",
        kind: "approve",
        targets: ["BR-01"],
        decision: "approved",
        versions: { "BR-01": 1 },
      },
      { ...deps, buildApproval: realBuildApproval },
    );
    expect(github.commitFiles).toHaveBeenCalledTimes(1);
    const { files } = (github.commitFiles.mock.calls[0] as unknown[])[0] as {
      files: { path: string; content: string }[];
    };
    const parsed = files.map((f) => parseRecord(f.content).header);
    const apr = parsed.find((h) => h.type === "approval")!;
    expect(apr).toMatchObject({ id: "APR-0002", approver: "SH-00", role: "delivery lead" });
    expect(apr.links?.approves).toEqual(["BR-01@1"]);
    const br = parsed.find((h) => h.id === "BR-01")!;
    expect(br).toMatchObject({ status: "approved", approval: "APR-0002", version: 1 });
  });

  it("refuses to confirm a claim that is not pending", async () => {
    const { deps, github } = setup();
    await expect(
      recordDecision(
        { project: "acme", kind: "confirm", targets: ["CLM-0001"], decision: "approved" },
        deps,
      ),
    ).rejects.toThrow("CLM-0001 is not pending confirmation.");
    expect(github.commitFiles).not.toHaveBeenCalled();
  });
});
