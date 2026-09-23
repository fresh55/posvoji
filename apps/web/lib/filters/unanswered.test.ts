import { describe, expect, it } from "vitest";
import type { Animal, Species } from "@posvoji/schema";
import {
  applyFilters,
  careOptions,
  EMPTY_FILTERS,
  facetCounts,
  namesUnanswered,
  thinnestAnswer,
  unansweredCounts,
  visibleGroups,
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

describe("availability", () => {
  const free = animal("dog");
  const unsure = animal("dog", { status: "unknown" });
  const quarantine = animal("dog", { status: "hold" });
  const reserved = animal("dog", { status: "reserved" });
  const gone = animal("dog", { status: "adopted" });
  const animals = [free, unsure, quarantine, reserved, gone];

  it("keeps the animals that can be adopted now, an unknown status among them", () => {
    expect(
      applyFilters(animals, only({ availability: ["available"] }), now),
    ).toEqual([free, unsure]);
  });

  it("counts them before anything is pressed", () => {
    expect(facetCounts(animals, EMPTY_FILTERS, now).availability.get("available")).toBe(2);
  });

  it("shows the section only while the list has someone to leave out", () => {
    const panel = (pool: Animal[]) =>
      visibleGroups(pool, EMPTY_FILTERS, now, true).availability;
    expect(panel(animals)).toBe(true);
    expect(panel([free, unsure])).toBe(false);
    // A pick holds it open, so it can be taken off.
    expect(
      visibleGroups([free], only({ availability: ["available"] }), now, true)
        .availability,
    ).toBe(true);
  });

  it("is never a question with an unanswered part", () => {
    expect(unansweredCounts(animals, EMPTY_FILTERS, now).groups.availability).toEqual({
      asked: 5,
      unanswered: 0,
    });
  });
});

describe("size is a question for dogs and the rest, never for a cat", () => {
  const smallDog = animal("dog", { size: "small" });
  const smallCat = animal("cat", { size: "small" });
  const rabbit = animal("rabbit", { size: "small" });
  const unsizedDog = animal("dog");
  const unsizedCat = animal("cat");
  const animals = [smallDog, smallCat, rabbit, unsizedDog, unsizedCat];

  it("leaves a cat's listed size out of the answer on Vse", () => {
    expect(applyFilters(animals, only({ size: ["small"] }), now)).toEqual([
      smallDog,
      rabbit,
    ]);
    expect(facetCounts(animals, EMPTY_FILTERS, now).size.get("small")).toBe(2);
  });

  it("does not count a cat as missing a size nobody asked it for", () => {
    expect(unansweredCounts(animals, EMPTY_FILTERS, now).groups.size).toEqual({
      asked: 3,
      unanswered: 1,
    });
  });
});

describe("unansweredCounts", () => {
  it("tells a missing intake date from a stay under six months", () => {
    const recent = animal("cat", { intakeDate: "2026-08-01" });
    const long = animal("cat", { intakeDate: "2024-01-01" });
    const undated = animal("cat");
    const future = animal("cat", { intakeDate: "2026-12-01" });
    expect(
      unansweredCounts([recent, long, undated, future], EMPTY_FILTERS, now).groups.waiting,
    ).toEqual({ asked: 4, unanswered: 2 });
  });

  it("counts each household question on its own, and only-pet as an answer to two", () => {
    const kidsYes = animal("dog", { goodWith: { kids: "yes" } });
    const kidsNo = animal("dog", { goodWith: { kids: "no" } });
    const silent = animal("dog");
    const onlyPet = animal("dog", { adoptionRequirements: { onlyPet: true } });
    const tally = unansweredCounts([kidsYes, kidsNo, silent, onlyPet], EMPTY_FILTERS, now);
    expect(tally.goodWith.kids).toEqual({ asked: 4, unanswered: 2 });
    expect(tally.goodWith.dogs).toEqual({ asked: 4, unanswered: 3 });
    expect(tally.goodWith.cats).toEqual({ asked: 4, unanswered: 3 });
  });

  it("counts what a picked household question is hiding, over the list without it", () => {
    const yes = animal("dog", { goodWith: { kids: "yes" } });
    const no = animal("dog", { goodWith: { kids: "no" } });
    const silent = animal("dog");
    const tally = unansweredCounts(
      [yes, no, silent],
      only({ goodWith: ["kids"] }),
      now,
    );
    // The pick shows one animal and is hiding the silent one for no answer,
    // and the one that said no for its answer.
    expect(tally.goodWith.kids).toEqual({ asked: 3, unanswered: 1 });
  });

  it("asks a test result of cats alone", () => {
    const tested = animal("cat", { medical: { fiv: "negative" } });
    const positive = animal("cat", { medical: { fiv: "positive" } });
    const untested = animal("cat", { medical: { fiv: "unknown" } });
    const dog = animal("dog", { medical: { fiv: "negative" } });
    expect(
      unansweredCounts([tested, positive, untested, dog], EMPTY_FILTERS, now).toggles["brez-fiv"],
    ).toEqual({ asked: 3, unanswered: 1 });
  });

  it("measures a group over the list without that group, like its counts", () => {
    const calmSmall = animal("dog", { energy: "calm", size: "small" });
    const calmUnsized = animal("dog", { energy: "calm" });
    const livelyUnsized = animal("dog", { energy: "lively" });
    const tally = unansweredCounts(
      [calmSmall, calmUnsized, livelyUnsized],
      only({ energy: ["calm"], size: ["small"] }),
      now,
    );
    // Size is measured with energy on: two calm dogs, one unsized.
    expect(tally.groups.size).toEqual({ asked: 2, unanswered: 1 });
    // Energy is measured with size on: one small dog, answered.
    expect(tally.groups.energy).toEqual({ asked: 1, unanswered: 0 });
  });
});

describe("namesUnanswered", () => {
  it("names a count from a tenth of the animals asked", () => {
    expect(namesUnanswered({ asked: 491, unanswered: 8 })).toBe(false);
    expect(namesUnanswered({ asked: 100, unanswered: 10 })).toBe(true);
    expect(namesUnanswered({ asked: 124, unanswered: 121 })).toBe(true);
    expect(namesUnanswered({ asked: 0, unanswered: 0 })).toBe(false);
  });
});

describe("thinnestAnswer", () => {
  const dogs = [
    animal("dog", { goodWith: { kids: "yes", cats: "yes" }, sex: "male" }),
    animal("dog", { goodWith: { cats: "no" }, sex: "male" }),
    animal("dog", { goodWith: { cats: "yes" }, sex: "female" }),
    animal("dog", { sex: "female" }),
    animal("cat", { goodWith: { kids: "yes" } }),
  ];

  it("names the answered question with the least behind it on the tab", () => {
    expect(
      thinnestAnswer(dogs, only({ species: "dog", goodWith: ["kids", "cats"], sex: ["male"] }), now),
    ).toEqual({ facet: "goodWith", key: "kids", asked: 4, answered: 1 });
  });

  it("says nothing about a question answered for nearly everyone", () => {
    expect(thinnestAnswer(dogs, only({ species: "dog", sex: ["female"] }), now)).toBeUndefined();
  });

  it("names a question once half the animals asked have no answer", () => {
    const pool = [
      animal("dog", { energy: "calm" }),
      animal("dog", { energy: "lively" }),
      animal("dog"),
      animal("dog"),
    ];
    const calm = only({ species: "dog", energy: ["calm"] });
    expect(thinnestAnswer(pool, calm, now)).toEqual({
      facet: "energy",
      asked: 4,
      answered: 2,
    });
    // Three answers in five: thin, but not the likeliest reason nothing
    // matched, and a line that names it would point the wrong way.
    expect(
      thinnestAnswer([...pool, animal("dog", { energy: "calm" })], calm, now),
    ).toBeUndefined();
  });

  it("says nothing about a question asked of one animal", () => {
    expect(
      thinnestAnswer([animal("dog")], only({ species: "dog", energy: ["calm"] }), now),
    ).toBeUndefined();
  });
});

describe("careOptions", () => {
  it("describes Izkušeno roko by the animals the tab holds", () => {
    const line = (species: Filters["species"]) =>
      careOptions("sl", species).find(({ key }) => key === "experienced-carer")
        ?.description;
    expect(line("all")).toBe("Močni ali nezaupljivi psi");
    expect(line("dog")).toBe("Močni ali nezaupljivi psi");
    expect(line("cat")).toBe("Zelo plahe mačke");
  });
});
