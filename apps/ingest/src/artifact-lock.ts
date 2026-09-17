import { join } from "node:path";
import {
  acquireArtifactLock,
  isArtifactLockOwnershipError,
  releaseArtifactLock,
} from "../../../scripts/artifact-lock.mjs";
import { repoRoot } from "./paths";

export const artifactLockDir = join(repoRoot, ".artifact-lock");

type Signal = "SIGINT" | "SIGTERM" | "SIGHUP";

/**
 * Excludes deploys and every ingest entry point that mutates data/dist or the
 * shared media tree. A later writer automatically recovers only an owner on
 * this host, in this exact checkout, whose process identity is proven gone.
 * CLI entry points ignore the returned cleanup and hold the lock until normal
 * process exit; tests and scoped callers may release it directly.
 */
export function holdArtifactLock(
  activity: string,
  lockDir = artifactLockDir,
): () => void {
  const { token } = acquireArtifactLock({
    activity,
    lockDir,
    holderPid: process.pid,
  });
  const release = () => releaseArtifactLock({ lockDir, token });
  let stopped = false;

  const signalHandlers = new Map<Signal, () => void>();
  const stopHolding = () => {
    if (stopped) return;
    stopped = true;
    process.removeListener("exit", onExit);
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    release();
  };
  const onExit = () => {
    try {
      stopHolding();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  };
  for (const [signal, status] of [
    ["SIGHUP", 129],
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    const handler = () => {
      onExit();
      process.exit(status);
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
  process.once("exit", onExit);

  return stopHolding;
}

/**
 * Release a lock whose work is already finished and its result already on
 * disk. A release can fail for two very different reasons. A rename that did
 * not go through leaves a lock the next run recovers once it proves the owner
 * is gone, and failing the finished work over it would throw away a result
 * that is sound. A refusal on ownership grounds means somebody else holds the
 * lock and may have been writing beside us, so that one still throws.
 */
export function releaseOrWarn(
  stopHolding: () => void,
  warn: (message: string) => void = (message) => console.warn(message),
): void {
  try {
    stopHolding();
  } catch (error) {
    if (isArtifactLockOwnershipError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    warn(`artifact lock: release failed, the next run recovers it: ${message}`);
  }
}

export async function withArtifactLock<T>(
  activity: string,
  run: () => Promise<T>,
  lockDir = artifactLockDir,
): Promise<T> {
  const stopHolding = holdArtifactLock(activity, lockDir);
  try {
    return await run();
  } finally {
    releaseOrWarn(stopHolding);
  }
}
