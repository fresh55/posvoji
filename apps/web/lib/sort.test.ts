import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { DEFAULT_ANIMAL_SORT, sortAnimals } from "./sort";

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
