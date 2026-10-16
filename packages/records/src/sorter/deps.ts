// The sorter's injection seam: the S1 functions it calls. The CLI passes the real ones; tests
// can pass fakes (e.g. an allocator that records its argument).
import type { AllocateOptions } from "../allocate";
import type { ProjectFiles, serializeRecord } from "../io";

export type Deps = {
  readProject(dir: string): Pick<ProjectFiles, "records">;
  serializeRecord: typeof serializeRecord;
  allocate(opts: AllocateOptions): Promise<string[]>;
};
