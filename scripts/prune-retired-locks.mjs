import { lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactLockIdentity, machineIdentity } from "./artifact-lock.mjs";

// Age alone is unsafe: a suspended retire/recovery process can still rename a
// successor once its nonce tombstone disappears. A completed reboot proves all
// such processes are gone. Keep current-boot retirements, regardless of age.
//
// Housekeeping never blocks the run that carries it. A retirement this user
// cannot remove, such as one left behind by root, is listed in `skipped` and
// stays in place while the sweep carries on.
export function pruneRetiredLocks(lockDir, bootTime, now = Date.now(), machineId = machineIdentity(), remove = removeRetirement) {
  const result = { removed: 0, skipped: [] };
  if (!machineId || !Number.isFinite(bootTime) || bootTime > now) return result;
  const prefix = `${basename(lockDir)}.retired-`;
  for (const name of readdirSync(dirname(lockDir))) {
    const nonce = name.slice(prefix.length);
    if (!name.startsWith(prefix) || !/^[a-f0-9]{32}$/.test(nonce)) continue;
    const path = join(dirname(lockDir), name);
    try {
      if (!isPrunable(path, nonce, lockDir, bootTime, now, machineId)) continue;
      remove(path);
      result.removed++;
    } catch (error) {
      result.skipped.push({ path, code: errorCode(error) });
    }
  }
  return result;
}

function isPrunable(path, nonce, lockDir, bootTime, now, machineId) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mtimeMs >= Math.min(bootTime, now - 86400000)) return false;
  if (readdirSync(path).join() !== "owner") return false;
  const ownerPath = join(path, "owner");
  const file = lstatSync(ownerPath);
  if (!file.isFile() || file.isSymbolicLink() || file.mtimeMs >= bootTime) return false;
  let owner;
  try { owner = JSON.parse(readFileSync(ownerPath, "utf8")); } catch { return false; }
  return owner.version === 1 && owner.machineId === machineId && owner.lockPath === artifactLockIdentity(lockDir) && owner.nonce === nonce;
}

function removeRetirement(path) {
  unlinkSync(join(path, "owner"));
  rmdirSync(path);
}

function errorCode(error) {
  return error instanceof Error && typeof error.code === "string" ? error.code : String(error);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== "linux" || !process.argv[2]) throw new Error("usage on Linux: prune-retired-locks.mjs LOCK_DIR");
  const boot = Number(readFileSync("/proc/stat", "utf8").match(/^btime (\d+)$/m)?.[1]) * 1000;
  const { removed, skipped } = pruneRetiredLocks(process.argv[2], boot);
  for (const { path, code } of skipped) console.warn(`Skipped ${path}: ${code}. Remove it by hand.`);
  console.log(`Pruned ${removed} retirements from previous boots.`);
}
