import { describe, expect, it } from "vitest";
import type { Animal, AnimalSize, EnergyLevel, Sex, Species } from "@posvoji/schema";
import {
  applyFilters,
  ageInMonths,
  ageGroup,
  careCounts,
  careMatches,
  CARE_KEYS,
  chipGains,
  EMPTY_FILTERS,
  facetCounts,
  FILTER_METADATA,
  goodWithCounts,
  goodWithMatches,
  GOOD_WITH_KEYS,
  GROUPS,
  homeCounts,
  homeMatches,
  HOME_KEYS,
  toggleCounts,
  TOGGLES,
  TOGGLE_KEYS,
  type CareKey,
  type Filters,
  type GoodWithKey,
  type HomeKey,
  type MultiGroup,
  type SpeciesFilter,
  type ToggleKey,
} from "./filters";

// The filter engine reads the dataset through an index and answers each of its
// questions in one walk. The walks are not obviously the same thing as the
// definitions they replaced: facetCounts works out five tallies from one
// reading, and chipGains prices a whole row of chips without ever running the
// filter it is pricing.
//
// So the definitions are kept here, written the plain way straight off the
// rules, and the fast answers are checked against them over a dataset with
// every field present and absent and a few hundred filter states. These are
// not examples. They are the specification the implementation is a shortcut
// for, and any shortcut that stops agreeing with them is wrong.

const NOW = new Date("2026-08-15T00:00:00Z");

// ---------------------------------------------------------------------------
// The dataset. Deterministic, so a failure is reproducible and reducible.
// ---------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Every field the filter reads, present and absent, mixed independently so
 *  the combinations the rules disagree on actually occur. */
function dataset(count: number): Animal[] {
  const next = lcg(20260824);
  const pick = <Value>(values: Value[]): Value =>
    values[Math.floor(next() * values.length)];
  const animals: Animal[] = [];
  for (let at = 0; at < count; at += 1) {
    const species = pick<Species>(["dog", "cat", "cat", "rabbit", "other"]);
    const sex = pick<Sex | undefined>(["male", "female", "unknown", undefined]);
    const size = pick<AnimalSize | undefined>([
      "small",
      "medium",
      "large",
      undefined,
    ]);
    const energy = pick<EnergyLevel | undefined>([
      "calm",
      "balanced",
      "lively",
      undefined,
    ]);
    const answer = () => pick(["yes", "no", "unknown", undefined] as const);
    const flag = () => pick([true, false, undefined] as const);
    const months = pick([undefined, 3, 11, 12, 40, 95, 96, 130]);
    const born = pick([undefined, "2026-07-01", "2019-02-01", "2025-08-20"]);
    animals.push({
      id: `a${at}`,
      source: {
        providerId: "zavetisce",
        sourceUrl: `https://example.org/${at}`,
        fetchedAt: "2026-08-01T00:00:00Z",
        firstSeenAt: "2026-08-01T00:00:00Z",
        lastSeenAt: "2026-08-01T00:00:00Z",
      },
      shelter: {
        id: pick(["s1", "s2", "s3"]),
        name: "Zavetisce",
        city: "Ljubljana",
      },
      species,
      ...(sex === undefined ? {} : { sex }),
      ...(size === undefined ? {} : { size }),
      ...(energy === undefined ? {} : { energy }),
      ...(months === undefined ? {} : { approximateAgeMonths: months }),
      ...(born === undefined ? {} : { birthDate: born }),
      status: "available",
      medical: {
        neutered: flag(),
        vaccinated: flag(),
        microchipped: flag(),
        fiv: pick(["negative", "positive", "unknown", undefined] as const),
        felv: pick(["negative", "positive", "unknown", undefined] as const),
      },
      goodWith: { kids: answer(), dogs: answer(), cats: answer() },
      apartmentOk: answer(),
      specialNeeds: flag(),
      images: [],
      attribution: "Vir: Zavetisce",
    });
  }
  return animals;
}

// ---------------------------------------------------------------------------
// The definitions, written the plain way.
// ---------------------------------------------------------------------------

function slowGroupValue(
  animal: Animal,
  group: MultiGroup,
): string | undefined {
  switch (group) {
    case "sex":
      return animal.sex === "unknown" ? undefined : animal.sex;
    case "age": {
      const months = ageInMonths(animal, NOW);
      return months === undefined ? undefined : ageGroup(months);
    }
    case "size":
      return animal.size;
    case "energy":
      return animal.energy;
    case "shelter":
      return animal.shelter.id;
  }
}

