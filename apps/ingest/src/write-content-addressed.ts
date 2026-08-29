import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";

// Names the temporary copy below. A counter is enough inside one process and
// the pid keeps two runs against the same directory apart.
let nextTempId = 0;

// Both caches name a processed file after its own bytes, so two different
// sources can encode to the same target: two shelters sharing a logo, or one
// photo published on two sites. Now that hosts are fetched at the same time,
// those two can arrive together.
//
// Two synchronous writes cannot interleave inside one process, but a second
// ingest run against the same directory can be halfway through writing the
// very file this run is about to read. Writing beside the target under a
// unique name and renaming over it leaves every reader on one whole file or
// on none. Same reasoning as write-atomic.ts, for bytes rather than text and
// for a file that may already exist.
export function writeContentAddressed(target: string, data: Buffer): void {
  if (existsSync(target)) return;
  const tmp = `${target}.${process.pid}-${nextTempId++}.tmp`;
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, target);
  } catch (error) {
    // Windows refuses to rename over a file another process holds open. The
    // name is a hash of the bytes, so what is already there is what we were
    // writing: drop our copy and keep it. Anything else is a real failure and
    // is raised.
    try {
      rmSync(tmp, { force: true });
    } catch {
      // The deletion sweep at the end of the run collects it, since nothing
      // references it.
    }
    if (!existsSync(target)) throw error;
  }
}
