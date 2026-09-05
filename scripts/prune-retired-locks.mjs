import { lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactLockIdentity, machineIdentity } from "./artifact-lock.mjs";

// Age alone is unsafe: a suspended retire/recovery process can still rename a
// successor once its nonce tombstone disappears. A completed reboot proves all
// such processes are gone. Keep current-boot retirements, regardless of age.
export function pruneRetiredLocks(lockDir, bootTime, now = Date.now(), machineId = machineIdentity()) {
  if (!machineId || !Number.isFinite(bootTime) || bootTime > now) return 0;
  const prefix = `${basename(lockDir)}.retired-`;
  let removed = 0;
  for (const name of readdirSync(dirname(lockDir))) {
    if (!name.startsWith(prefix) || !/^[a-f0-9]{32}$/.test(name.slice(prefix.length))) continue;
    const path = join(dirname(lockDir), name);
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mtimeMs >= Math.min(bootTime, now - 86400000)) continue;
    if (readdirSync(path).join() !== "owner") continue;
    const ownerPath = join(path, "owner");
    const file = lstatSync(ownerPath);
    if (!file.isFile() || file.isSymbolicLink() || file.mtimeMs >= bootTime) continue;
    let owner;
    try { owner = JSON.parse(readFileSync(ownerPath, "utf8")); } catch { continue; }
    if (owner.version !== 1 || owner.machineId !== machineId || owner.lockPath !== artifactLockIdentity(lockDir) || owner.nonce !== name.slice(prefix.length)) continue;
    unlinkSync(ownerPath);
    rmdirSync(path);
    removed++;
  }
  return removed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== "linux" || !process.argv[2]) throw new Error("usage on Linux: prune-retired-locks.mjs LOCK_DIR");
  const boot = Number(readFileSync("/proc/stat", "utf8").match(/^btime (\d+)$/m)?.[1]) * 1000;
  console.log(`Pruned ${pruneRetiredLocks(process.argv[2], boot)} retirements from previous boots.`);
}
