import { describe, expect, it } from "vitest";
import type { Animal, Species, TestResult } from "@posvoji/schema";
import {
  activeFilterCount,
  bySpecies,
  EMPTY_FILTERS,
  parseFilters,
  pruneHiddenFilters,
  serializeFilters,
  sortAnimals,
  visibleGroups,
  visibleToggles,
  waitingMonths,
  waitingSince,
  type Filters,
  type SpeciesFilter,
} from "./filters";

const NOW = new Date("2026-08-15T00:00:00Z");

let seq = 0;

function animal(species: Species, extra: Partial<Animal> = {}): Animal {
  seq += 1;
  return {
    id: `a${seq}`,
    source: {
      providerId: "zavetisce",
      sourceUrl: "https://example.org/zival",
      fetchedAt: "2026-08-01T00:00:00Z",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
    },
    shelter: { id: "s1", name: "Zavetišče", city: "Ljubljana" },
    species,
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...extra,
  };
}

function toggleKeys(animals: Animal[], species: SpeciesFilter): string[] {
  return visibleToggles(animals, species).map((toggle) => toggle.key);
}

describe("visibleGroups", () => {
  it("hides velikost on the cat tab even when the cats differ in size", () => {
    const cats = [
      animal("cat", { size: "small" }),
      animal("cat", { size: "large" }),
    ];
    expect(visibleGroups(cats, "cat", NOW).size).toBe(false);
  });

  it("keeps velikost on the dog tab", () => {
    const dogs = [
      animal("dog", { size: "small" }),
      animal("dog", { size: "large" }),
    ];
    expect(visibleGroups(dogs, "dog", NOW).size).toBe(true);
  });

  it("measures against the species tab, not the whole dataset", () => {
    const animals = [
      animal("dog", { sex: "male" }),
      animal("dog", { sex: "female" }),
      animal("cat", { sex: "female" }),
    ];
    expect(visibleGroups(bySpecies(animals, "all"), "all", NOW).sex).toBe(true);
    expect(visibleGroups(bySpecies(animals, "cat"), "cat", NOW).sex).toBe(false);
  });
});

describe("visibleToggles", () => {
  const cats = [
    animal("cat", { medical: { fiv: "negative", felv: "negative" } }),
    animal("cat", { medical: { fiv: "positive", felv: "unknown" } }),
  ];

  it("offers FIV and FeLV on the cat tab", () => {
    expect(toggleKeys(cats, "cat")).toEqual(["brez-fiv", "brez-felv"]);
  });

  it("withholds them from every other tab, Vse included", () => {
    expect(toggleKeys(cats, "all")).toEqual([]);
    expect(toggleKeys(cats, "dog")).toEqual([]);
    expect(toggleKeys(cats, "rabbit")).toEqual([]);
  });

  it("takes only a recorded negative, never an untested cat", () => {
    const toggle = visibleToggles(cats, "cat").find((t) => t.key === "brez-fiv");
    const matches = (fiv?: TestResult) =>
      toggle?.matches(animal("cat", { medical: { fiv } }));
    expect(matches("negative")).toBe(true);
    expect(matches("positive")).toBe(false);
    expect(matches("unknown")).toBe(false);
    expect(matches(undefined)).toBe(false);
  });
});

describe("pruneHiddenFilters", () => {
  it("drops velikost once the tab turns to cats", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "cat",
      sex: ["female"],
      size: ["small", "large"],
    });
    expect(pruned.size).toEqual([]);
    expect(pruned.sex).toEqual(["female"]);
  });

  it("drops the cat-only toggles once the tab turns to dogs", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "dog",
      toggles: ["cepljenje", "brez-fiv", "brez-felv"],
    });
    expect(pruned.toggles).toEqual(["cepljenje"]);
  });

  it("leaves the cat tab holding its own toggles", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "cat",
      toggles: ["brez-fiv"],
    });
    expect(pruned.toggles).toEqual(["brez-fiv"]);
  });
});

