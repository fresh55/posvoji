import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactLockIdentity } from "./artifact-lock.mjs";
import { pruneRetiredLocks } from "./prune-retired-locks.mjs";

const root = mkdtempSync(join(tmpdir(), "retirement-prune-"));
const readOnly = [];
try {
  const lock = join(root, ".artifact-lock");
  const now = Date.parse("2026-09-06T00:00:00Z");
  const boot = now - 3600000;
  const machineId = "a".repeat(64);
  const retired = (nonce, at, extra = {}) => {
    const dir = `${lock}.retired-${nonce}`;
    mkdirSync(dir);
    writeFileSync(join(dir, "owner"), JSON.stringify({ version: 1, nonce, machineId, lockPath: artifactLockIdentity(lock), ...extra }));
    utimesSync(join(dir, "owner"), at / 1000, at / 1000);
    utimesSync(dir, at / 1000, at / 1000);
    return dir;
  };
  const old = retired("b".repeat(32), now - 3 * 86400000);
  const foreign = retired("c".repeat(32), now - 3 * 86400000, { machineId: "d".repeat(64) });
  const current = retired("e".repeat(32), now - 1800000);
  mkdirSync(lock);
  assert.deepEqual(pruneRetiredLocks(lock, boot, now, machineId), { removed: 1, skipped: [] });
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(foreign), true);
  assert.equal(existsSync(current), true);
  assert.equal(existsSync(lock), true);
  // Passing another day does not make a current-boot tombstone safe to delete.
  assert.deepEqual(pruneRetiredLocks(lock, boot, now + 2 * 86400000, machineId), { removed: 0, skipped: [] });

  // One retirement that cannot be removed is reported and does not stop the sweep.
  const stuck = retired("f".repeat(32), now - 3 * 86400000);
  const other = retired("1".repeat(32), now - 3 * 86400000);
  const denied = (path) => {
    if (path === stuck) throw Object.assign(new Error("denied"), { code: "EACCES" });
    unlinkSync(join(path, "owner"));
    rmdirSync(path);
  };
  assert.deepEqual(pruneRetiredLocks(lock, boot, now, machineId, denied), { removed: 1, skipped: [{ path: stuck, code: "EACCES" }] });
  assert.equal(existsSync(stuck), true);
  assert.equal(existsSync(other), false);
  rmSync(stuck, { recursive: true });

  // The production case: a retirement whose directory this user cannot write,
  // as root leaves behind. Root itself can unlink anything, so skip there.
  if (process.platform === "linux" && process.getuid() !== 0) {
    const sealed = retired("9".repeat(32), now - 3 * 86400000);
    chmodSync(sealed, 0o555);
    readOnly.push(sealed);
    assert.deepEqual(pruneRetiredLocks(lock, boot, now, machineId), { removed: 0, skipped: [{ path: sealed, code: "EACCES" }] });
    assert.equal(existsSync(join(sealed, "owner")), true);
  }
} finally {
  for (const dir of readOnly) chmodSync(dir, 0o755);
  rmSync(root, { recursive: true, force: true });
}
console.log("retirement pruning: OK");