function slowGroupOk(
  animal: Animal,
  group: MultiGroup,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  const value = slowGroupValue(animal, group);
  return value !== undefined && selected.includes(value);
}

function slowTogglesOk(animal: Animal, selected: readonly ToggleKey[]): boolean {
  if (selected.length === 0) return true;
  return TOGGLES.some(
    (toggle) => selected.includes(toggle.key) && toggle.matches(animal),
  );
}

function slowGoodWithOk(
  animal: Animal,
  selected: readonly GoodWithKey[],
): boolean {
  return selected.every((key) => goodWithMatches(animal, key));
}

function slowHomeOk(animal: Animal, selected: readonly HomeKey[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((key) => homeMatches(animal, key));
}

function slowCareOk(animal: Animal, selected: readonly CareKey[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((key) => careMatches(animal, key));
}

function slowSpeciesOk(animal: Animal, species: SpeciesFilter): boolean {
  return species === "all" || animal.species === species;
}

function slowApply(animals: Animal[], filters: Filters): Animal[] {
  return animals.filter(
    (animal) =>
      slowSpeciesOk(animal, filters.species) &&
      slowTogglesOk(animal, filters.toggles) &&
      slowGoodWithOk(animal, filters.goodWith) &&
      slowHomeOk(animal, filters.home) &&
      slowCareOk(animal, filters.care) &&
      GROUPS.every((group) => slowGroupOk(animal, group, filters[group])),
  );
}

/** The faceting rule as prose: everything applies except the axis being
 *  counted, one separate walk per axis. */
function slowPasses(
  animal: Animal,
  filters: Filters,
  applied: {
    toggles: readonly ToggleKey[];
    goodWith: readonly GoodWithKey[];
    home: readonly HomeKey[];
    care: readonly CareKey[];
    skipGroup?: MultiGroup;
  },
): boolean {
  return (
    slowSpeciesOk(animal, filters.species) &&
    slowTogglesOk(animal, applied.toggles) &&
    slowGoodWithOk(animal, applied.goodWith) &&
    slowHomeOk(animal, applied.home) &&
    slowCareOk(animal, applied.care) &&
    GROUPS.every(
      (group) =>
        group === applied.skipGroup ||
        slowGroupOk(animal, group, filters[group]),
    )
  );
}

function slowFacetCounts(
  animals: Animal[],
  filters: Filters,
): Record<MultiGroup, Map<string, number>> {
  const counts = {
    sex: new Map<string, number>(),
    age: new Map<string, number>(),
    size: new Map<string, number>(),
    energy: new Map<string, number>(),
    shelter: new Map<string, number>(),
  };
  for (const group of GROUPS) {
    const applied = { ...filters, skipGroup: group };
    for (const animal of animals) {
      if (!slowPasses(animal, filters, applied)) continue;
      const value = slowGroupValue(animal, group);
      if (value === undefined) continue;
      counts[group].set(value, (counts[group].get(value) ?? 0) + 1);
    }
  }
  return counts;
}

function slowToggleCounts(
  animals: Animal[],
  filters: Filters,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const toggle of TOGGLES) {
    const applied = { ...filters, toggles: [] };
    let total = 0;
    for (const animal of animals) {
      if (!slowPasses(animal, filters, applied)) continue;
      if (toggle.matches(animal)) total += 1;
    }
    counts.set(toggle.key, total);
  }
  return counts;
}

function slowGoodWithCounts(
  animals: Animal[],
  filters: Filters,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of GOOD_WITH_KEYS) {
    const applied = {
      ...filters,
      goodWith: filters.goodWith.filter((selected) => selected !== key),
    };
    let total = 0;
    for (const animal of animals) {
      if (!slowPasses(animal, filters, applied)) continue;
      if (goodWithMatches(animal, key)) total += 1;
    }
    counts.set(key, total);
  }
  return counts;
}

function slowHomeCounts(
  animals: Animal[],
  filters: Filters,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of HOME_KEYS) {
    const applied = {
      ...filters,
      home: filters.home.filter((selected) => selected !== key),
    };
    let total = 0;
    for (const animal of animals) {
      if (!slowPasses(animal, filters, applied)) continue;
      if (homeMatches(animal, key)) total += 1;
    }
    counts.set(key, total);
  }
  return counts;
}

