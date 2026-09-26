// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import { animalsForClient } from "@/lib/dataset";
import { EMPTY_FILTERS, groupOptions, type Filters } from "@/lib/filters";
import { useAnimalFilterModel } from "./use-animal-filter-model";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const NOOP = () => undefined;

function dog(
  id: string,
  energy: Animal["energy"],
  size: Animal["size"],
): Animal {
  return {
    id,
    energy,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Test shelter", city: "Ljubljana" },
    name: id,
    species: "dog",
    sex: "male",
    size,
    approximateAgeMonths: 24,
    status: "available",
    medical: {},
    images: [],
    attribution: "Test fixture",
  };
}

// The calm dog is medium and the lively one large, so Velika leaves Miren
// reading 0.
const ANIMALS = animalsForClient([
  dog("dog-calm", "calm", "medium"),
  dog("dog-lively", "lively", "large"),
]);

const DOGS: Filters = { ...EMPTY_FILTERS, species: "dog" };

/** The model as the grid runs it, and how many times it has rendered. */
function renderModel(filters: Filters) {
  let renders = 0;
  const hook = renderHook(
    ({ filters }: { filters: Filters }) => {
      renders += 1;
      return useAnimalFilterModel({
        animals: ANIMALS,
        logos: {},
        reference: NOW,
        locale: "sl",
        resultCount: 0,
        actions: {
          filters,
          toggle: NOOP,
          toggleProperty: NOOP,
          toggleGoodWith: NOOP,
          toggleManyGoodWith: NOOP,
          toggleCare: NOOP,
          toggleManyCare: NOOP,
        },
      });
    },
    { initialProps: { filters } },
  );
  return { ...hook, renders: () => renders };
}

describe("the chips row", () => {
  // The panel's order, Kje first (SECTION_ORDER in filters/filter-groups.tsx),
  // whatever order the answers were given in or the URL holds them in.
  it("reads every facet's chips in the order the panel asks", () => {
    const first = (group: Parameters<typeof groupOptions>[0]) =>
      groupOptions(group, [], "sl")[0].value;
    const everything = {
      ...DOGS,
      waiting: [first("waiting")],
      care: ["patient"],
      sex: [first("sex")],
      coatLength: [first("coatLength")],
      energy: [first("energy")],
      toggles: ["brez-fiv"],
      coatColor: [first("coatColor")],
      goodWith: ["kids"],
      size: [first("size")],
      age: [first("age")],
      shelter: ["test-shelter"],
    } as Filters;
    const { result } = renderModel(everything);

    expect(result.current.chips.map(({ facet }) => facet)).toEqual([
      "shelter",
      "age",
      "size",
      "goodWith",
      "toggles",
      "energy",
      "sex",
      "coatColor",
      "coatLength",
      "care",
      "waiting",
    ]);
  });
});

describe("the picks the sidebar keeps drawn", () => {
  it("keeps a pick that read 0 once it comes off, until the tab changes", () => {
    const both: Filters = { ...DOGS, energy: ["calm", "lively"] };
    const { result, rerender } = renderModel(both);
    expect(result.current.keptPicks).toEqual({});

    // Velika: Miren reads 0, drawn only because it is picked.
    rerender({ filters: { ...both, size: ["large"] } });
    expect(result.current.keptPicks).toEqual({ energy: ["calm"] });

    // Off, and still kept, so its row stays where it was.
    rerender({ filters: { ...DOGS, energy: ["lively"], size: ["large"] } });
    expect(result.current.keptPicks).toEqual({ energy: ["calm"] });

    // Vse, where Miren still reads 0 and nobody picked it.
    rerender({
      filters: { ...EMPTY_FILTERS, energy: ["lively"], size: ["large"] },
    });
    expect(result.current.keptPicks).toEqual({});
  });

  it("remembers nothing for a pick that reads more, so the pick renders once", () => {
    const { result, rerender, renders } = renderModel(DOGS);
    const before = renders();

    rerender({ filters: { ...DOGS, energy: ["calm"] } });

    // Remembering it would set state while rendering, a second render of the
    // whole grid around the model for a row that stays drawn anyway.
    expect(renders() - before).toBe(1);
    expect(result.current.keptPicks).toEqual({});
  });
});
