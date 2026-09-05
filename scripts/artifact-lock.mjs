import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ARTIFACT_LOCK_VERSION = 1;

const NONCE = /^[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errno(error, code) {
  return error && typeof error === "object" && error.code === code;
}

function normalizedHost(value) {
  return value.trim().toLowerCase();
}

function digestIdentity(value) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

/** A stable machine identity; null disables automatic cross-run recovery. */
export function machineIdentity() {
  if (process.platform === "linux") {
    try {
      const value = readFileSync("/etc/machine-id", "utf8").trim();
      return value ? digestIdentity(value) : null;
    } catch {
      return null;
    }
  }
  if (process.platform === "win32") {
    try {
      const command =
        "[Console]::Out.Write((Get-ItemProperty " +
        "-LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' " +
        "-Name MachineGuid).MachineGuid)";
      const value = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", command],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5_000,
          windowsHide: true,
        },
      ).trim();
      return value ? digestIdentity(value) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Identify the lock without resolving the lock itself. Resolving only its
 * existing parent makes a copied lock name the checkout where it was made,
 * while still treating two spellings of a symlinked parent as one checkout.
 */
export function artifactLockIdentity(lockDir) {
  const absolute = resolve(lockDir);
  let parent = dirname(absolute);
  try {
    parent = realpathSync.native(parent);
  } catch {
    // A missing parent will make acquisition fail. Keeping the absolute path
    // here gives that failure a useful identity without guessing a target.
  }
  const identity = join(parent, basename(absolute));
  return process.platform === "win32" ? identity.toLowerCase() : identity;
}

function fallbackProcessProbe(pid) {
  try {
    process.kill(pid, 0);
    return { state: "running" };
  } catch (error) {
    if (errno(error, "ESRCH")) return { state: "absent" };
    // EPERM proves that a process occupies the pid even though this account
    // cannot signal it. Any other platform-specific answer is not proof that
    // the recorded owner is gone.
    if (errno(error, "EPERM")) return { state: "running" };
    return { state: "unknown" };
  }
}

function linuxProcessProbe(pid) {
  try {
    // Field 22 is the process start tick after boot. The second field is in
    // parentheses and may contain spaces or parentheses, so split only after
    // its final closing parenthesis. Pairing pid and start tick distinguishes
    // a recycled pid without relying on wall-clock precision.
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const endOfName = stat.lastIndexOf(")");
    const fields = stat.slice(endOfName + 2).trim().split(/\s+/);
    const startTick = fields[19];
    if (endOfName < 0 || !/^\d+$/.test(startTick ?? "")) {
      return { state: "unknown" };
    }
    let boot = "unknown-boot";
    try {
      boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    } catch {
      // Start tick alone is still enough to fail safely on this boot. Across a
      // reboot a collision becomes a false live owner, never a stolen lock.
    }
    return {
      state: "running",
      identity: `linux-boot:${boot}:start-tick:${startTick}`,
    };
  } catch (error) {
    if (errno(error, "ENOENT") || errno(error, "ESRCH")) {
      return { state: "absent" };
    }
    return fallbackProcessProbe(pid);
  }
}

function windowsProcessProbe(pid) {
  const command = [
    `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'`,
    "if ($null -eq $p) { exit 3 }",
    "[Console]::Out.Write($p.CreationDate.ToUniversalTime().Ticks.ToString())",
  ].join("; ");
  try {
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000,
        windowsHide: true,
      },
    ).trim();
    if (!/^\d+$/.test(output)) return { state: "unknown" };
    return { state: "running", identity: `windows-created-ticks:${output}` };
  } catch (error) {
    if (error && typeof error === "object" && error.status === 3) {
      return { state: "absent" };
    }
    return fallbackProcessProbe(pid);
  }
}

export function probeProcess(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { state: "unknown" };
  if (process.platform === "linux") return linuxProcessProbe(pid);
  if (process.platform === "win32") return windowsProcessProbe(pid);
  // On platforms without a strong, queryable birth identity, a live pid is
  // deliberately treated as the owner. This can delay recovery after pid
  // reuse, but can never steal a lock from an unrelated live process.
  return fallbackProcessProbe(pid);
}

function runtimeFrom(overrides = {}) {
  return {
    host: normalizedHost(overrides.host ?? hostname()),
    machineId:
      overrides.machineId === undefined
        ? machineIdentity()
        : overrides.machineId,
    now: overrides.now ?? (() => new Date()),
    nonce:
      overrides.nonce ?? (() => randomBytes(16).toString("hex")),
    probe: overrides.probe ?? probeProcess,
  };
}