function slowCareCounts(
  animals: Animal[],
  filters: Filters,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of CARE_KEYS) {
    const applied = {
      ...filters,
      care: filters.care.filter((selected) => selected !== key),
    };
    let total = 0;
    for (const animal of animals) {
      if (!slowPasses(animal, filters, applied)) continue;
      if (careMatches(animal, key)) total += 1;
    }
    counts.set(key, total);
  }
  return counts;
}

/** A chip's price, by its definition: run the filter without that one value
 *  and see how many more animals came back. */
function slowChipGains(
  animals: Animal[],
  filters: Filters,
): Map<string, number> {
  const gains = new Map<string, number>();
  const here = slowApply(animals, filters).length;
  const without = (key: string, next: Filters) => {
    gains.set(key, slowApply(animals, next).length - here);
  };
  for (const group of GROUPS) {
    for (const value of filters[group]) {
      without(`${group}:${value}`, {
        ...filters,
        [group]: (filters[group] as string[]).filter(
          (selected) => selected !== value,
        ),
      });
    }
  }
  for (const key of filters.toggles) {
    without(`toggles:${key}`, {
      ...filters,
      toggles: filters.toggles.filter((selected) => selected !== key),
    });
  }
  for (const key of filters.goodWith) {
    without(`goodWith:${key}`, {
      ...filters,
      goodWith: filters.goodWith.filter((selected) => selected !== key),
    });
  }
  for (const key of filters.home) {
    without(`home:${key}`, {
      ...filters,
      home: filters.home.filter((selected) => selected !== key),
    });
  }
  for (const key of filters.care) {
    without(`care:${key}`, {
      ...filters,
      care: filters.care.filter((selected) => selected !== key),
    });
  }
  return gains;
}

// ---------------------------------------------------------------------------
// The filter states to try.
// ---------------------------------------------------------------------------

// Read off FILTER_METADATA rather than listed again: this file claims to be
// the specification, and a hand-copied list quietly stops covering a value the
// moment one is added to the metadata.
const values = <Group extends "sex" | "age" | "size" | "energy">(
  group: Group,
): (typeof FILTER_METADATA)[Group][number]["value"][] =>
  FILTER_METADATA[group].map((option) => option.value);

const SEXES = values("sex");
const AGES = values("age");
const SIZES = values("size");
const ENERGIES = values("energy");
const SHELTERS = ["s1", "s2", "s3"];

/** Filter states worth trying: every section empty, holding one value, and
 *  holding several, since one and several are the two cases the fast paths
 *  treat differently. */
function states(): Filters[] {
  const next = lcg(715517);
  const some = <Value>(values: readonly Value[], odds: number): Value[] =>
    values.filter(() => next() < odds);
  const out: Filters[] = [EMPTY_FILTERS];
  // One section at a time, one value and then two, so a failure points at a
  // section rather than at a soup of them.
  const only = (part: Partial<Filters>): void => {
    out.push({ ...EMPTY_FILTERS, ...part });
  };
  only({ sex: ["male"] });
  only({ sex: ["male", "female"] });
  only({ age: ["mladicek"] });
  only({ age: ["mladicek", "senior"] });
  only({ size: ["small"] });
  only({ size: ["small", "large"] });
  only({ energy: ["calm"] });
  only({ energy: ["calm", "lively"] });
  only({ shelter: ["s1"] });
  only({ shelter: ["s1", "s2"] });
  only({ toggles: ["cip"] });
  only({ toggles: ["cip", "cepljenje"] });
  only({ goodWith: ["kids"] });
  only({ goodWith: ["kids", "dogs"] });
  only({ goodWith: ["kids", "dogs", "cats"] });
  only({ home: ["apartment"] });
  only({ care: ["patient"] });
  only({ species: "cat" });
  only({ species: "dog", size: ["medium"] });
  // A selection that matches nothing, which is where the "what is this
  // costing" answers have to stay honest.
  only({ shelter: ["s1"], goodWith: ["kids", "dogs", "cats"], age: ["senior"] });
  // And then several hundred mixed ones.
  for (let at = 0; at < 240; at += 1) {
    out.push({
      species: (["all", "all", "dog", "cat", "rabbit"] as SpeciesFilter[])[
        Math.floor(next() * 5)
      ],
      sex: some(SEXES, 0.35),
      age: some(AGES, 0.3),
      size: some(SIZES, 0.3),
      energy: some(ENERGIES, 0.3),
      shelter: some(SHELTERS, 0.35),
      toggles: some(TOGGLE_KEYS, 0.3),
      goodWith: some(GOOD_WITH_KEYS, 0.35),
      home: some(HOME_KEYS, 0.35),
      care: some(CARE_KEYS, 0.35),
    });
  }
  return out;
}