describe("URL codec", () => {
  it("round-trips the cat-only toggles", () => {
    const filters: Filters = {
      ...EMPTY_FILTERS,
      species: "cat",
      toggles: ["brez-fiv", "brez-felv"],
    };
    const query = serializeFilters(filters);
    expect(query).toBe("vrsta=macka&lastnosti=brez-fiv,brez-felv");
    expect(parseFilters(query)).toEqual(filters);
  });

  it("degrades a stale cat-only toggle carried onto the dog tab", () => {
    const filters = parseFilters(
      "vrsta=pes&velikost=majhna&lastnosti=cip,brez-fiv",
    );
    expect(filters.toggles).toEqual(["cip"]);
    expect(activeFilterCount(filters)).toBe(2);
    expect(serializeFilters(filters)).toBe(
      "vrsta=pes&velikost=majhna&lastnosti=cip",
    );
  });

  it("degrades a stale velikost carried onto the cat tab", () => {
    const filters = parseFilters("vrsta=macka&velikost=majhna&spol=samica");
    expect(filters.size).toEqual([]);
    expect(activeFilterCount(filters)).toBe(1);
    expect(serializeFilters(filters)).toBe("vrsta=macka&spol=samica");
  });
});

const base = animal("cat", {
  source: {
    providerId: "macja-hisa",
    sourceUrl: "https://www.macjahisa.si/posvojitev/muce/luna",
    fetchedAt: "2026-08-15T06:00:00Z",
    firstSeenAt: "2026-06-10T06:00:00Z",
    lastSeenAt: "2026-08-15T06:00:00Z",
  },
});

function withDates(id: string, dates: Partial<Animal>): Animal {
  return { ...base, ...dates, id };
}

describe("waitingSince", () => {
  it("prefers the intake date", () => {
    const animal = withDates("a", {
      intakeDate: "2026-02-20",
      foundDate: "2026-03-20",
    });
    expect(waitingSince(animal)).toEqual(new Date("2026-02-20"));
  });

  it("falls back to the found date", () => {
    const animal = withDates("b", { foundDate: "2026-03-20" });
    expect(waitingSince(animal)).toEqual(new Date("2026-03-20"));
  });

  it("falls back to the day we first saw the listing", () => {
    expect(waitingSince(base)).toEqual(new Date("2026-06-10T06:00:00Z"));
  });

  it("returns undefined rather than guessing when no date can be read", () => {
    const animal = withDates("c", {
      source: { ...base.source, firstSeenAt: "nekoč" },
    });
    expect(waitingSince(animal)).toBeUndefined();
  });
});

describe("waitingMonths", () => {
  it("counts whole calendar months", () => {
    expect(waitingMonths(withDates("a", { intakeDate: "2026-02-20" }), NOW)).toBe(
      6,
    );
  });

  it("floors at zero for a date in the future", () => {
    expect(waitingMonths(withDates("b", { intakeDate: "2026-11-20" }), NOW)).toBe(
      0,
    );
  });
});

describe("sortAnimals", () => {
  const recent = withDates("recent", { intakeDate: "2026-07-20" });
  const old = withDates("old", { intakeDate: "2024-04-20" });
  const undated = withDates("undated", {
    source: { ...base.source, firstSeenAt: "nekoč" },
  });

  it("puts the newest arrival first by default", () => {
    const ids = sortAnimals([old, recent], "novo").map((a) => a.id);
    expect(ids).toEqual(["recent", "old"]);
  });

  it("puts the longest wait first", () => {
    const ids = sortAnimals([recent, old], "cakanje").map((a) => a.id);
    expect(ids).toEqual(["old", "recent"]);
  });

  it("sinks an unknown date to the bottom in both orders", () => {
    expect(sortAnimals([undated, recent, old], "cakanje").at(-1)).toBe(undated);
    expect(sortAnimals([undated, recent, old], "novo").at(-1)).toBe(undated);
  });

  it("leaves the input array alone", () => {
    const animals = [recent, old];
    sortAnimals(animals, "cakanje");
    expect(animals[0]).toBe(recent);
  });
});

describe("sort in the URL", () => {
  it("writes no param for the default order", () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe("");
  });

  it("round-trips the waiting order", () => {
    const query = serializeFilters({ ...EMPTY_FILTERS, sort: "cakanje" });
    expect(query).toBe("razvrsti=cakanje");
    expect(parseFilters(query).sort).toBe("cakanje");
  });

  it("degrades an unknown value to the default", () => {
    expect(parseFilters("razvrsti=najstarejsi").sort).toBe("novo");
  });
});
