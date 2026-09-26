import { describe, expect, it } from "vitest";
import type { Animal, Species } from "@posvoji/schema";
import {
  applyFilters,
  EMPTY_FILTERS,
  unansweredBand,
  type Filters,
} from "../filters";

const now = new Date("2026-09-21T12:00:00Z");
let seq = 0;
const animal = (species: Species, extra: Partial<Animal> = {}): Animal => {
  seq += 1;
  return {
    id: `a${seq}`,
    species,
    status: "available",
    images: [],
    attribution: "Fixture",
    source: {
      providerId: "fixture",
      sourceUrl: "https://example.test/animal",
      fetchedAt: now.toISOString(),
      firstSeenAt: "2020-01-01T00:00:00Z",
      lastSeenAt: now.toISOString(),
    },
    shelter: { id: "fixture", name: "Fixture", city: "Ljubljana" },
    ...extra,
  };
};
const only = (part: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...part });
const band = (animals: Animal[], filters: Filters) =>
  unansweredBand(animals, filters, now);
const ids = (animals: readonly Animal[]) => animals.map(({ id }) => id);

describe("unansweredBand on the household questions", () => {
  const yes = animal("dog", { goodWith: { kids: "yes" } });
  const no = animal("dog", { goodWith: { kids: "no" } });
  const unknown = animal("dog", { goodWith: { kids: "unknown" } });
  const silent = animal("dog");

  it("holds the animals nobody answered for, and not the one that said no", () => {
    const kids = only({ species: "dog", goodWith: ["kids"] });
    const pool = [yes, no, unknown, silent];
    expect(ids(applyFilters(pool, kids, now))).toEqual(ids([yes]));
    expect(band(pool, kids)).toEqual({
      animals: [unknown, silent],
      missing: [{ facet: "goodWith", key: "kids" }],
    });
  });

  it("asks both of two picks, and lets through only the ones left blank", () => {
    const both = animal("dog", { goodWith: { kids: "yes", cats: "yes" } });
    const kidsOnly = animal("dog", { goodWith: { kids: "yes" } });
    const catsOnly = animal("dog", { goodWith: { cats: "yes" } });
    const neither = animal("dog");
    const kidsNo = animal("dog", { goodWith: { kids: "no" } });
    const catsNo = animal("dog", { goodWith: { kids: "yes", cats: "no" } });
    const pool = [both, kidsOnly, catsOnly, neither, kidsNo, catsNo];
    const filters = only({ species: "dog", goodWith: ["kids", "cats"] });

    expect(ids(applyFilters(pool, filters, now))).toEqual(ids([both]));
    const result = band(pool, filters);
    expect(ids(result.animals)).toEqual(ids([kidsOnly, catsOnly, neither]));
    expect(result.missing).toEqual([
      { facet: "goodWith", key: "kids" },
      { facet: "goodWith", key: "cats" },
    ]);
  });

  it("names the one question the band lacks when only one is", () => {
    const pool = [
      animal("dog", { goodWith: { kids: "yes", cats: "yes" } }),
      animal("dog", { goodWith: { cats: "yes" } }),
      animal("dog", { goodWith: { cats: "no" } }),
      animal("dog", { goodWith: { cats: "yes" } }),
    ];
    // Every animal answers the cats question, so only the children's can be
    // what the band's animals lack.
    expect(
      band(pool, only({ goodWith: ["kids", "cats"] })).missing,
    ).toEqual([{ facet: "goodWith", key: "kids" }]);
  });

  it("reads an only pet as a no to the animal questions and to nothing else", () => {
    const onlyPet = animal("dog", { adoptionRequirements: { onlyPet: true } });
    const silent = animal("dog");
    expect(ids(band([onlyPet, silent], only({ goodWith: ["cats"] })).animals)).toEqual(
      ids([silent]),
    );
    expect(ids(band([onlyPet, silent], only({ goodWith: ["dogs"] })).animals)).toEqual(
      ids([silent]),
    );
    expect(ids(band([onlyPet, silent], only({ goodWith: ["kids"] })).animals)).toEqual(
      ids([onlyPet, silent]),
    );
  });

  it("reads a home without young children as an answer about children alone", () => {
    const noYoungKids = animal("dog", { adoptionRequirements: { noYoungKids: true } });
    const silent = animal("dog");
    const pool = [noYoungKids, silent];
    expect(applyFilters(pool, only({ goodWith: ["kids"] }), now)).toEqual([]);
    expect(ids(band(pool, only({ goodWith: ["kids"] })).animals)).toEqual(ids([silent]));
    expect(ids(band(pool, only({ goodWith: ["cats"] })).animals)).toEqual(
      ids([noYoungKids, silent]),
    );
  });
});

