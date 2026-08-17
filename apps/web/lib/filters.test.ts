import { describe, expect, it } from "vitest";
import type { Animal, Species, TestResult } from "@posvoji/schema";
import {
  activeFilterCount,
  activeFilterSectionCount,
  applyFilters,
  bySpecies,
  EMPTY_FILTERS,
  parseFilters,
  pruneHiddenFilters,
  serializeFilters,
  toggleCounts,
  toggleValues,
  visibleGroups,
  visibleToggles,
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
  it("keeps every selected age visible instead of silently clearing it", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      age: ["mladicek", "odrasel", "senior"],
    });

    expect(pruned.age).toEqual(["mladicek", "odrasel", "senior"]);
  });

  it("keeps a meaningful two-age selection", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      age: ["mladicek", "senior"],
    });

    expect(pruned.age).toEqual(["mladicek", "senior"]);
  });

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
  it("round-trips an explicit all-age selection", () => {
    const filters = parseFilters("starost=mladicek,odrasel,senior");

    expect(filters.age).toEqual(["mladicek", "odrasel", "senior"]);
    expect(activeFilterCount(filters)).toBe(3);
    expect(serializeFilters(filters)).toBe(
      "starost=mladicek,odrasel,senior",
    );
  });

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

describe("active filter section count", () => {
  it("counts each selected axis once, including health as one section", () => {
    expect(
      activeFilterSectionCount({
        ...EMPTY_FILTERS,
        species: "cat",
        sex: ["male", "female"],
        age: ["mladicek", "odrasel", "senior"],
        shelter: ["s1", "s2"],
        toggles: ["cepljenje", "sterilizacija"],
      }),
    ).toBe(4);
  });

  it("does not count the species tab or empty sections", () => {
    expect(activeFilterSectionCount({ ...EMPTY_FILTERS, species: "dog" })).toBe(
      0,
    );
  });
});

describe("multi-select behavior", () => {
  it("uses OR for choices within sex", () => {
    const male = animal("dog", { sex: "male" });
    const female = animal("dog", { sex: "female" });
    const unknown = animal("dog", { sex: "unknown" });

    expect(
      applyFilters(
        [male, female, unknown],
        { ...EMPTY_FILTERS, sex: ["male", "female"] },
        NOW,
      ),
    ).toEqual([male, female]);
  });

  it("uses OR for choices within age and keeps all three selected", () => {
    const young = animal("dog", { approximateAgeMonths: 6 });
    const adult = animal("dog", { approximateAgeMonths: 36 });
    const senior = animal("dog", { approximateAgeMonths: 120 });
    const unknown = animal("dog");

    expect(
      applyFilters(
        [young, adult, senior, unknown],
        {
          ...EMPTY_FILTERS,
          age: ["mladicek", "odrasel", "senior"],
        },
        NOW,
      ),
    ).toEqual([young, adult, senior]);
  });

  it("uses OR for choices within health", () => {
    const vaccinated = animal("dog", { medical: { vaccinated: true } });
    const neutered = animal("dog", { medical: { neutered: true } });
    const both = animal("dog", {
      medical: { vaccinated: true, neutered: true },
    });
    const neither = animal("dog");

    expect(
      applyFilters(
        [vaccinated, neutered, both, neither],
        {
          ...EMPTY_FILTERS,
          toggles: ["cepljenje", "sterilizacija"],
        },
        NOW,
      ),
    ).toEqual([vaccinated, neutered, both]);
  });

  it("counts each health choice independently of selected health choices", () => {
    const vaccinated = animal("dog", { medical: { vaccinated: true } });
    const neutered = animal("dog", { medical: { neutered: true } });
    const counts = toggleCounts(
      [vaccinated, neutered],
      { ...EMPTY_FILTERS, toggles: ["cepljenje"] },
      NOW,
    );

    expect(counts.get("cepljenje")).toBe(1);
    expect(counts.get("sterilizacija")).toBe(1);
  });
});

describe("selecting a whole region", () => {
  it("turns on every shelter in it in one go", () => {
    expect(toggleValues([], ["mh", "sia-in-lu", "muri"])).toEqual([
      "mh",
      "sia-in-lu",
      "muri",
    ]);
  });

  it("turns them all off again when they are all on", () => {
    expect(toggleValues(["mh", "sia-in-lu", "muri"], ["mh", "sia-in-lu", "muri"]))
      .toEqual([]);
  });

  it("completes a partly selected region rather than clearing it", () => {
    expect(toggleValues(["muri"], ["mh", "sia-in-lu", "muri"])).toEqual([
      "muri",
      "mh",
      "sia-in-lu",
    ]);
  });

  it("leaves shelters outside the region alone", () => {
    expect(toggleValues(["maribor", "mh"], ["mh"])).toEqual(["maribor"]);
    expect(toggleValues(["maribor"], ["mh", "muri"])).toEqual([
      "maribor",
      "mh",
      "muri",
    ]);
  });

  it("never doubles a shelter that was already on", () => {
    expect(toggleValues(["mh"], ["mh", "muri"])).toEqual(["mh", "muri"]);
  });
});
