import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireArtifactLock,
  releaseArtifactLock,
  type ArtifactLockRuntime,
} from "../../../scripts/artifact-lock.mjs";
import { withArtifactLock } from "./artifact-lock";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryLock(): { root: string; lock: string } {
  const root = mkdtempSync(join(tmpdir(), "posvoji-artifact-lock-"));
  roots.push(root);
  return { root, lock: join(root, "lock") };
}

function runtime(
  processStates: Record<
    number,
    { state: "running" | "absent" | "unknown"; identity?: string }
  >,
  {
    host = "test-host",
    machineId = "1".repeat(64),
    nonce = "a",
  }: { host?: string; machineId?: string | null; nonce?: string } = {},
): ArtifactLockRuntime {
  let nextNonce = nonce.charCodeAt(0);
  return {
    host,
    machineId,
    now: () => new Date("2026-09-02T00:00:00.000Z"),
    nonce: () => String.fromCharCode(nextNonce++).repeat(32),
    probe: (pid) => processStates[pid] ?? { state: "unknown" },
  };
}

describe("generated artifact lock", () => {
  it("excludes a second writer and names the owner", async () => {
    const { lock } = temporaryLock();
    let unblock!: () => void;
    const first = withArtifactLock(
      "first",
      () => new Promise<void>((resolve) => (unblock = resolve)),
      lock,
    );

    await expect(
      withArtifactLock("second", async () => undefined, lock),
    ).rejects.toThrow(/locked by first pid/);
    expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8"))).toMatchObject({
      activity: "first",
      pid: process.pid,
    });

    unblock();
    await first;
    expect(existsSync(lock)).toBe(false);
  });

  it("releases after a failed run", async () => {
    const { lock } = temporaryLock();
    await expect(
      withArtifactLock(
        "failure",
        async () => {
          throw new Error("failed");
        },
        lock,
      ),
    ).rejects.toThrow("failed");

    await expect(
      withArtifactLock("retry", async () => "ok", lock),
    ).resolves.toBe("ok");
  });

  it("recovers an abandoned lock only after proving its owner absent", () => {
    const { lock } = temporaryLock();
    acquireArtifactLock({
      activity: "abandoned",
      lockDir: lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "old" } }),
    });

    const acquired = acquireArtifactLock({
      activity: "replacement",
      lockDir: lock,
      holderPid: 202,
      runtime: runtime(
        {
          101: { state: "absent" },
          202: { state: "running", identity: "replacement" },
        },
        { nonce: "c" },
      ),
    });
    expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8"))).toMatchObject({
      activity: "replacement",
      pid: 202,
    });
    releaseArtifactLock({ lockDir: lock, token: acquired.token });
    expect(existsSync(`${lock}.retired-${"a".repeat(32)}`)).toBe(true);
  });

  it("never steals from a live owner, even when the lock is old", () => {
    const { lock } = temporaryLock();
    const first = acquireArtifactLock({
      activity: "long-run",
      lockDir: lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "birth-a" } }),
    });

    expect(() =>
      acquireArtifactLock({
        activity: "contender",
        lockDir: lock,
        holderPid: 202,
        runtime: runtime(
          {
            101: { state: "running", identity: "birth-a" },
            202: { state: "running", identity: "birth-b" },
          },
          { nonce: "c" },
        ),
      }),
    ).toThrow(/owner process is still running/);
    releaseArtifactLock({ lockDir: lock, token: first.token });
  });

  it("distinguishes a recycled pid by its process birth identity", () => {
    const { lock } = temporaryLock();
    acquireArtifactLock({
      activity: "dead-owner",
      lockDir: lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "birth-a" } }),
    });

    const replacement = acquireArtifactLock({
      activity: "after-pid-reuse",
      lockDir: lock,
      holderPid: 202,
      runtime: runtime(
        {
          101: { state: "running", identity: "birth-reused" },
          202: { state: "running", identity: "birth-b" },
        },
        { nonce: "c" },
      ),
    });
    expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).activity).toBe(
      "after-pid-reuse",
    );
    releaseArtifactLock({ lockDir: lock, token: replacement.token });
  });

  it("fails closed for a lock copied from another host or checkout", () => {
    const firstPaths = temporaryLock();
    const first = acquireArtifactLock({
      activity: "elsewhere",
      lockDir: firstPaths.lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "birth-a" } }),
    });

    expect(() =>
      acquireArtifactLock({
        activity: "other-host",
        lockDir: firstPaths.lock,
        holderPid: 202,
        runtime: runtime(
          {
            101: { state: "absent" },
            202: { state: "running", identity: "birth-b" },
          },
          { host: "different-host", nonce: "c" },
        ),
      }),
    ).toThrow(/owner is on host test-host/);

    expect(() =>
      acquireArtifactLock({
        activity: "same-name-other-machine",
        lockDir: firstPaths.lock,
        holderPid: 202,
        runtime: runtime(
          {
            101: { state: "absent" },
            202: { state: "running", identity: "birth-b" },
          },
          { machineId: "2".repeat(64), nonce: "c" },
        ),
      }),
    ).toThrow(/owner belongs to a different machine/);
    releaseArtifactLock({ lockDir: firstPaths.lock, token: first.token });

    const source = temporaryLock();
    acquireArtifactLock({
      activity: "copied",
      lockDir: source.lock,
      holderPid: 303,
      runtime: runtime({ 303: { state: "running", identity: "birth-c" } }),
    });
    const copied = temporaryLock();
    renameSync(source.lock, copied.lock);
    expect(() =>
      acquireArtifactLock({
        activity: "other-checkout",
        lockDir: copied.lock,
        holderPid: 404,
        runtime: runtime(
          {
            303: { state: "absent" },
            404: { state: "running", identity: "birth-d" },
          },
          { nonce: "c" },
        ),
      }),
    ).toThrow(/owner belongs to checkout lock/);
  });

  it("does not move a replaced lock after another contender's retirement", () => {
    const { lock } = temporaryLock();
    acquireArtifactLock({
      activity: "abandoned",
      lockDir: lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "birth-a" } }),
    });
    mkdirSync(`${lock}.retired-${"a".repeat(32)}`);

    expect(() =>
      acquireArtifactLock({
        activity: "contender",
        lockDir: lock,
        holderPid: 202,
        runtime: runtime(
          {
            101: { state: "absent" },
            202: { state: "running", identity: "birth-b" },
          },
          { nonce: "c" },
        ),
      }),
    ).toThrow(/retirement already exists/);
    expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).activity).toBe(
      "abandoned",
    );
  });

  it("keeps a successor canonical across a delayed release-recovery race", () => {
    const { lock } = temporaryLock();
    const first = acquireArtifactLock({
      activity: "old-owner",
      lockDir: lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "birth-a" } }),
    });
    let oldOwnerProbes = 0;
    let successor: ReturnType<typeof acquireArtifactLock> | undefined;

    expect(() =>
      acquireArtifactLock({
        activity: "delayed-recovery",
        lockDir: lock,
        holderPid: 303,
        runtime: {
          host: "test-host",
          machineId: "1".repeat(64),
          now: () => new Date("2026-09-02T00:00:00.000Z"),
          nonce: (() => {
            let next = "c".charCodeAt(0);
            return () => String.fromCharCode(next++).repeat(32);
          })(),
          probe: (pid) => {
            if (pid === 303) {
              return { state: "running" as const, identity: "birth-c" };
            }
            if (pid !== 101) return { state: "unknown" as const };
            oldOwnerProbes++;
            if (oldOwnerProbes === 2) {
              // Force the old valid-token release and successor publication
              // into the last liveness-check/retirement interval.
              releaseArtifactLock({ lockDir: lock, token: first.token });
              successor = acquireArtifactLock({
                activity: "successor",
                lockDir: lock,
                holderPid: 202,
                runtime: runtime(
                  { 202: { state: "running", identity: "birth-b" } },
                  { nonce: "f" },
                ),
              });
            }
            return { state: "absent" as const };
          },
        },
      }),
    ).toThrow(/owner changed before retirement/);

    expect(successor).toBeDefined();
    expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).activity).toBe(
      "successor",
    );
    releaseArtifactLock({ lockDir: lock, token: successor!.token });
  });

  it("atomically retires the whole lock without an empty canonical window", () => {
    const { lock } = temporaryLock();
    const ownerRuntime = runtime({
      101: { state: "running", identity: "birth-a" },
    });
    const first = acquireArtifactLock({
      activity: "release-owner",
      lockDir: lock,
      holderPid: 101,
      runtime: ownerRuntime,
    });
    writeFileSync(join(lock, "unexpected"), "leave for inspection");

    releaseArtifactLock({ lockDir: lock, token: first.token });

    expect(existsSync(lock)).toBe(false);
    expect(existsSync(`${lock}.retired-${first.token}`)).toBe(true);
    const next = acquireArtifactLock({
      activity: "next-owner",
      lockDir: lock,
      holderPid: 202,
      runtime: runtime(
        { 202: { state: "running", identity: "birth-b" } },
        { nonce: "e" },
      ),
    });
    releaseArtifactLock({ lockDir: lock, token: next.token });
  });

  it("fails closed when owner liveness is unknown", () => {
    const { lock } = temporaryLock();
    const first = acquireArtifactLock({
      activity: "uncertain-owner",
      lockDir: lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "birth-a" } }),
    });

    expect(() =>
      acquireArtifactLock({
        activity: "contender",
        lockDir: lock,
        holderPid: 202,
        runtime: runtime(
          {
            101: { state: "unknown" },
            202: { state: "running", identity: "birth-b" },
          },
          { nonce: "c" },
        ),
      }),
    ).toThrow(/owner process liveness is unknown/);
    releaseArtifactLock({ lockDir: lock, token: first.token });
  });

  it("leaves a malformed owner untouched for manual recovery", () => {
    const { lock } = temporaryLock();
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), "legacy:123:owner\n");

    expect(() =>
      acquireArtifactLock({
        activity: "contender",
        lockDir: lock,
        holderPid: 202,
        runtime: runtime(
          { 202: { state: "running", identity: "birth-b" } },
          { nonce: "c" },
        ),
      }),
    ).toThrow(/legacy or malformed owner/);
    expect(readFileSync(join(lock, "owner"), "utf8")).toBe(
      "legacy:123:owner\n",
    );
  });

  it("does not let an old or guessed token release the current owner", () => {
    const { lock } = temporaryLock();
    const first = acquireArtifactLock({
      activity: "current",
      lockDir: lock,
      holderPid: 101,
      runtime: runtime({ 101: { state: "running", identity: "birth-a" } }),
    });

    expect(() =>
      releaseArtifactLock({ lockDir: lock, token: "f".repeat(32) }),
    ).toThrow(/release token does not match/);
    expect(JSON.parse(readFileSync(join(lock, "owner"), "utf8")).activity).toBe(
      "current",
    );
    releaseArtifactLock({ lockDir: lock, token: first.token });
  });

  it("recovers after a real subprocess is forcibly killed", async () => {
    const { lock } = temporaryLock();
    const helperUrl = new URL(
      "../../../scripts/artifact-lock.mjs",
      import.meta.url,
    ).href;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { acquireArtifactLock } from ${JSON.stringify(helperUrl)};\n` +
          `acquireArtifactLock({ activity: "hard-killed", lockDir: ${JSON.stringify(lock)} });\n` +
          `process.stdout.write("ready\\n");\n` +
          `setInterval(() => {}, 1000);`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    await new Promise<void>((resolve, reject) => {
      child.stdout.setEncoding("utf8");
      child.stdout.once("data", (chunk: string) => {
        if (chunk.includes("ready")) resolve();
        else reject(new Error(`unexpected child output: ${chunk}`));
      });
      child.once("error", reject);
      child.once("exit", (status) => {
        reject(new Error(`lock child exited early (${status}): ${stderr}`));
      });
    });

    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    expect(child.kill("SIGKILL")).toBe(true);
    await exited;

    await expect(
      withArtifactLock("after-hard-kill", async () => "recovered", lock),
    ).resolves.toBe("recovered");
  }, 15_000);
});