describe("unansweredBand on the test results", () => {
  const cats = [
    animal("cat", { medical: { fiv: "negative", felv: "negative" } }),
    animal("cat", { medical: { fiv: "negative" } }),
    animal("cat", { medical: { felv: "negative" } }),
    animal("cat", { medical: { fiv: "unknown", felv: "unknown" } }),
    animal("cat", { medical: { fiv: "positive" } }),
    animal("cat", { medical: { fiv: "negative", felv: "positive" } }),
  ];
  const [clear, fivOnly, felvOnly, untested, fivPositive, felvPositive] = cats;

  it("holds the untested and never a positive", () => {
    const result = band(cats, only({ species: "cat", toggles: ["brez-fiv"] }));
    expect(ids(result.animals)).toEqual(ids([felvOnly, untested]));
    expect(result.missing).toEqual([{ facet: "toggles", key: "brez-fiv" }]);
  });

  it("asks both tests of each cat when both are picked", () => {
    const result = band(
      cats,
      only({ species: "cat", toggles: ["brez-fiv", "brez-felv"] }),
    );
    expect(ids(applyFilters(cats, only({ toggles: ["brez-fiv", "brez-felv"] }), now))).toEqual(
      ids([clear]),
    );
    expect(ids(result.animals)).toEqual(ids([fivOnly, felvOnly, untested]));
    expect(result.animals).not.toContain(fivPositive);
    expect(result.animals).not.toContain(felvPositive);
  });

  it("measures each test over the tab, not over the cats the other one leaves", () => {
    // Every cat tested for FeLV was tested for FIV as well, so measured over
    // the FeLV negatives, FIV is answered for every one of them, and the other
    // way round too: the two picks together offered nothing, while half the
    // tab has neither result.
    const tested = Array.from({ length: 6 }, () =>
      animal("cat", { medical: { fiv: "negative", felv: "negative" } }),
    );
    const blank = Array.from({ length: 6 }, () => animal("cat"));
    const result = band(
      [...tested, ...blank],
      only({ species: "cat", toggles: ["brez-fiv", "brez-felv"] }),
    );
    expect(ids(result.animals)).toEqual(ids(blank));
  });

  it("never asks a dog for a test result, on a tab that shows both", () => {
    const dog = animal("dog");
    const cat = animal("cat");
    // pruneHiddenFilters keeps Brez FIV off Vse; asked directly, a dog is
    // still not missing a result nobody asked it for.
    expect(ids(band([dog, cat], only({ toggles: ["brez-fiv"] })).animals)).toEqual(
      ids([cat]),
    );
  });
});

