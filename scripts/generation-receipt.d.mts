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

export const GENERATION_RECEIPT_VERSION: number;
export const GENERATION_RECEIPT_FILE: string;
export const GENERATION_ARTIFACTS: readonly string[];

export function createGenerationReceipt(
  paths: GenerationReceiptPaths,
): GenerationReceipt;

export function generationIdFor(
  datasetGeneratedAt: string,
  artifacts: Record<string, string>,
  media: Record<string, string>,
): string;

export function validateGenerationReceipt(
  paths: GenerationReceiptPaths,
): GenerationReceiptValidation;

export function validateGenerationReceiptForRepair(
  paths: GenerationReceiptPaths,
  repair: GenerationRepair,
): GenerationReceiptValidation & { repairableMedia: string[] };
