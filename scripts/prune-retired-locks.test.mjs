import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactLockIdentity } from "./artifact-lock.mjs";
import { pruneRetiredLocks } from "./prune-retired-locks.mjs";

const root = mkdtempSync(join(tmpdir(), "retirement-prune-"));
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
  assert.equal(pruneRetiredLocks(lock, boot, now, machineId), 1);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(foreign), true);
  assert.equal(existsSync(current), true);
  assert.equal(existsSync(lock), true);
  // Passing another day does not make a current-boot tombstone safe to delete.
  assert.equal(pruneRetiredLocks(lock, boot, now + 2 * 86400000, machineId), 0);
} finally { rmSync(root, { recursive: true, force: true }); }
console.log("retirement pruning: OK");
