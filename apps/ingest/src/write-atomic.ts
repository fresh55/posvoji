import { renameSync, writeFileSync } from "node:fs";

// A half-written manifest is worse than a stale one: the next run reads it,
// finds nothing usable and sweeps files it should have kept. Writing beside
// the target and renaming over it leaves a reader on one whole version or the
// other, whatever happens in between.
//
// renameSync over an existing file works on Windows as well, as long as the
// target is not held open by another process. It is not: nothing in this
// pipeline keeps a handle on a manifest.
export function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
