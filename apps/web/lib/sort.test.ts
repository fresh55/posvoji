import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  ANIMAL_SORTS,
  DEFAULT_ANIMAL_SORT,
  parseSort,
  serializeSort,
  sortAnimals,
  type AnimalSort,
} from "./sort";

function animal(
  id: string,
  intakeDate?: string,
  name?: string,
  age?: Pick<Animal, "approximateAgeMonths" | "birthDate">,
): Animal {
  return {
    id,
    source: {
      providerId: "shelter",
      sourceUrl: `https://example.org/${id}`,
      fetchedAt: "2026-08-16T00:00:00Z",
      firstSeenAt: "2026-08-16T00:00:00Z",
      lastSeenAt: "2026-08-16T00:00:00Z",
    },
    shelter: { id: "shelter", name: "Shelter", city: "Celje" },
    name,
    species: "cat",
    status: "available",
    intakeDate,
    ...age,
    images: [],
    attribution: "Source: Shelter",
  };
}

const animals = [
  animal("unknown", undefined, "Živa"),
  animal("new", "2026-08-01", "Bina"),
  animal("old", "2021-03-12", "Čarli"),
];

describe("sortAnimals", () => {
  it("defaults to the animals waiting longest and leaves the input untouched", () => {
    const sorted = sortAnimals(animals);

    expect(DEFAULT_ANIMAL_SORT).toBe("longest-in-shelter");
    expect(sorted.map(({ id }) => id)).toEqual(["old", "new", "unknown"]);
    expect(animals.map(({ id }) => id)).toEqual(["unknown", "new", "old"]);
  });

  it("can show newest known arrivals first without promoting unknown dates", () => {
    expect(
      sortAnimals(animals, "newest-arrivals").map(({ id }) => id),
    ).toEqual(["new", "old", "unknown"]);
  });

  it("sorts known names using the selected locale and keeps unnamed animals last", () => {
    expect(sortAnimals(animals, "name", "sl").map(({ id }) => id)).toEqual([
      "new",
      "old",
      "unknown",
    ]);
  });

  it("sorts ages in either direction and keeps unknown ages last", () => {
    const byAge = [
      animal("unknown"),
      animal("adult", undefined, undefined, { approximateAgeMonths: 48 }),
      animal("young", undefined, undefined, { birthDate: "2026-04-16" }),
      animal("senior", undefined, undefined, { approximateAgeMonths: 120 }),
    ];
    const now = new Date("2026-08-16T00:00:00Z");

    expect(
      sortAnimals(byAge, "youngest", "sl", now).map(({ id }) => id),
    ).toEqual(["young", "adult", "senior", "unknown"]);
    expect(sortAnimals(byAge, "oldest", "sl", now).map(({ id }) => id)).toEqual([
      "senior",
      "adult",
      "young",
      "unknown",
    ]);
  });

  it("uses the id as a stable tie-breaker", () => {
    const tied = [
      animal("b", "2025-01-01", "Same"),
      animal("a", "2025-01-01", "Same"),
    ];

    expect(sortAnimals(tied).map(({ id }) => id)).toEqual(["a", "b"]);
  });
});

describe("sort URL codec", () => {
  it("serializes the default sort to nothing, like empty filters", () => {
    expect(serializeSort(DEFAULT_ANIMAL_SORT)).toBe("");
    expect(parseSort("")).toBe(DEFAULT_ANIMAL_SORT);
  });

  it("round-trips every non-default sort through a Slovenian ASCII slug", () => {
    for (const sort of ANIMAL_SORTS) {
      if (sort === DEFAULT_ANIMAL_SORT) continue;
      const query = serializeSort(sort);
      expect(query).toMatch(/^razvrsti=[a-z]+$/);
      expect(parseSort(query)).toBe(sort);
    }
  });

  it("falls back to the default for an unknown or garbled slug", () => {
    expect(parseSort("razvrsti=nekaj-cudnega")).toBe(DEFAULT_ANIMAL_SORT);
    expect(parseSort("razvrsti=")).toBe(DEFAULT_ANIMAL_SORT);
  });

  it("still parses the default's own slug back to the default", () => {
    const slugs: Record<AnimalSort, string> = {
      "longest-in-shelter": "cakajoci",
      "newest-arrivals": "novi",
      youngest: "najmlajsi",
      oldest: "najstarejsi",
      name: "ime",
    };
    for (const [sort, slug] of Object.entries(slugs) as [
      AnimalSort,
      string,
    ][]) {
      expect(parseSort(`razvrsti=${slug}`)).toBe(sort);
    }
  });
});
