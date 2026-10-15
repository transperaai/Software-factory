import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildAll, refPattern } from "../src/build.ts";
import { PREFIXES, RECORDS, type RecordSpec } from "../src/definitions.ts";
import { RecordValidator, frontmatter } from "../src/validate.ts";

const schemaDir = fileURLToPath(new URL("../../../schemas/", import.meta.url));
const fixtureDir = fileURLToPath(new URL("./fixtures/valid/", import.meta.url));
const validator = new RecordValidator(schemaDir);

type Rec = Record<string, unknown> & { links?: Record<string, unknown> };

function fixture(spec: RecordSpec): Rec {
  if (spec.type === "source") return parseYaml(readFileSync(join(fixtureDir, "source.meta.yaml"), "utf8"));
  return frontmatter(readFileSync(join(fixtureDir, `${spec.type}.md`), "utf8")) as Rec;
}

function without(rec: Rec, name: string, isLink: boolean): Rec {
  const copy = structuredClone(rec);
  if (isLink) delete copy.links?.[name];
  else delete copy[name];
  return copy;
}

const GATED_STATUS_FOR_WORK = "open";

describe("generated schemas", () => {
  it("are up to date with definitions.ts", () => {
    const expected = buildAll();
    const onDisk = readdirSync(schemaDir).filter((f) => f.endsWith(".json"));
    expect(onDisk.sort()).toEqual(Object.keys(expected).sort());
    for (const [name, json] of Object.entries(expected)) {
      expect(readFileSync(join(schemaDir, name), "utf8"), name).toBe(`${JSON.stringify(json, null, 2)}\n`);
    }
  });

  it("cover every ID prefix in the trace schema", () => {
    const traceSchemaPrefixes = [
      "SRC", "CLM", "SH", "PP", "KPI", "BR", "PER", "TERM", "DEC", "RULE", "PROC", "UC", "APR",
      "US", "FR", "NFR", "WF", "ENT", "INT", "SL", "ADR", "THR", "SEC", "TC", "UAT", "DEF",
      "ISS", "CR", "TD", "REL",
    ];
    expect([...PREFIXES].sort()).toEqual(traceSchemaPrefixes.sort());
    expect(validator.types).toHaveLength(RECORDS.length);
  });

  it("accept the design doc's example IDs and refs", () => {
    const any = { targets: ["*"] };
    for (const ref of ["BR-01", "CLM-0003", "SRC-001", "APR-0012", "REL-1.0.1", "ACME-OPS:BR-01"]) {
      expect(new RegExp(refPattern(any)).test(ref), ref).toBe(true);
    }
    for (const bad of ["BR-1", "br-01", "XYZ-01", "BR-01 ", "acme:BR-01"]) {
      expect(new RegExp(refPattern(any)).test(bad), bad).toBe(false);
    }
  });
});

describe.each(RECORDS.map((spec) => [spec.prefix, spec] as const))("%s record", (_prefix, spec) => {
  const valid = fixture(spec);
  const linkNames = Object.keys(spec.links);
  const isLink = (n: string) => linkNames.includes(n);
  const gatedLinks = linkNames.filter((n) => spec.links[n]?.required);
  const gated = [...spec.required, ...gatedLinks];
  const always = spec.always ?? [];

  it("valid fixture passes", () => {
    expect(validator.validateData(valid)).toEqual([]);
  });

  it("fails with an ID of another type", () => {
    const other = spec.prefix === "BR" ? "FR-01" : "BR-01";
    expect(validator.validateData({ ...valid, id: other })).not.toEqual([]);
  });

  it.each(["id", "type", "title", "status", "version", "created_by"])("fails without %s", (field) => {
    expect(validator.validateData(without(valid, field, false))).not.toEqual([]);
  });

  it.each(gated.length > 0 ? gated : ["(none)"])("in review, fails without %s", (name) => {
    if (name === "(none)") return;
    const status = spec.statusSet === "work" ? GATED_STATUS_FOR_WORK : "review";
    const rec = { ...without(valid, name, isLink(name)), status };
    expect(validator.validateData(rec)).not.toEqual([]);
  });

  if (spec.statusSet === "lifecycle") {
    it("as a draft, needs only the base fields and the always-required ones", () => {
      const draft: Rec = { ...structuredClone(valid), status: "draft" };
      for (const name of gated.filter((n) => !always.includes(n))) {
        if (isLink(name)) delete draft.links?.[name];
        else delete draft[name];
      }
      expect(validator.validateData(draft)).toEqual([]);
    });
  }

  it.each(always.length > 0 ? always : ["(none)"])("as a draft, still fails without %s", (name) => {
    if (name === "(none)") return;
    const rec = { ...without(valid, name, isLink(name)), status: "draft" };
    expect(validator.validateData(rec)).not.toEqual([]);
  });

  it.each(linkNames.length > 0 ? linkNames : ["(none)"])("link %s rejects a wrong target type", (name) => {
    if (name === "(none)" || spec.links[name]!.targets.includes("*")) return;
    const wrong = spec.links[name]!.targets.includes("SH") ? "XYZ-01" : "SH-01";
    const rec = structuredClone(valid);
    rec.links = { ...rec.links, [name]: [wrong] };
    expect(validator.validateData(rec)).not.toEqual([]);
  });

  it("rejects an unknown link type", () => {
    const rec = structuredClone(valid);
    rec.links = { ...rec.links, related_to: ["BR-01"] };
    expect(validator.validateData(rec)).not.toEqual([]);
  });

  it("allows extra fields not named in the docs", () => {
    expect(validator.validateData({ ...valid, notes: "anything" })).toEqual([]);
  });
});

describe("BR and KPI link", () => {
  const kpi = RECORDS.find((r) => r.prefix === "KPI")!;
  const br = RECORDS.find((r) => r.prefix === "BR")!;

  it("is held by the BR as measured_by, because KPIs are set before BRs exist", () => {
    expect(validator.validateData(fixture(br))).toEqual([]);
    expect(fixture(br).links?.measured_by).toEqual(["KPI-02"]);
  });

  it("is rejected on the KPI", () => {
    const rec = structuredClone(fixture(kpi));
    rec.links = { ...rec.links, measures: ["BR-01"] };
    expect(validator.validateData(rec)).toContainEqual({
      path: "/links",
      message: "unknown property measures",
    });
  });
});

describe("project.yaml", () => {
  const project = parseYaml(readFileSync(join(fixtureDir, "project.yaml"), "utf8")) as Rec;

  it("valid fixture passes", () => {
    expect(validator.validateData(project, "project")).toEqual([]);
  });

  it.each(["key", "name", "client", "profile", "mode"])("fails without %s", (field) => {
    expect(validator.validateData(without(project, field, false), "project")).not.toEqual([]);
  });

  it("rejects an unknown profile", () => {
    expect(validator.validateData({ ...project, profile: "enterprise" }, "project")).not.toEqual([]);
  });
});

describe("validateFile", () => {
  it("reads Markdown headers and meta.yaml files", () => {
    expect(validator.validateFile(join(fixtureDir, "business_requirement.md")).ok).toBe(true);
    expect(validator.validateFile(join(fixtureDir, "source.meta.yaml")).ok).toBe(true);
  });

  it("reports a file with no header", () => {
    const result = validator.validateFile(fileURLToPath(new URL("./schemas.test.ts", import.meta.url)));
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toMatch(/no YAML header/);
  });

  it("reports an unknown record type", () => {
    expect(validator.validateData({ type: "memo" })).toEqual([
      { path: "/type", message: 'unknown record type "memo"' },
    ]);
  });
});
