export interface ProcessProbe {
  state: "running" | "absent" | "unknown";
  identity?: string;
}

export interface ArtifactLockOwner {
  version: number;
  activity: string;
  pid: number;
  host: string;
  machineId: string | null;
  lockPath: string;
  processIdentity: string | null;
  nonce: string;
  acquiredAt: string;
}

export interface ArtifactLockRuntime {
  host?: string;
  machineId?: string | null;
  now?: () => Date;
  nonce?: () => string;
  probe?: (pid: number) => ProcessProbe;
}

export interface AcquireArtifactLockOptions {
  activity: string;
  lockDir: string;
  holderPid?: number;
  runtime?: ArtifactLockRuntime;
}

export const ARTIFACT_LOCK_VERSION: number;

export function artifactLockIdentity(lockDir: string): string;
export function machineIdentity(): string | null;
export function probeProcess(pid: number): ProcessProbe;
export function acquireArtifactLock(options: AcquireArtifactLockOptions): {
  token: string;
  owner: ArtifactLockOwner;
};
export function releaseArtifactLock(options: {
  lockDir: string;
  token: string;
}): void;
