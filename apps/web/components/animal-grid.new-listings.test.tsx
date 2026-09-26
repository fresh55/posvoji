// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalGrid } from "./animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { resetLastVisitStore } from "@/hooks/use-last-visit";
import { animalsForClient } from "@/lib/dataset";
import {
  LAST_VISIT_KEY,
  NEW_LISTINGS_DATASET_KEY,
  NEW_LISTINGS_SLOT,
} from "@/lib/last-visit";
import {
  restoreGridColumns,
  stubIdleCallback,
  stubMatchMedia,
} from "@/test/grid-stubs";

stubMatchMedia();
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => {},
});
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;
stubIdleCallback();

afterEach(() => {
  cleanup();
  restoreGridColumns();
  localStorage.clear();
  sessionStorage.clear();
  resetLastVisitStore();
  delete document.documentElement.dataset[NEW_LISTINGS_DATASET_KEY];
  window.history.replaceState(null, "", "/");
});

function animal(id: string, firstSeenAt: string): Animal {
  return {
    id,
    source: {
      providerId: "muri",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-10T00:00:00.000Z",
      firstSeenAt,
      lastSeenAt: "2026-01-10T00:00:00.000Z",
    },
    shelter: { id: "muri", name: "Shelter muri", city: "Ljubljana" },
    name: id,
    species: "dog",
    sex: "male",
    approximateAgeMonths: 24,
    status: "available",
    medical: {},
    images: [],
    attribution: "Test fixture",
  };
}

// Two listed after the visit below, one before it.
const ANIMALS = [
  animal("old", "2025-12-01T00:00:00.000Z"),
  animal("new-a", "2026-01-05T00:00:00.000Z"),
  animal("new-b", "2026-01-06T00:00:00.000Z"),
];

function renderGrid() {
  return render(
    <I18nProvider locale="sl">
      <AnimalGrid
        animals={animalsForClient(ANIMALS)}
        logos={{}}
        referenceDate="2026-01-10T00:00:00.000Z"
      />
    </I18nProvider>,
  );
}

const slot = () =>
  document.querySelector(`[data-slot="${NEW_LISTINGS_SLOT}"]`);

describe("the new-listings notice in the grid", () => {
  it("draws nothing in its place on a first visit", () => {
    renderGrid();
    expect(slot()).not.toBeNull();
    expect(slot()?.childElementCount).toBe(0);
  });

  it("counts the listings since the last visit in the place held for it", async () => {
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-01T00:00:00.000Z");
    document.documentElement.dataset[NEW_LISTINGS_DATASET_KEY] = "";
    renderGrid();
    expect(
      await screen.findByText("2 novi objavi od zadnjega obiska."),
    ).toBeTruthy();
    expect(slot()?.textContent).toContain("2 novi objavi");
    // The place goes back to the layout once the notice stands in it.
    expect(NEW_LISTINGS_DATASET_KEY in document.documentElement.dataset).toBe(
      false,
    );
  });

  it("gives the held place back when there is nothing new after all", async () => {
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-09T00:00:00.000Z");
    document.documentElement.dataset[NEW_LISTINGS_DATASET_KEY] = "";
    renderGrid();
    await act(async () => {});
    expect(slot()?.childElementCount).toBe(0);
    expect(NEW_LISTINGS_DATASET_KEY in document.documentElement.dataset).toBe(
      false,
    );
  });

  it("puts the new listings first, and stands down under that order", async () => {
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-01T00:00:00.000Z");
    renderGrid();
    fireEvent.click(await screen.findByRole("button", { name: /najprej/ }));
    await act(async () => {});
    expect(window.location.search).toContain("razvrsti=objave");
    expect(slot()?.childElementCount).toBe(0);
    const names = [...document.querySelectorAll("[data-card-grid] article h3")].map(
      (heading) => heading.textContent,
    );
    expect(names.slice(0, 2)).toEqual(["new-b", "new-a"]);
    // The button went with the notice; focus goes to the first new listing
    // rather than falling to the page.
    const first = document.querySelector("[data-card-grid] article");
    expect(first?.contains(document.activeElement)).toBe(true);
    expect(first?.querySelector("h3")?.textContent).toBe("new-b");
  });

  // A new intake on hold sorts after every adoptable animal whatever the
  // order, so a notice counting it would promise a card it cannot put first.
  it("leaves a new listing on hold out of the count", async () => {
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-01T00:00:00.000Z");
    const held = { ...animal("new-held", "2026-01-07T00:00:00.000Z"), status: "hold" as const };
    render(
      <I18nProvider locale="sl">
        <AnimalGrid
          animals={animalsForClient([...ANIMALS, held])}
          logos={{}}
          referenceDate="2026-01-10T00:00:00.000Z"
        />
      </I18nProvider>,
    );
    expect(
      await screen.findByText("2 novi objavi od zadnjega obiska."),
    ).toBeTruthy();
  });
});
