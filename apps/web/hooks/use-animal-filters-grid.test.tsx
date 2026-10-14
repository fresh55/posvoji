// @vitest-environment jsdom

import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnimalGrid, INITIAL_CARDS } from "@/components/animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import type { ClientAnimal } from "@/lib/animal";
import { animalPath } from "@/lib/animal-path";
import { commitSearch } from "@/lib/location-search";
import {
  stubIdleCallback,
  stubIntersectionObserver,
  stubMatchMedia,
} from "@/test/grid-stubs";
import { useAnimalDialog } from "./use-animal-dialog";
import { useAnimalFilters } from "./use-animal-filters";

const ANIMALS: ClientAnimal[] = Array.from(
  { length: INITIAL_CARDS + 10 },
  (_, index) => ({
    id: `dog-${index}`,
    name: `Dog ${index}`,
    species: "dog",
    sex: "male",
    status: "available",
    shelter: { id: "test-shelter", name: "Test shelter", city: "Ljubljana" },
    images: [],
    attribution: "Test fixture",
  }),
);

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="sl">{children}</I18nProvider>;
}

beforeEach(() => {
  stubMatchMedia();
  stubIdleCallback();
});

// Motion can finish measuring a keyframe after a test's cleanup. Keep jsdom's
// missing scroll implementation stubbed for the whole file, as grid tests do.
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => {},
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "IntersectionObserver");
  window.history.replaceState(null, "", "/");
});

function expandedGrid() {
  const { callbacks } = stubIntersectionObserver();
  const { container } = render(
    <AnimalGrid animals={ANIMALS} logos={{}} referenceDate="2026-01-01" />,
    { wrapper: Wrapper },
  );
  const cards = () => container.querySelectorAll("[data-card-grid] article");
  expect(cards()).toHaveLength(INITIAL_CARDS);
  act(() => {
    for (const callback of callbacks) callback([{ isIntersecting: true }]);
  });
  expect(cards()).toHaveLength(ANIMALS.length);
  return cards;
}

describe("filter identity and expanded results", () => {
  it("keeps the drawn cards when the photo or an unrelated query changes", () => {
    const cards = expandedGrid();
    const lastCard = cards()[ANIMALS.length - 1];
    for (const search of ["foto=2", "foto=3&campaign=autumn", "campaign=autumn", ""]) {
      act(() => commitSearch(search, "replace"));
      expect(cards()).toHaveLength(ANIMALS.length);
      expect(cards()[ANIMALS.length - 1]).toBe(lastCard);
    }
  });

  it("keeps expanded results through a real non-first-photo open and close", async () => {
    const cards = expandedGrid();
    const { result } = renderHook(
      () => useAnimalDialog({ animals: ANIMALS, basePath: "/" }),
      { wrapper: Wrapper },
    );
    await act(async () => result.current.open(ANIMALS[0].id, 1));
    expect(window.location.pathname).toBe(animalPath(ANIMALS[0], "sl"));
    expect(window.location.search).toBe("?foto=2");
    expect(cards()).toHaveLength(ANIMALS.length);

    await act(async () => result.current.close());
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(window.location.search).toBe("");
    expect(cards()).toHaveLength(ANIMALS.length);
  });

  it.each(["spol=samec", "razvrsti=ime"])(
    "still resets the drawn count for a real filter or sort change: %s",
    (search) => {
      const cards = expandedGrid();
      act(() => commitSearch(search, "replace"));
      expect(cards()).toHaveLength(INITIAL_CARDS);
    },
  );

  it("keeps filter identity across equivalent parsed queries and sort changes", () => {
    window.history.replaceState(null, "", "/?spol=samec&zavetisce=test-shelter,test-shelter");
    const { result } = renderHook(useAnimalFilters);
    const filters = result.current.filters;
    act(() => commitSearch("zavetisce=test-shelter&spol=%73amec&spol=invalid&dom=vrt", "replace"));
    expect(result.current.filters).toBe(filters);
    act(() => result.current.setSort("name"));
    expect(result.current.filters).toBe(filters);
    expect(result.current.sort).toBe("name");
    act(() => result.current.setSpecies("cat"));
    expect(result.current.filters).not.toBe(filters);
    expect(result.current.filters.species).toBe("cat");
    expect(result.current.sort).toBe("name");
  });
});
