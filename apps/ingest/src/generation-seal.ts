import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { datasetDir } from "./paths";

// The receipt the export writes last, after every dataset and media write, as
// the generation's commit point. Its name and version are fixed by
// scripts/generation-receipt.mjs, which owns the format; only the two facts
// this file needs are repeated here, so that the read at the start of a run
// does not pull in the hashing the full validation does.
const GENERATION_RECEIPT_FILE = "generation.json";
const GENERATION_RECEIPT_VERSION = 1;

export interface PreviousGenerationSeal {
  sealed: boolean;
  // Why it is not, in words the run can print.
  reason?: string;
  // What the receipt on disk seals, when it could be read.
  receiptGeneratedAt?: string;
}

// Whether the previous run reached its commit point.
//
// A run that wrote both datasets and died before the receipt leaves a pair
// that agrees with itself and with nothing else: the next run cannot tell it
// apart from a sealed one by reading the datasets, and would quietly take
// uncommitted data as its change-set baseline. Nothing here can restore the
// last sealed datasets, because the unsealed run has already overwritten
// them. This only says so, so that the run can.
//
// A missing receipt says nothing: either no run has sealed a generation yet,
// or the receipt was never part of the layout. The comparison needs a receipt
// to compare against, and it is the stale one a crash leaves behind that this
// exists to catch.
//
// Deliberately a plain JSON read and one timestamp comparison, not the full
// receipt validation: that one re-hashes every artifact and every referenced
// media file, minutes of work at the start of a run that has not crawled
// anything yet. The full check runs where it belongs, in the standalone jobs
// and in deployment.
export function checkPreviousGenerationSealed(
  publishedGeneratedAt: string | undefined,
  receiptPath: string = join(datasetDir, GENERATION_RECEIPT_FILE),
): PreviousGenerationSeal {
  if (!existsSync(receiptPath)) return { sealed: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch (error) {
    return {
      sealed: false,
      reason:
        `the generation receipt at ${receiptPath} could not be read: ` +
        `${error}`,
    };
  }

  const receipt = parsed as { version?: unknown; datasetGeneratedAt?: unknown };
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    receipt.version !== GENERATION_RECEIPT_VERSION ||
    typeof receipt.datasetGeneratedAt !== "string"
  ) {
    return {
      sealed: false,
      reason:
        `the generation receipt at ${receiptPath} is not a version ` +
        `${GENERATION_RECEIPT_VERSION} receipt with a datasetGeneratedAt`,
    };
  }

  const receiptGeneratedAt = receipt.datasetGeneratedAt;
  if (publishedGeneratedAt === undefined) {
    return {
      sealed: false,
      receiptGeneratedAt,
      reason:
        `the generation receipt at ${receiptPath} seals ` +
        `${receiptGeneratedAt}, and there is no published dataset beside it`,
    };
  }
  if (receiptGeneratedAt === publishedGeneratedAt) {
    return { sealed: true, receiptGeneratedAt };
  }
  return {
    sealed: false,
    receiptGeneratedAt,
    reason:
      `the generation receipt at ${receiptPath} seals ${receiptGeneratedAt}, ` +
      `and the published dataset beside it is from ${publishedGeneratedAt}`,
  };
}
