import { describe, expect, it } from "vitest";
import {
  EXIT_BLOCKED,
  EXIT_CLEAN,
  EXIT_DEGRADED,
  exitCodeForRun,
} from "./exit-codes";

describe("exitCodeForRun", () => {
  it("is clean when every provider crawled", () => {
    expect(exitCodeForRun(0)).toBe(EXIT_CLEAN);
  });

  it("is degraded when a provider failed but the dataset was written", () => {
    expect(exitCodeForRun(1)).toBe(EXIT_DEGRADED);
    expect(exitCodeForRun(7)).toBe(EXIT_DEGRADED);
  });

  // The scheduled crawl deploys on 0 and on 2 and refuses on anything else,
  // so a degraded run must never come back as the blocked code.
  it("never reports degraded as blocked", () => {
    expect(EXIT_DEGRADED).not.toBe(EXIT_BLOCKED);
    expect(exitCodeForRun(1)).not.toBe(EXIT_BLOCKED);
  });
});