function parseOwner(raw, lockDir) {
  let owner;
  try {
    owner = JSON.parse(raw);
  } catch {
    throw new Error(
      `artifact lock at ${lockDir} has a legacy or malformed owner; ` +
        "verify no ingest/deploy process is running before manual recovery",
    );
  }
  if (
    !isRecord(owner) ||
    owner.version !== ARTIFACT_LOCK_VERSION ||
    typeof owner.activity !== "string" ||
    owner.activity.length === 0 ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.host !== "string" ||
    owner.host.length === 0 ||
    !(
      owner.machineId === null ||
      (typeof owner.machineId === "string" && SHA256.test(owner.machineId))
    ) ||
    typeof owner.lockPath !== "string" ||
    owner.lockPath.length === 0 ||
    !NONCE.test(owner.nonce ?? "") ||
    typeof owner.acquiredAt !== "string" ||
    Number.isNaN(Date.parse(owner.acquiredAt)) ||
    !(
      owner.processIdentity === null ||
      typeof owner.processIdentity === "string"
    )
  ) {
    throw new Error(
      `artifact lock at ${lockDir} has a malformed owner; ` +
        "verify no ingest/deploy process is running before manual recovery",
    );
  }
  return owner;
}

function readOwner(lockDir) {
  let lockStat;
  try {
    lockStat = lstatSync(lockDir);
  } catch (error) {
    throw new Error(`artifact lock at ${lockDir} is not readable: ${error.message}`);
  }
  if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) {
    let target = "";
    try {
      target = ` -> ${readlinkSync(lockDir)}`;
    } catch {
      // Not a symlink, or an unreadable one. Its type is enough to fail closed.
    }
    throw new Error(
      `artifact lock at ${lockDir}${target} is not a real directory; ` +
        "refusing automatic recovery",
    );
  }

  const path = join(lockDir, "owner");
  let stat;
  let raw;
  try {
    stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
      throw new Error("owner is not a nonempty regular file");
    }
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `artifact lock at ${lockDir} has no trustworthy owner (${error.message}); ` +
        "verify no ingest/deploy process is running before manual recovery",
    );
  }
  return { raw, owner: parseOwner(raw, lockDir) };
}

function describeOwner(owner) {
  return `${owner.activity} pid ${owner.pid} on ${owner.host} ` +
    `(since ${owner.acquiredAt})`;
}

function staleDecision(owner, lockDir, runtime) {
  const expectedPath = artifactLockIdentity(lockDir);
  if (normalizedHost(owner.host) !== runtime.host) {
    return {
      stale: false,
      why: `owner is on host ${owner.host}, not ${runtime.host}`,
    };
  }
  if (owner.machineId === null || runtime.machineId === null) {
    return {
      stale: false,
      why: "stable machine identity is unavailable",
    };
  }
  if (owner.machineId !== runtime.machineId) {
    return {
      stale: false,
      why: "owner belongs to a different machine",
    };
  }
  if (owner.lockPath !== expectedPath) {
    return {
      stale: false,
      why: `owner belongs to checkout lock ${owner.lockPath}, not ${expectedPath}`,
    };
  }

  const current = runtime.probe(owner.pid);
  if (current.state === "absent") {
    return { stale: true, why: "owner process is absent" };
  }
  if (
    current.state === "running" &&
    owner.processIdentity !== null &&
    typeof current.identity === "string" &&
    current.identity !== owner.processIdentity
  ) {
    return { stale: true, why: "pid has been reused by a different process" };
  }
  if (current.state === "running") {
    return { stale: false, why: "owner process is still running" };
  }
  return { stale: false, why: "owner process liveness is unknown" };
}

function cleanCandidate(candidate) {
  try {
    unlinkSync(join(candidate, "owner"));
  } catch {
    // The candidate may already have been renamed into place.
  }
  try {
    rmdirSync(candidate);
  } catch {
    // An unexpected entry keeps the candidate visible for inspection.
  }
}

function makeOwner({ activity, holderPid, lockDir, runtime, nonce }) {
  const holder = runtime.probe(holderPid);
  if (holder.state === "absent") {
    throw new Error(`artifact-lock holder pid ${holderPid} is not running`);
  }
  return {
    version: ARTIFACT_LOCK_VERSION,
    activity,
    pid: holderPid,
    host: runtime.host,
    machineId: runtime.machineId,
    lockPath: artifactLockIdentity(lockDir),
    processIdentity:
      holder.state === "running" && typeof holder.identity === "string"
        ? holder.identity
        : null,
    nonce,
    acquiredAt: runtime.now().toISOString(),
  };
}

