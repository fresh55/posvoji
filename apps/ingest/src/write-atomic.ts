import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";

// A half-written manifest or image is worse than a stale one: the next run
// can sweep files it should have kept, and the web server can publish corrupt
// bytes. Writing beside the target and renaming over it leaves a reader on one
// whole version or the other, whatever happens in between.
//
// renameSync over an existing file works on Windows as well, as long as the
// target is not held open by another process. Nothing in this pipeline keeps
// a handle on a published file.
export function writeFileAtomic(
  path: string,
  data: string | NodeJS.ArrayBufferView,
): void {
  // A scheduled run and a manual run can overlap. A fixed `${path}.tmp`
  // lets them rename or overwrite each other's staging file, so a random name
  // makes each sibling private to the writer (including after process restarts).
  const tmp = `${path}.${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (error) {
    // A failed write or rename must not leave a staging file that looks like
    // real cache state to directory sweeps or a later operator.
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Preserve the write/rename error, which is the actionable failure.
    }
    throw error;
  }
}