describe("unansweredBand on the groups", () => {
  it("holds a blank value, and not a value that differs", () => {
    const calm = animal("dog", { energy: "calm" });
    const balanced = animal("dog", { energy: "balanced" });
    const lively = animal("dog", { energy: "lively" });
    const blank = animal("dog");
    const pool = [calm, balanced, lively, blank];

    expect(ids(band(pool, only({ energy: ["calm"] })).animals)).toEqual(ids([blank]));
    // An OR group asks for either value, and the blank one answers neither.
    const either = band(pool, only({ energy: ["calm", "balanced"] }));
    expect(ids(either.animals)).toEqual(ids([blank]));
    expect(either.missing).toEqual([{ facet: "energy" }]);
  });

  it("holds a wait with no date to read, and not a stay under the threshold", () => {
    const long = animal("dog", { intakeDate: "2024-01-01" });
    const recent = animal("dog", { intakeDate: "2026-08-01" });
    const undated = animal("dog");
    const future = animal("dog", { intakeDate: "2026-12-01" });
    const result = band(
      [long, recent, undated, future],
      only({ waiting: ["over-1-year"] }),
    );
    expect(ids(result.animals)).toEqual(ids([undated, future]));
    expect(result.missing).toEqual([{ facet: "waiting" }]);
  });

  it("holds an animal with no age, and not one of another age", () => {
    const young = animal("cat", { approximateAgeMonths: 4 });
    const adult = animal("cat", { approximateAgeMonths: 40 });
    const stated = animal("cat", { lifeStage: "young" });
    const ageless = animal("cat");
    const result = band([young, adult, stated, ageless], only({ age: ["mladicek"] }));
    expect(ids(result.animals)).toEqual(ids([ageless]));
  });

  // A stated "adult" could be Mlad or Odrasel, so no age group files it; but
  // it is still an answer, and it says neither Mladiček nor Senior.
  it("holds a stated adult only where an adult could answer the pick", () => {
    const statedAdult = animal("cat", { lifeStage: "adult" });
    const ageless = animal("cat");
    const pool = [statedAdult, ageless];
    expect(ids(band(pool, only({ age: ["mladicek"] })).animals)).toEqual(
      ids([ageless]),
    );
    expect(ids(band(pool, only({ age: ["senior"] })).animals)).toEqual(
      ids([ageless]),
    );
    expect(ids(band(pool, only({ age: ["mlad"] })).animals)).toEqual(
      ids([statedAdult, ageless]),
    );
    expect(
      ids(band(pool, only({ age: ["mladicek", "odrasel"] })).animals),
    ).toEqual(ids([statedAdult, ageless]));
  });

  // Where a number is on record the stated stage is not read at all.
  it("reads an age before a stated adult", () => {
    const aged = animal("cat", { lifeStage: "adult", approximateAgeMonths: 4 });
    expect(band([aged, animal("cat")], only({ age: ["senior"] })).animals).not.toContain(
      aged,
    );
  });

  it("never asks a cat its size, on Vse either", () => {
    const small = animal("dog", { size: "small" });
    const unsizedDog = animal("dog");
    const unsizedRabbit = animal("rabbit");
    const sizedCat = animal("cat", { size: "small" });
    const unsizedCat = animal("cat");
    const result = band(
      [small, unsizedDog, unsizedRabbit, sizedCat, unsizedCat],
      only({ size: ["small"] }),
    );
    expect(ids(result.animals)).toEqual(ids([unsizedDog, unsizedRabbit]));
  });

  it("combines a group with a household question, and names neither alone", () => {
    const smallKids = animal("dog", { size: "small", goodWith: { kids: "yes" } });
    const unsizedKids = animal("dog", { goodWith: { kids: "yes" } });
    const smallSilent = animal("dog", { size: "small" });
    const unsizedSilent = animal("dog");
    const largeSilent = animal("dog", { size: "large" });
    // All but one of the dogs good with children have a size. Measured with
    // that pick on, the size question looked answered, and the band held the
    // small dog alone.
    const sizedKids = Array.from({ length: 10 }, () =>
      animal("dog", { size: "large", goodWith: { kids: "yes" } }),
    );
    const result = band(
      [smallKids, unsizedKids, smallSilent, unsizedSilent, largeSilent, ...sizedKids],
      only({ species: "dog", size: ["small"], goodWith: ["kids"] }),
    );
    expect(ids(result.animals)).toEqual(ids([unsizedKids, smallSilent, unsizedSilent]));
    expect(result.missing).toEqual([
      { facet: "size" },
      { facet: "goodWith", key: "kids" },
    ]);
  });
});

