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

export interface GenerationReceipt {
  version: number;
  generationId: string;
  datasetGeneratedAt: string;
  artifacts: Record<string, string>;
  media: Record<string, string>;
}

export interface GenerationReceiptPaths {
  distDir: string;
  mediaRoot: string;
  receiptPath?: string;
}

export interface MediaReferenceCollection {
  referenced: Map<string, Set<string>>;
  photos: number;
  shareCards: number;
  shelterLogos: number;
}

export interface GenerationReceiptValidation {
  receipt: GenerationReceipt;
  collection: MediaReferenceCollection;
  dataset: {
    generatedAt: string;
    animals: unknown[];
    [key: string]: unknown;
  };
  logoManifest: unknown;
  shareManifest: unknown;
}

export type GenerationRepair = "image-derivatives" | "shelter-logos";

