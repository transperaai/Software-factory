// Local copy of the S1 signatures the sorter calls (packages/records/src/{io,allocate}.ts).
// The CLI passes in the real functions; tests pass offline ones.
import type { RecordHeader } from "../contracts";

export type ProjectRecord = { path: string; header: RecordHeader; body: string };

export type Deps = {
  readProject(dir: string): {
    records: Map<string, ProjectRecord>;
    duplicates: unknown[];
  };
  serializeRecord(header: RecordHeader, body: string): string;
  allocate(opts: {
    project: string;
    prefix: string;
    count: number;
    dir: string;
  }): Promise<string[]>;
};
