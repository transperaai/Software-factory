import {
  GATED_STATUSES,
  LIFECYCLE_STATUSES,
  PREFIXES,
  RECORDS,
  WORK_STATUSES,
  type Json,
  type LinkSpec,
  type RecordSpec,
} from "./definitions.ts";
import { buildBaProposalSchema, buildIntakeProposalSchema } from "./proposals.ts";

export const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** Optional cross-project qualifier, e.g. ACME-OPS:BR-01. */
const PROJECT_QUALIFIER = "(?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*:)?";

function idBody(prefix: string): string {
  return prefix === "REL" ? "REL-\\d+\\.\\d+(?:\\.\\d+)?" : `${prefix}-\\d{2,}`;
}

export function idPattern(spec: RecordSpec): string {
  return spec.idPattern ?? `^${idBody(spec.prefix)}$`;
}

export function refPattern(link: LinkSpec): string {
  const prefixes = link.targets.includes("*") ? PREFIXES : link.targets;
  const options = prefixes.map(idBody);
  if (link.allowAcRef) options.push("US-\\d{2,}#AC\\d+");
  const ids = `${PROJECT_QUALIFIER}(?:${options.join("|")})`;
  const pr = link.allowPr ? "|PR-\\d+" : "";
  const version = link.withVersion ? "@\\d+" : "";
  return `^(?:${ids}${version}${pr})$`;
}

const text = { type: "string", minLength: 1 };

function linkSchema(link: LinkSpec): Json {
  return {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: { type: "string", pattern: refPattern(link) },
  };
}

export function buildRecordSchema(spec: RecordSpec): Json {
  const linkNames = Object.keys(spec.links);
  const always = spec.always ?? [];
  const isLink = (name: string) => linkNames.includes(name);

  const gatedFields = spec.required.filter((n) => !isLink(n));
  const gatedLinks = linkNames.filter((n) => spec.links[n]?.required);
  const alwaysFields = always.filter((n) => !isLink(n));
  const alwaysLinks = always.filter(isLink);

  const properties: Json = {
    id: { type: "string", pattern: idPattern(spec) },
    type: { const: spec.type },
    title: text,
    status: { enum: spec.statusSet === "work" ? WORK_STATUSES : LIFECYCLE_STATUSES },
    version: { type: "integer", minimum: 1 },
    created_by: { type: "string", pattern: "^(?:agent|human|script):[a-z0-9][a-z0-9-]*$" },
    approval: { type: "string", pattern: `^${idBody("APR")}$` },
    ...spec.fields,
  };
  // Link types are a closed set: an unknown name is almost always a typo.
  properties.links = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(linkNames.map((n) => [n, linkSchema(spec.links[n]!)])),
    ...(alwaysLinks.length > 0 ? { required: alwaysLinks } : {}),
  };

  const baseRequired = ["id", "type", "title", "status", "version", "created_by"];
  const topRequired = [...baseRequired, ...alwaysFields];
  if (alwaysLinks.length > 0) topRequired.push("links");

  const gate: Json = {
    required: [...gatedFields, ...(gatedLinks.length > 0 ? ["links"] : [])],
    ...(gatedLinks.length > 0
      ? { properties: { links: { type: "object", required: gatedLinks } } }
      : {}),
  };

  const schema: Json = {
    $schema: SCHEMA_DIALECT,
    $id: `urn:factory:schema:${spec.type}`,
    title: `${spec.prefix}: ${spec.type}`,
    description: spec.description,
    type: "object",
    required: unique(topRequired),
    properties,
    $defs: { ref_SH: { type: "string", pattern: `^${PROJECT_QUALIFIER}${idBody("SH")}$` } },
  };

  // Minimum standard: lifecycle records need it from review onward ("Missing blocks the gate").
  // Work items (defects, issues, findings) need it from the moment they are opened.
  if (spec.statusSet === "work") {
    schema.required = unique([...(schema.required as string[]), ...(gate.required as string[])]);
    if (gate.properties) schema.allOf = [{ properties: gate.properties }];
  } else {
    schema.allOf = [
      {
        if: {
          type: "object",
          properties: { status: { enum: GATED_STATUSES } },
          required: ["status"],
        },
        then: gate,
      },
    ];
  }
  return schema;
}

export function buildProjectSchema(): Json {
  return {
    $schema: SCHEMA_DIALECT,
    $id: "urn:factory:schema:project",
    title: "project.yaml",
    description: "Project settings: client, profile, mode, region, security level, adapter, kit, approvers.",
    type: "object",
    required: ["key", "name", "client", "profile", "mode"],
    properties: {
      key: { type: "string", pattern: "^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$" },
      name: text,
      client: text,
      profile: { enum: ["lite", "client", "saas", "headless"] },
      mode: { enum: ["handover", "operate"] },
      region: text,
      security_level: { enum: ["L1", "L2", "L3"] },
      adapter: text,
      kit: text,
      approvers: {
        type: "array",
        items: {
          type: "object",
          required: ["stakeholder", "gate"],
          properties: {
            stakeholder: { type: "string", pattern: `^${idBody("SH")}$` },
            gate: text,
          },
        },
      },
    },
  };
}

export type SchemaIndex = Record<string, { type: string; schema: string; folder: string | null }>;

export function buildIndex(): SchemaIndex {
  return Object.fromEntries(
    RECORDS.map((r) => [r.prefix, { type: r.type, schema: schemaFileName(r.type), folder: r.folder }]),
  );
}

export function schemaFileName(type: string): string {
  return `${type}.schema.json`;
}

/** Every generated file, keyed by file name. */
export function buildAll(): Record<string, Json> {
  const files: Record<string, Json> = {};
  for (const spec of RECORDS) files[schemaFileName(spec.type)] = buildRecordSchema(spec);
  files[schemaFileName("project")] = buildProjectSchema();
  files["index.json"] = buildIndex();
  files["intake-proposal.schema.json"] = buildIntakeProposalSchema();
  files["ba-proposal.schema.json"] = buildBaProposalSchema();
  return files;
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}
