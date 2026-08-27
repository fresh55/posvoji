// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Animal, Species } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { ShelterAnimalGrid } from "./shelter-animal-grid";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "IntersectionObserver");
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

function animal(id: string, species: Species = "dog"): Animal {
  return {
    id,
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
    species,
    sex: "male",
    size: "medium",
    approximateAgeMonths: 24,
    status: "available",
    medical: {},
    images: [],
    attribution: "Test fixture",
  };
}

function renderShelterGrid(animals: Animal[]) {
  return render(
    <I18nProvider locale="sl">
      <ShelterAnimalGrid
        animals={animals}
        logos={{}}
        emptyLabel="Ni živali"
        referenceDate="2026-01-01"
        basePath="/zavetisca/test-shelter"
      />
    </I18nProvider>,
  );
}

// jsdom has no IntersectionObserver, which is the branch the grid falls back
// on by rendering everything. The chunking only exists where there is one, so
// the growth test brings its own and fires the callbacks by hand, the same
// way animal-grid.test.tsx does for the home grid.
type ObserverEntries = { isIntersecting: boolean }[];

function stubIntersectionObserver(): ((entries: ObserverEntries) => void)[] {
  const callbacks: ((entries: ObserverEntries) => void)[] = [];
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: class {
      constructor(callback: (entries: ObserverEntries) => void) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  return callbacks;
}

describe("ShelterAnimalGrid, empty state", () => {
  it("shows the empty label when the shelter has no animals at all", () => {
    renderShelterGrid([]);
    expect(screen.getByText("Ni živali")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

describe("ShelterAnimalGrid windowing", () => {
  const many = Array.from({ length: 186 }, (_, i) => animal(`dog-${i}`));

  it("draws only the first chunk, then grows when the sentinel comes into view", () => {
    const callbacks = stubIntersectionObserver();
    renderShelterGrid(many);

    const firstChunk = screen.getAllByRole("article").length;
    expect(firstChunk).toBeLessThan(many.length);
    expect(firstChunk).toBeGreaterThan(0);

    // 186 animals takes more than one step of 60 to fully draw. The sentinel
    // node itself never unmounts between steps (hasMore stays true until the
    // very last one), so watchSentinel's ref callback never re-fires and no
    // second observer is ever constructed. Firing the one captured callback
    // again is exactly what the real, still-visible sentinel would do.
    let guard = 0;
    while (
      screen.getAllByRole("article").length < many.length &&
      guard < 10
    ) {
      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });
      guard += 1;
    }

    expect(screen.getAllByRole("article")).toHaveLength(many.length);
  });

  it("renders the whole list where there is no observer to grow it", () => {
    renderShelterGrid(many);
    expect(screen.getAllByRole("article")).toHaveLength(many.length);
  });
});

describe("ShelterAnimalGrid species tabs", () => {
  it("offers no species tabs for a shelter with only one species", () => {
    renderShelterGrid([animal("a", "dog"), animal("b", "dog")]);
    expect(screen.queryByRole("button", { name: /^Psi/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Vse/ })).toBeNull();
  });

  it("narrows to one species and back, without touching the URL", () => {
    const animals = [
      animal("dog-a", "dog"),
      animal("dog-b", "dog"),
      animal("cat-a", "cat"),
    ];
    renderShelterGrid(animals);

    expect(screen.getAllByRole("article")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /^Mačke/ }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    // This page's own tabs are a plain view state, not a shareable filter:
    // the shelter page has no other facet, so there is nothing worth
    // round-tripping through the URL for it.
    expect(window.location.search).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /^Vse/ }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
});