describe("which questions the band may leave unanswered", () => {
  // The grid narrows the list by a search before it asks for the band. One
  // unsexed animal among the six a query found is a sixth, but the question
  // is Spol's over the tab, where it is one in eleven.
  it("measures a question over the population it is given, not the list searched", () => {
    const sexed = Array.from({ length: 10 }, (_, n) =>
      animal("dog", { sex: n % 2 === 0 ? "male" : "female" }),
    );
    const unsexed = animal("dog", { sex: "unknown" });
    const dataset = [...sexed, unsexed];
    const found = [...sexed.slice(0, 5), unsexed];
    const female = only({ sex: ["female"] });
    expect(ids(unansweredBand(found, female, now).animals)).toEqual(ids([unsexed]));
    expect(unansweredBand(found, female, now, dataset).animals).toEqual([]);
  });

  it("keeps a question strict while its blanks are under a tenth of the animals asked", () => {
    const sexed = (count: number) =>
      Array.from({ length: count }, (_, n) =>
        animal("dog", { sex: n % 2 === 0 ? "male" : "female" }),
      );
    const unsexed = animal("dog", { sex: "unknown" });
    const female = only({ sex: ["female"] });
    // One in eleven is under a tenth; one in ten is a tenth.
    expect(band([...sexed(10), unsexed], female).animals).toEqual([]);
    expect(ids(band([...sexed(9), unsexed], female).animals)).toEqual(
      ids([unsexed]),
    );
  });

  it("measures a question over the shelters picked", () => {
    // Three of 45 cats have no age, under a tenth of the tab, and all three
    // are at the one shelter, where they are three in five.
    const here = { id: "tu", name: "Tu", city: "Ljubljana" };
    const aged = Array.from({ length: 40 }, () =>
      animal("cat", { approximateAgeMonths: 4 }),
    );
    const blank = Array.from({ length: 3 }, () => animal("cat", { shelter: here }));
    const kitten = animal("cat", { shelter: here, approximateAgeMonths: 3 });
    const adult = animal("cat", { shelter: here, approximateAgeMonths: 30 });
    const pool = [...aged, ...blank, kitten, adult];
    const young = only({ species: "cat", age: ["mladicek"] });

    expect(band(pool, young).animals).toEqual([]);
    expect(ids(band(pool, { ...young, shelter: ["tu"] }).animals)).toEqual(ids(blank));
  });

  it("asks nothing of Spol with both sexes picked, so there is nothing to relax", () => {
    const pool = [
      animal("dog", { sex: "male" }),
      animal("dog", { sex: "female" }),
      animal("dog", { sex: "unknown" }),
    ];
    const both = only({ sex: ["male", "female"] });
    expect(applyFilters(pool, both, now)).toHaveLength(3);
    expect(band(pool, both).animals).toEqual([]);
  });

  it("offers nothing while nothing is picked", () => {
    expect(band([animal("dog"), animal("cat")], EMPTY_FILTERS)).toEqual({
      animals: [],
      missing: [],
    });
  });
});

describe("what the band always applies as the result does", () => {
  it("keeps to the species tab", () => {
    const dog = animal("dog");
    const cat = animal("cat");
    expect(ids(band([dog, cat], only({ species: "dog", goodWith: ["kids"] })).animals)).toEqual(
      ids([dog]),
    );
  });

  it("keeps to the shelters picked", () => {
    const here = animal("dog", { shelter: { id: "tu", name: "Tu", city: "Ljubljana" } });
    const there = animal("dog");
    expect(
      ids(band([here, there], only({ goodWith: ["kids"], shelter: ["tu"] })).animals),
    ).toEqual(ids([here]));
  });

  it("keeps to the needs offered", () => {
    const needs = animal("dog", { adoptionRequirements: { experiencedCarer: true } });
    const noNeed = animal("dog");
    expect(
      ids(
        band([needs, noNeed], only({ goodWith: ["kids"], care: ["experienced-carer"] }))
          .animals,
      ),
    ).toEqual(ids([needs]));
  });
});

describe("no answer that contradicts a pick enters the band", () => {
  // Every combination of three answers (yes, no, blank) to the household
  // question, the FIV result and the size, times two species.
  const KIDS = [{ kids: "yes" }, { kids: "no" }, undefined] as const;
  const FIV = ["negative", "positive", undefined] as const;
  const SIZE = ["small", "large", undefined] as const;
  const pool = (["dog", "cat"] as const).flatMap((species) =>
    KIDS.flatMap((goodWith) =>
      FIV.flatMap((fiv) =>
        SIZE.map((size) =>
          animal(species, {
            ...(goodWith && { goodWith }),
            ...(fiv && { medical: { fiv } }),
            ...(size && { size }),
          }),
        ),
      ),
    ),
  );

  it.each<Partial<Filters>>([
    { goodWith: ["kids"] },
    { species: "cat", toggles: ["brez-fiv"] },
    { size: ["small"] },
    { species: "dog", size: ["small"], goodWith: ["kids"] },
    { species: "cat", goodWith: ["kids"], toggles: ["brez-fiv"] },
  ])("%o", (part) => {
    const filters = only(part);
    const result = band(pool, filters).animals;
    const shown = new Set(applyFilters(pool, filters, now));
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(shown.has(entry)).toBe(false);
      if (filters.goodWith.length > 0) expect(entry.goodWith?.kids).not.toBe("no");
      if (filters.toggles.length > 0) {
        expect(entry.species).toBe("cat");
        expect(entry.medical?.fiv).not.toBe("positive");
      }
      if (filters.size.length > 0) {
        expect(entry.species).not.toBe("cat");
        expect(entry.size).not.toBe("large");
      }
    }
  });
});
