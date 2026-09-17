import { randomUUID } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

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

// The staging name in one place, so a directory that checks its own contents
// by name can recognise a sibling of a write in progress instead of
// re-deriving the convention and drifting from it.
const STAGING =
  /^.+\.\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;

// True for exactly the file names `writeFileAtomic` stages beside its target.
export function isStagingFile(name: string): boolean {
  return STAGING.test(name);
}

// Removes the staging files left in `dir` by runs that died between the write
// and the rename, and returns how many it removed.
//
// Deleting them is safe where the caller holds the artifact lock: no sibling
// export can be mid-write in these directories, so a name matching the staging
// pattern belongs to a process that is already gone. Without the lock a live
// writer's sibling could be taken out from under it, so do not sweep there.
export function sweepStagingFiles(dir: string): number {
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!isStagingFile(name)) continue;
    const path = join(dir, name);
    // A directory or a link wearing the name is not ours to delete. Leave it
    // for the caller's own checks to refuse. One lstat answers both: it does
    // not follow the link, so a link never reports itself as a file.
    if (!lstatSync(path).isFile()) continue;
    // The entry can be gone between the readdir and here, swept by an operator
    // or by whoever else is cleaning up after the same dead run.
    rmSync(path, { force: true });
    removed++;
  }
  return removed;
}
