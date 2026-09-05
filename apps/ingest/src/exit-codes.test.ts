import { describe, expect, it } from "vitest";
import {
  EXIT_BLOCKED,
  EXIT_CLEAN,
  EXIT_DEGRADED,
  exitCodeForRun,
} from "./exit-codes";

describe("exitCodeForRun", () => {
  it("is clean when every provider and every animal refreshed", () => {
    expect(exitCodeForRun({ failedProviders: 0, failedAnimals: 0 })).toBe(
      EXIT_CLEAN,
    );
  });

  it("is degraded when a provider failed but the dataset was written", () => {
    expect(exitCodeForRun({ failedProviders: 1, failedAnimals: 0 })).toBe(
      EXIT_DEGRADED,
    );
    expect(exitCodeForRun({ failedProviders: 7, failedAnimals: 0 })).toBe(
      EXIT_DEGRADED,
    );
  });

  // A provider that finished with one page it could not read is not a clean
  // run: that animal is shipping from the previous dataset, or not at all.
  it("is degraded when only individual animals failed", () => {
    expect(exitCodeForRun({ failedProviders: 0, failedAnimals: 1 })).toBe(
      EXIT_DEGRADED,
    );
  });

  it("is degraded when both kinds of failure happened", () => {
    expect(exitCodeForRun({ failedProviders: 2, failedAnimals: 3 })).toBe(
      EXIT_DEGRADED,
    );
  });

  // The scheduled crawl deploys on 0 and on 2 and refuses on anything else,
  // so a degraded run must never come back as the blocked code.
  it("never reports degraded as blocked", () => {
    expect(EXIT_DEGRADED).not.toBe(EXIT_BLOCKED);
    expect(exitCodeForRun({ failedProviders: 1, failedAnimals: 0 })).not.toBe(
      EXIT_BLOCKED,
    );
    expect(exitCodeForRun({ failedProviders: 0, failedAnimals: 1 })).not.toBe(
      EXIT_BLOCKED,
    );
  });
});
