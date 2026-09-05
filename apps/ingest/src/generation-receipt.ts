import {
  createGenerationReceipt,
  validateGenerationReceipt,
  validateGenerationReceiptForRepair,
  type GenerationRepair,
} from "../../../scripts/generation-receipt.mjs";
import {
  datasetDir,
  generationReceiptPath,
  publicMediaDir,
} from "./paths";
import { writeFileAtomic } from "./write-atomic";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reserveInputRevision } from "./provider-snapshots";

export interface GenerationPaths {
  distDir?: string;
  mediaRoot?: string;
  receiptPath?: string;
}

function resolvedPaths(paths: GenerationPaths = {}) {
  return {
    distDir: paths.distDir ?? datasetDir,
    mediaRoot: paths.mediaRoot ?? publicMediaDir,
    receiptPath: paths.receiptPath ?? generationReceiptPath,
  };
}

/** Refuse to mutate a partial job over anything but a committed snapshot. */
export function assertCommittedGeneration(paths: GenerationPaths = {}): void {
  validateGenerationReceipt(resolvedPaths(paths));
}

/**
 * Permit a standalone job to fill only missing outputs it owns. Empty or
 * changed files, master photos, JSON inputs and every unrelated media path
 * remain fail-closed because neither partial job can prove their provenance.
 */
export function assertRepairableGeneration(
  repair: GenerationRepair,
  paths: GenerationPaths = {},
): readonly string[] {
  return validateGenerationReceiptForRepair(resolvedPaths(paths), repair)
    .repairableMedia;
}

/**
 * Commit a complete snapshot. Call only after every JSON and media write has
 * succeeded; the atomic receipt rename is the generation's commit point.
 */
export function writeGenerationReceipt(
  paths: GenerationPaths = {},
  options: { preserveInputRevision?: boolean } = {},
): string {
  const resolved = resolvedPaths(paths);
  // Standalone media jobs change the committed generation too. Give them a
  // fresh revision under their existing artifact lock; normal exports already
  // reserved one before the crawl. Legacy datasets keep their old format.
  const manifestPath = join(resolved.distDir, "crawl-manifest.json");
  if (!options.preserveInputRevision && existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.inputRevision = reserveInputRevision(resolved.distDir);
    writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2));
  }
  const receipt = createGenerationReceipt(resolved);
  writeFileAtomic(
    resolved.receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt.generationId;
}
