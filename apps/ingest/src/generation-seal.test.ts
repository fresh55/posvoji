import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPreviousGenerationSealed } from "./generation-seal";

const GENERATED_AT = "2026-09-02T00:00:00.000Z";

describe("checkPreviousGenerationSealed", () => {
  let root: string;
  let receiptPath: string;

  function writeReceipt(value: unknown): void {
    writeFileSync(receiptPath, `${JSON.stringify(value, null, 2)}\n`);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "posvoji-generation-seal-"));
    receiptPath = join(root, "generation.json");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("counts the first run as sealed", () => {
    expect(checkPreviousGenerationSealed(undefined, receiptPath).sealed).toBe(
      true,
    );
  });

  it("has nothing to say before the first receipt exists", () => {
    expect(
      checkPreviousGenerationSealed(GENERATED_AT, receiptPath),
    ).toEqual({ sealed: true });
  });

  it("counts a receipt for the published generation as sealed", () => {
    writeReceipt({ version: 1, datasetGeneratedAt: GENERATED_AT });

    expect(checkPreviousGenerationSealed(GENERATED_AT, receiptPath)).toEqual({
      sealed: true,
    });
  });

  it("names both generations when the receipt is behind the datasets", () => {
    const sealedAt = "2026-09-01T00:00:00.000Z";
    writeReceipt({ version: 1, datasetGeneratedAt: sealedAt });

    const result = checkPreviousGenerationSealed(GENERATED_AT, receiptPath);

    expect(result.sealed).toBe(false);
    expect(result.reason).toContain(sealedAt);
    expect(result.reason).toContain(GENERATED_AT);
  });

  it("reports a receipt with no published dataset beside it", () => {
    writeReceipt({ version: 1, datasetGeneratedAt: GENERATED_AT });

    const result = checkPreviousGenerationSealed(undefined, receiptPath);

    expect(result.sealed).toBe(false);
    expect(result.reason).toMatch(/no published dataset/);
  });

  it("reports an unreadable receipt as unsealed, with the parse error", () => {
    writeFileSync(receiptPath, '{"version": 1, "datasetGen');

    const result = checkPreviousGenerationSealed(GENERATED_AT, receiptPath);

    expect(result.sealed).toBe(false);
    expect(result.reason).toMatch(/could not be read/);
  });

  it("reports a receipt of another shape as unsealed", () => {
    writeReceipt({ version: 99, datasetGeneratedAt: GENERATED_AT });

    expect(
      checkPreviousGenerationSealed(GENERATED_AT, receiptPath).sealed,
    ).toBe(false);
  });
});
