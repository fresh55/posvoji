import { existsSync } from "node:fs";
import { writeFileAtomic } from "./write-atomic";

// Both caches name a processed file after its own bytes, so two different
// sources can encode to the same target: two shelters sharing a logo, or one
// photo published on two sites. Now that hosts are fetched at the same time,
// those two can arrive together.
//
// Two synchronous writes cannot interleave inside one process, but a second
// ingest run against the same directory can be halfway through writing the
// very file this run is about to read. Writing beside the target under a
// unique name and renaming over it leaves every reader on one whole file or
// on none. The shared atomic writer provides that publication step; this
// wrapper only adds the content-addressed "already exists" race semantics.
export function writeContentAddressed(target: string, data: Buffer): void {
  if (existsSync(target)) return;
  try {
    writeFileAtomic(target, data);
  } catch (error) {
    // Windows refuses to rename over a file another process holds open. The
    // name is a hash of the bytes, so what is already there is what we were
    // writing: drop our copy and keep it. Anything else is a real failure and
    // is raised.
    if (!existsSync(target)) throw error;
  }
}