const ANIMALS = dataset(320);
const STATES = states();

function ids(animals: Animal[]): string {
  return animals.map((animal) => animal.id).join(",");
}

function entries(counts: Map<string, number>): [string, number][] {
  return [...counts].filter(([, total]) => total !== 0).sort();
}

function where(filters: Filters, at: number): string {
  return `state ${at}: ${JSON.stringify(filters)}`;
}

describe("the indexed engine answers what the definitions do", () => {
  it("agrees on the result across every state", () => {
    STATES.forEach((filters, at) => {
      expect(ids(applyFilters(ANIMALS, filters, NOW)), where(filters, at)).toBe(
        ids(slowApply(ANIMALS, filters)),
      );
    });
  });

  it("agrees on the facet counts, which it now reads off one walk", () => {
    STATES.forEach((filters, at) => {
      const fast = facetCounts(ANIMALS, filters, NOW);
      const slow = slowFacetCounts(ANIMALS, filters);
      for (const group of GROUPS) {
        expect(entries(fast[group]), `${group}, ${where(filters, at)}`).toEqual(
          entries(slow[group]),
        );
      }
    });
  });

  it("agrees on the health counts", () => {
    STATES.forEach((filters, at) => {
      expect(
        entries(toggleCounts(ANIMALS, filters, NOW)),
        where(filters, at),
      ).toEqual(entries(slowToggleCounts(ANIMALS, filters)));
    });
  });

  it("agrees on the household counts, which AND rather than OR", () => {
    STATES.forEach((filters, at) => {
      expect(
        entries(goodWithCounts(ANIMALS, filters, NOW)),
        where(filters, at),
      ).toEqual(entries(slowGoodWithCounts(ANIMALS, filters)));
    });
  });

  it("agrees on the home and care counts", () => {
    STATES.forEach((filters, at) => {
      expect(
        entries(homeCounts(ANIMALS, filters, NOW)),
        where(filters, at),
      ).toEqual(entries(slowHomeCounts(ANIMALS, filters)));
      expect(
        entries(careCounts(ANIMALS, filters, NOW)),
        where(filters, at),
      ).toEqual(entries(slowCareCounts(ANIMALS, filters)));
    });
  });

  it("prices every chip the way running the filter without it would", () => {
    STATES.forEach((filters, at) => {
      expect(
        entries(chipGains(ANIMALS, filters, NOW)),
        where(filters, at),
      ).toEqual(entries(slowChipGains(ANIMALS, filters)));
    });
  });

  it("prices a chip in a section of one as widening, and in a section of several as narrowing", () => {
    // The two branches the one-walk pricing turns on, named out loud so a
    // change that collapses them fails here with the reason attached.
    const alone: Filters = { ...EMPTY_FILTERS, sex: ["male"] };
    const among: Filters = { ...EMPTY_FILTERS, sex: ["male", "female"] };
    expect(chipGains(ANIMALS, alone, NOW).get("sex:male")).toBeGreaterThan(0);
    expect(chipGains(ANIMALS, among, NOW).get("sex:male")).toBeLessThan(0);
  });
});

describe("the index keeps answering for whatever date it is asked about", () => {
  it("moves an animal between age buckets when the date moves", () => {
    // The index holds a birth date as a month count and works the bucket out
    // per question, so the one column a clock moves has to move with it.
    const born: Animal[] = [
      {
        ...dataset(1)[0],
        id: "born",
        approximateAgeMonths: undefined,
        birthDate: "2026-01-01",
      },
    ];
    const young: Filters = { ...EMPTY_FILTERS, age: ["mladicek"] };
    const adult: Filters = { ...EMPTY_FILTERS, age: ["odrasel"] };
    expect(applyFilters(born, young, new Date("2026-06-01T00:00:00Z"))).toHaveLength(1);
    expect(applyFilters(born, adult, new Date("2026-06-01T00:00:00Z"))).toHaveLength(0);
    expect(applyFilters(born, young, new Date("2027-06-01T00:00:00Z"))).toHaveLength(0);
    expect(applyFilters(born, adult, new Date("2027-06-01T00:00:00Z"))).toHaveLength(1);
  });
});
