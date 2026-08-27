import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { cityAt } from "./geo";
import {
  ANIMAL_SORTS,
  DEFAULT_ANIMAL_SORT,
  effectiveSort,
  parseSort,
  serializeSort,
  sortAnimals,
  type AnimalSort,
} from "./sort";

// An id and whatever the case under test is about. Named fields rather than a
// row of positional optionals: the sorts read five different properties
// between them, and a call site spelling three of them as `undefined` to reach
// the fourth says nothing about what it is testing.
function animal(id: string, overrides: Partial<Animal> = {}): Animal {
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
    species: "cat",
    status: "available",
    images: [],
    attribution: "Source: Shelter",
    ...overrides,
  };
}

const animals = [
  animal("unknown", { name: "Živa" }),
  animal("new", { intakeDate: "2026-08-01", name: "Bina" }),
  animal("old", { intakeDate: "2021-03-12", name: "Čarli" }),
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
      animal("adult", { approximateAgeMonths: 48 }),
      animal("young", { birthDate: "2026-04-16" }),
      animal("senior", { approximateAgeMonths: 120 }),
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
      animal("b", { intakeDate: "2025-01-01", name: "Same" }),
      animal("a", { intakeDate: "2025-01-01", name: "Same" }),
    ];

    expect(sortAnimals(tied).map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("puts hold and unknown animals last regardless of how long they waited", () => {
    const mixed = [
      // Longest-waiting available animal would normally sort first...
      animal("hold-oldest", { intakeDate: "2019-01-01", status: "hold" }),
      animal("available-newer", { intakeDate: "2024-01-01" }),
      animal("unknown-status", { status: "unknown" }),
      animal("available-oldest", { intakeDate: "2020-01-01" }),
    ];

    expect(sortAnimals(mixed).map(({ id }) => id)).toEqual([
      "available-oldest",
      "available-newer",
      "hold-oldest",
      "unknown-status",
    ]);
  });

  it("keeps the status partition under every sort order, not only the default", () => {
    const mixed = [
      animal("adopted-a", { name: "A", status: "adopted" }),
      animal("available-z", { name: "Z" }),
      animal("reserved-b", { name: "B", status: "reserved" }),
      animal("available-a", { name: "A2" }),
    ];

    const byName = sortAnimals(mixed, "name", "sl").map(({ id }) => id);
    // Available animals still come first, sorted by name between themselves;
    // the two off-market ones follow, also sorted by name between themselves.
    expect(byName).toEqual([
      "available-a",
      "available-z",
      "adopted-a",
      "reserved-b",
    ]);
  });
});

describe("sortAnimals by distance", () => {
  // A shelter's town is the whole of its position, so an animal is placed by
  // overwriting the helper's default Celje.
  function inTown(id: string, city: string): Animal {
    const base = animal(id);
    return { ...base, shelter: { ...base.shelter, city } };
  }

  const ljubljana = cityAt("Ljubljana")!;

  it("orders animals by how far their shelter's town is from the origin", () => {
    const spread = [
      inTown("maribor", "Maribor"),
      inTown("vrhnika", "Vrhnika"),
      inTown("celje", "Celje"),
    ];

    expect(
      sortAnimals(spread, "nearest", "sl", undefined, ljubljana).map(
        ({ id }) => id,
      ),
    ).toEqual(["vrhnika", "celje", "maribor"]);
  });

  it("puts animals whose town cannot be placed after every one that can", () => {
    const spread = [
      inTown("nowhere", "Nekje na Gorenjskem"),
      inTown("maribor", "Maribor"),
      inTown("vrhnika", "Vrhnika"),
    ];

    expect(
      sortAnimals(spread, "nearest", "sl", undefined, ljubljana).map(
        ({ id }) => id,
      ),
    ).toEqual(["vrhnika", "maribor", "nowhere"]);
  });

  it("breaks a tie in one town by id, like every other order here", () => {
    const tied = [
      inTown("b", "Celje"),
      inTown("a", "Celje"),
      inTown("z", "Vrhnika"),
    ];

    expect(
      sortAnimals(tied, "nearest", "sl", undefined, ljubljana).map(
        ({ id }) => id,
      ),
    ).toEqual(["z", "a", "b"]);
  });

  it("leaves unplaceable animals in id order too", () => {
    const nowhere = [
      inTown("b", "Nekje"),
      inTown("a", "Drugje"),
    ];

    expect(
      sortAnimals(nowhere, "nearest", "sl", undefined, ljubljana).map(
        ({ id }) => id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("falls back to the default order when nobody granted an origin", () => {
    const spread = [
      inTown("maribor", "Maribor"),
      inTown("vrhnika", "Vrhnika"),
    ];
    const dated = [
      { ...spread[0]!, intakeDate: "2026-08-01" },
      { ...spread[1]!, intakeDate: "2021-03-12" },
    ];

    expect(sortAnimals(dated, "nearest").map(({ id }) => id)).toEqual(
      sortAnimals(dated, DEFAULT_ANIMAL_SORT).map(({ id }) => id),
    );
    expect(effectiveSort("nearest", undefined)).toBe(DEFAULT_ANIMAL_SORT);
    expect(effectiveSort("nearest", ljubljana)).toBe("nearest");
    // Only nearest is conditional; nothing else loses its order for want of a
    // point to measure from.
    expect(effectiveSort("name", undefined)).toBe("name");
  });

  it("leaves the input untouched, like every other order here", () => {
    const spread = [inTown("maribor", "Maribor"), inTown("vrhnika", "Vrhnika")];

    sortAnimals(spread, "nearest", "sl", undefined, ljubljana);

    expect(spread.map(({ id }) => id)).toEqual(["maribor", "vrhnika"]);
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
      nearest: "najblizje",
    };
    for (const [sort, slug] of Object.entries(slugs) as [
      AnimalSort,
      string,
    ][]) {
      expect(parseSort(`razvrsti=${slug}`)).toBe(sort);
    }
  });
});
