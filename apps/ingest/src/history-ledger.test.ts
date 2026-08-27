import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  appendHistoryEntry,
  isEmptyHistoryEntry,
  toRemovedAnimal,
  type HistoryEntry,
} from "./history-ledger";

function animal(overrides: Partial<Animal> & { id: string }): Animal {
  return {
    source: {
      providerId: "muri",
      sourceUrl: `https://example.si/${overrides.id}`,
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-01T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: "muri", name: "Zavod Muri", city: "Vransko" },
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavod Muri",
    ...overrides,
  };
}

function readLines(path: string): HistoryEntry[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

describe("toRemovedAnimal", () => {
  it("carries the fields a removal report needs, not the whole animal", () => {
    const luna = animal({
      id: "muri:luna",
      name: "Luna",
      intakeDate: "2026-05-01",
    });

    expect(toRemovedAnimal(luna)).toEqual({
      id: "muri:luna",
      providerId: "muri",
      name: "Luna",
      species: "cat",
      intakeDate: "2026-05-01",
      firstSeenAt: "2026-08-01T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    });
  });

  it("leaves name and intakeDate out when the animal never had them", () => {
    const stray = animal({ id: "muri:stray" });
    const removed = toRemovedAnimal(stray);
    expect(removed.name).toBeUndefined();
    expect(removed.intakeDate).toBeUndefined();
  });
});

describe("isEmptyHistoryEntry", () => {
  it("is true when a run changed nothing", () => {
    expect(
      isEmptyHistoryEntry({
        generatedAt: "2026-08-16T06:00:00Z",
        added: [],
        updatedCount: 0,
        removed: [],
      }),
    ).toBe(true);
  });

  it("is false when anything changed", () => {
    expect(
      isEmptyHistoryEntry({
        generatedAt: "2026-08-16T06:00:00Z",
        added: [],
        updatedCount: 1,
        removed: [],
      }),
    ).toBe(false);
  });
});

describe("appendHistoryEntry", () => {
  let dir: string;
  let ledgerPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-history-"));
    // Nested and not yet created, like data/history.jsonl relative to a
    // freshly cloned repo before the first export has ever run.
    ledgerPath = join(dir, "nested", "history.jsonl");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates the ledger and its directory on the first non-empty run", () => {
    appendHistoryEntry(ledgerPath, {
      generatedAt: "2026-08-16T06:00:00Z",
      added: ["muri:luna"],
      updatedCount: 0,
      removed: [],
    });

    expect(existsSync(ledgerPath)).toBe(true);
    expect(readLines(ledgerPath)).toEqual([
      {
        generatedAt: "2026-08-16T06:00:00Z",
        added: ["muri:luna"],
        updatedCount: 0,
        removed: [],
      },
    ]);
  });

  it("appends a second run's line after the first instead of replacing it", () => {
    appendHistoryEntry(ledgerPath, {
      generatedAt: "2026-08-16T06:00:00Z",
      added: ["muri:luna"],
      updatedCount: 0,
      removed: [],
    });
    appendHistoryEntry(ledgerPath, {
      generatedAt: "2026-08-17T06:00:00Z",
      added: [],
      updatedCount: 2,
      removed: [
        {
          id: "muri:stray",
          providerId: "muri",
          species: "cat",
          firstSeenAt: "2026-07-01T06:00:00Z",
          lastSeenAt: "2026-08-16T06:00:00Z",
        },
      ],
    });

    const lines = readLines(ledgerPath);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.added).toEqual(["muri:luna"]);
    expect(lines[1]!.removed).toHaveLength(1);
    expect(lines[1]!.removed[0]!.id).toBe("muri:stray");
  });

  it("skips a run with no added, updated or removed animals", () => {
    appendHistoryEntry(ledgerPath, {
      generatedAt: "2026-08-16T06:00:00Z",
      added: [],
      updatedCount: 0,
      removed: [],
    });

    expect(existsSync(ledgerPath)).toBe(false);
  });

  it("does not touch an existing ledger when the next run is empty", () => {
    appendHistoryEntry(ledgerPath, {
      generatedAt: "2026-08-16T06:00:00Z",
      added: ["muri:luna"],
      updatedCount: 0,
      removed: [],
    });
    appendHistoryEntry(ledgerPath, {
      generatedAt: "2026-08-17T06:00:00Z",
      added: [],
      updatedCount: 0,
      removed: [],
    });

    expect(readLines(ledgerPath)).toHaveLength(1);
  });
});
