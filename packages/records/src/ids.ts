// Record IDs (design doc, "ID and trace schema", part 2; F-01 plan, K1).

/** Digits per prefix, as in the design doc's examples: SRC-001, CLM-0003, APR-0012, BR-01. */
export const ID_WIDTH: Readonly<Record<string, number>> = { SRC: 3, CLM: 4, APR: 4 };
const DEFAULT_WIDTH = 2;

/** The ID for a prefix and number, padded to the prefix's width. formatId("CLM", 3) is "CLM-0003". */
export function formatId(prefix: string, n: number): string {
  if (!/^[A-Z]+$/.test(prefix)) throw new Error(`Bad ID prefix: ${prefix}`);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Bad ID number: ${n}`);
  return `${prefix}-${String(n).padStart(ID_WIDTH[prefix] ?? DEFAULT_WIDTH, "0")}`;
}

export type ParsedRef = {
  project?: string;
  prefix: string;
  n: number;
  id: string;
  version?: number;
};

/** Splits a reference such as BR-01, ACME-OPS:BR-01 or BR-01@2. Returns undefined if it isn't one. */
export function parseRef(ref: string): ParsedRef | undefined {
  const m = /^(?:([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*):)?([A-Z]+)-(\d{2,})(?:@(\d+))?$/.exec(ref);
  if (!m) return undefined;
  const [, project, prefix, digits, version] = m;
  return {
    ...(project ? { project } : {}),
    prefix: prefix!,
    n: Number(digits),
    id: `${prefix}-${digits}`,
    ...(version ? { version: Number(version) } : {}),
  };
}