function prepareOwnedDirectory(path, owner) {
  mkdirSync(path);
  try {
    writeFileSync(join(path, "owner"), `${JSON.stringify(owner)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    cleanCandidate(path);
    throw error;
  }
}

/**
 * Atomically retire one exact owner to a deterministic, nonce-scoped path.
 * Release and recovery deliberately use the same path, and it is retained:
 * if either operation is delayed while a successor acquires the canonical
 * name, its rename finds the retirement path occupied and cannot move the
 * successor (the release-vs-recovery ABA race).
 *
 * A hard kill at any point is also safe. Before the rename the original lock
 * remains recoverable; after it, the canonical path is free for the next run.
 */
function retireArtifactLock(lockDir, expected) {
  const current = readOwner(lockDir);
  if (current.raw !== expected.raw) {
    throw new Error(
      `artifact-lock owner changed before retirement at ${lockDir}; refusing to move it`,
    );
  }
  const retired = `${lockDir}.retired-${expected.owner.nonce}`;
  // POSIX rename can replace an empty destination directory; Windows refuses
  // it. An existing retirement is always evidence to stop, even if an
  // operator or an interrupted older implementation left it empty. Real
  // concurrent retirements contain the owner file, so rename also refuses
  // them atomically after this check.
  if (existsSync(retired)) {
    throw new Error(
      `artifact-lock retirement already exists for ${expected.owner.nonce}; ` +
        "refusing to move a possibly replaced successor",
    );
  }
  try {
    renameSync(lockDir, retired);
  } catch (error) {
    if (!existsSync(lockDir)) return false;
    if (existsSync(retired)) {
      throw new Error(
        `artifact-lock retirement already exists for ${expected.owner.nonce}; ` +
          "refusing to move a possibly replaced successor",
      );
    }
    throw error;
  }

  return true;
}

function recoverStaleLock(lockDir, runtime) {
  const first = readOwner(lockDir);
  const decision = staleDecision(first.owner, lockDir, runtime);
  if (!decision.stale) {
    throw new Error(
      `generated artifacts are locked by ${describeOwner(first.owner)} at ` +
        `${lockDir}; ${decision.why}`,
    );
  }

  const second = readOwner(lockDir);
  if (second.raw !== first.raw) {
    throw new Error(
      `artifact-lock owner changed during recovery at ${lockDir}; refusing to steal it`,
    );
  }
  const confirmed = staleDecision(second.owner, lockDir, runtime);
  if (!confirmed.stale) {
    throw new Error(
      `artifact-lock owner became live during recovery at ${lockDir}; ` +
        "refusing to steal it",
    );
  }
  return retireArtifactLock(lockDir, second);
}

/** Acquire the checkout-wide generated-artifact lock. */
export function acquireArtifactLock({
  activity,
  lockDir,
  holderPid = process.pid,
  runtime: runtimeOverrides,
}) {
  if (typeof activity !== "string" || activity.trim().length === 0) {
    throw new Error("artifact-lock activity must be a nonempty string");
  }
  const runtime = runtimeFrom(runtimeOverrides);
  const nonce = runtime.nonce();
  if (!NONCE.test(nonce)) {
    throw new Error("artifact-lock runtime produced an invalid nonce");
  }
  const owner = makeOwner({
    activity: activity.trim(),
    holderPid,
    lockDir,
    runtime,
    nonce,
  });
  const candidate = `${lockDir}.candidate-${process.pid}-${nonce}`;
  try {
    prepareOwnedDirectory(candidate, owner);

    for (;;) {
      try {
        renameSync(candidate, lockDir);
        return { token: nonce, owner };
      } catch (error) {
        if (!existsSync(lockDir)) throw error;
        recoverStaleLock(lockDir, runtime);
      }
    }
  } finally {
    cleanCandidate(candidate);
  }
}

/** Release only the exact lock returned by acquireArtifactLock. */
export function releaseArtifactLock({ lockDir, token }) {
  const first = readOwner(lockDir);
  const { owner } = first;
  if (owner.nonce !== token) {
    throw new Error(
      `refusing to release artifact lock owned by ${describeOwner(owner)}; ` +
        "the release token does not match",
    );
  }
  retireArtifactLock(lockDir, first);
}

function cli() {
  const [command, lockDir, value, tokenFile] = process.argv.slice(2);
  if (command === "acquire" && lockDir && value && tokenFile) {
    const acquired = acquireArtifactLock({
      activity: value,
      lockDir,
      // The helper is invoked directly (not through command substitution), so
      // its parent is the shell that holds the deploy lock.
      holderPid: process.ppid,
    });
    try {
      writeFileSync(tokenFile, `${acquired.token}\n`, { encoding: "utf8" });
    } catch (error) {
      try {
        releaseArtifactLock({ lockDir, token: acquired.token });
      } catch {
        // Report the token-file failure; a failed rollback remains visible.
      }
      throw error;
    }
    return;
  }
  if (command === "release" && lockDir && value && tokenFile === undefined) {
    releaseArtifactLock({ lockDir, token: value });
    return;
  }
  throw new Error(
    "usage: artifact-lock.mjs acquire LOCK_DIR ACTIVITY TOKEN_FILE | " +
      "release LOCK_DIR TOKEN",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  try {
    cli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
