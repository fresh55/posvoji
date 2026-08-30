import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderPolicy } from "@posvoji/schema";
import type { Animal } from "@posvoji/schema";
import { reuseAnimal } from "./incremental-crawl";
import {
  carryFirstSeenAt,
  countByProvider,
  findMassRemovals,
  guardMassRemoval,
  guardUniqueAnimalIds,
  readPreviousDataset,
  retainableAnimals,
} from "./run-guards";

function animal(id: string, providerId = "macja-hisa"): Animal {
  return {
    id: `${providerId}:${id}`,
    source: {
      providerId,
      sourceUrl: `https://example.si/${id}`,
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: providerId, name: "Zavetišče", city: "Celje" },
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
  };
}

function many(count: number, providerId = "macja-hisa"): Animal[] {
  return Array.from({ length: count }, (_, i) => animal(String(i), providerId));
}

function policy(overrides: Record<string, unknown> = {}): ProviderPolicy {
  return ProviderPolicy.parse({
    providerId: "macja-hisa",
    source: "https://www.macjahisa.si/muce_za_posvojitev.php",
    enabled: true,
    ingestion: "scrape",
    images: "cache-permitted",
    descriptions: "facts-only",
    permission: { status: "granted", date: "2026-08-18" },
    attribution: "Vir: Zavetišče Mačja hiša",
    crawl: { intervalHours: 12 },
    ...overrides,
  });
}

describe("readPreviousDataset", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-previous-"));
    path = join(dir, "animals.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("reads a valid dataset", () => {
    writeFileSync(
      path,
      JSON.stringify({
        generatedAt: "2026-08-27T06:00:00Z",
        animals: [animal("1")],
      }),
    );
    expect(readPreviousDataset(path)?.animals).toHaveLength(1);
  });

  it("treats a missing file as the first run", () => {
    expect(readPreviousDataset(join(dir, "nothing.json"))).toBeUndefined();
  });

  it("refuses to run over a truncated file", () => {
    writeFileSync(path, '{"generatedAt":"2026-08-27T06:00:00Z","anim');
    expect(() => readPreviousDataset(path)).toThrow(/not valid JSON/);
  });

  it("refuses to run over a file the schema rejects", () => {
    writeFileSync(path, JSON.stringify({ generatedAt: "yesterday" }));
    expect(() => readPreviousDataset(path)).toThrow(/Dataset schema/);
  });

  it("starts from nothing when the operator asks for it, loudly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(path, "not json at all");

    expect(
      readPreviousDataset(path, { discardPrevious: true }),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("findMassRemovals", () => {
  it("catches a provider that parsed to nothing", () => {
    expect(findMassRemovals(many(12), [])).toEqual([
      { providerId: "macja-hisa", before: 12, after: 0 },
    ]);
  });

  it("catches a provider that lost more than four fifths of its animals", () => {
    expect(findMassRemovals(many(10), many(1))).toEqual([
      { providerId: "macja-hisa", before: 10, after: 1 },
    ]);
    expect(findMassRemovals(many(10), many(2))).toEqual([]);
  });

  it("leaves a shelter too small to measure alone", () => {
    expect(findMassRemovals(many(2), [])).toEqual([]);
  });

  it("ignores a provider this run did not crawl", () => {
    // A failed crawl carries its animals forward, and a provider dropped on a
    // policy check is dropped on purpose. Neither is markup drift.
    const previous = [...many(9, "muri"), ...many(9, "macja-hisa")];
    const current = many(9, "macja-hisa");
    expect(
      findMassRemovals(previous, current, {
        crawledProviderIds: new Set(["macja-hisa"]),
      }),
    ).toEqual([]);
  });

  it("counts per provider, not over the whole dataset", () => {
    const previous = [...many(9, "muri"), ...many(9, "macja-hisa")];
    const current = many(9, "muri");
    expect(findMassRemovals(previous, current).map((r) => r.providerId)).toEqual(
      ["macja-hisa"],
    );
  });

  it("counts an animal the crawl reused as present", () => {
    // The incremental crawl skips the detail page of an animal that is still
    // on the list page and republishes what we hold. It was seen, it ships,
    // and the guard has to see a provider that lost nothing.
    const previous = many(12);
    const current = previous.map((animal) =>
      reuseAnimal(animal, "2026-08-29T06:00:00.000Z"),
    );
    expect(
      findMassRemovals(previous, current, {
        crawledProviderIds: new Set(["macja-hisa"]),
      }),
    ).toEqual([]);
  });
});

describe("guardMassRemoval", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aborts the run and names both counts", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => guardMassRemoval(many(12), [])).toThrow(
      /macja-hisa 12 -> 0/,
    );
  });

  it("lets a cleared provider through and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() =>
      guardMassRemoval(many(12), [], { accepted: new Set(["macja-hisa"]) }),
    ).not.toThrow();
    expect(warn.mock.calls[0]?.[0]).toMatch(/accepted by --accept-removals/);
  });

  it("logs its verdict on a clean run", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    guardMassRemoval(many(9), many(9));
    expect(log.mock.calls[0]?.[0]).toMatch(/removal guard: 1 provider/);
  });
});

describe("carryFirstSeenAt", () => {
  function seen(animal: Animal, firstSeenAt: string): Animal {
    return { ...animal, source: { ...animal.source, firstSeenAt } };
  }

  it("carries the previous date over an id match", () => {
    const before = seen(animal("luna"), "2026-01-04T06:00:00Z");
    const now = animal("luna");

    const [result] = carryFirstSeenAt([before], [now]);

    expect(result?.source.firstSeenAt).toBe("2026-01-04T06:00:00Z");
  });

  it("carries the previous date when the id changed but the page did not", () => {
    // What a provider switching from slug-based to numeric ids looks like.
    const before = seen(animal("luna"), "2026-01-04T06:00:00Z");
    const now = { ...animal("luna"), id: "macja-hisa:4812" };

    const [result] = carryFirstSeenAt([before], [now]);

    expect(result?.id).toBe("macja-hisa:4812");
    expect(result?.source.firstSeenAt).toBe("2026-01-04T06:00:00Z");
  });

  it("does not match a same sourceUrl across providers", () => {
    const before = seen(animal("luna", "muri"), "2026-01-04T06:00:00Z");
    const now = animal("luna", "macja-hisa");

    const [result] = carryFirstSeenAt([before], [now]);

    expect(result?.source.firstSeenAt).toBe("2026-08-16T06:00:00Z");
  });

  it("leaves a genuinely new animal on its own date", () => {
    const now = animal("nova");

    const [result] = carryFirstSeenAt([animal("luna")], [now]);

    expect(result).toBe(now);
  });
});

describe("guardUniqueAnimalIds", () => {
  it("accepts globally unique ids", () => {
    expect(() =>
      guardUniqueAnimalIds([animal("1"), animal("1", "muri")]),
    ).not.toThrow();
  });

  it("rejects a duplicate before map-based consumers can collapse it", () => {
    const first = animal("1");
    const duplicate = { ...animal("2", "muri"), id: first.id };

    expect(() => guardUniqueAnimalIds([first, duplicate])).toThrow(
      /duplicate animal id: "macja-hisa:1".*Refusing to merge overrides/,
    );
  });
});

describe("countByProvider", () => {
  it("counts each provider's animals", () => {
    const counts = countByProvider([...many(3, "muri"), ...many(1)]);
    expect(counts.get("muri")).toBe(3);
    expect(counts.get("macja-hisa")).toBe(1);
  });
});

describe("retainableAnimals", () => {
  it("keeps animals of a provider that is still enabled and permitted", () => {
    const result = retainableAnimals(
      many(2),
      new Map([["macja-hisa", policy()]]),
    );
    expect(result.animals).toHaveLength(2);
    expect(result.dropped).toEqual([]);
  });

  it("drops the animals of a provider that has been switched off", () => {
    const off = ProviderPolicy.parse({
      ...policy(),
      enabled: false,
    });
    const result = retainableAnimals(many(2), new Map([["macja-hisa", off]]));
    expect(result.animals).toEqual([]);
    expect(result.dropped).toEqual([
      { providerId: "macja-hisa", count: 2, reason: "provider is disabled" },
    ]);
  });

  it("drops the animals of a provider whose permission is gone", () => {
    const withdrawn = ProviderPolicy.parse({
      ...policy(),
      enabled: false,
      images: "none",
      logo: { use: "none" },
      permission: { status: "denied" },
    });
    const result = retainableAnimals(
      many(2),
      new Map([["macja-hisa", withdrawn]]),
    );
    expect(result.animals).toEqual([]);
    // enabled is checked first, and a withdrawn provider is switched off too.
    expect(result.dropped[0]?.count).toBe(2);
  });

  it("drops the animals of a provider that has no policy at all", () => {
    const result = retainableAnimals(many(2), new Map());
    expect(result.animals).toEqual([]);
    expect(result.dropped[0]?.reason).toBe("no policy.yaml");
  });
});
