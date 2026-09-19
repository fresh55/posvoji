// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelterAnimalGrid } from "./shelter-animal-grid";
import {
  CARDS_PER_CLICK,
  INITIAL_CARDS,
  ROWS_PER_STEP,
  TARGET_ROWS,
} from "./grid-rendering";
import { I18nProvider } from "@/components/i18n-provider";
import { animalPath } from "@/lib/animal-path";
import { animalsForClient } from "@/lib/dataset";
import {
  columnTracks,
  restoreGridColumns,
  stubGridColumns,
  stubIntersectionObserver,
} from "@/test/grid-stubs";

const BASE_PATH = "/zavetisca/velika-hisa";

// One shelter's own list, the size of the largest one in the register. Only
// the intake date varies, so the sort by the wait is the order they are made
// in and the last card is the one that arrived last.
function shelterAnimals(count: number): Animal[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `velika-hisa:${i}`,
    source: {
      providerId: "velika-hisa",
      sourceAnimalId: String(i),
      sourceUrl: `https://example.test/animals/${i}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "velika-hisa", name: "Velika hiša", city: "Celje" },
    name: `Muca ${i}`,
    intakeDate: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000)
      .toISOString()
      .slice(0, 10),
    species: "cat",
    status: "available",
    medical: {},
    images: [],
    attribution: "Test fixture",
  }));
}

function renderGrid(animals: Animal[]) {
  return render(
    <I18nProvider locale="sl">
      <ShelterAnimalGrid
        animals={animalsForClient(animals)}
        logos={{}}
        referenceDate="2026-01-01"
        basePath={BASE_PATH}
      />
    </I18nProvider>,
  );
}

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// motion reads the scroll position around a keyframe and jsdom has no
// scrollTo to put it back with; the dialog renders in this suite.
window.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  restoreGridColumns();
  Reflect.deleteProperty(window, "IntersectionObserver");
  window.history.replaceState(null, "", BASE_PATH);
});

// The largest shelter in the register holds 186 animals, and this grid used
// to mount all of them at once. It draws through the home grid's hook now, so
// what is asserted here is the shelter page's own half of that contract:
// that it is bounded at all, that nothing which counts is measured off the
// drawn part, and that an address past the cut still opens.
describe("how much of a shelter's grid is drawn", () => {
  const many = shelterAnimals(186);

  it("draws the first chunk, then grows when the sentinel comes into view", () => {
    stubGridColumns(columnTracks(2));
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(many);

    expect(screen.getAllByRole("article")).toHaveLength(INITIAL_CARDS);
    expect(container.querySelector("[data-grid-sentinel]")).not.toBeNull();
    // The bypass link still lands after the grid, whatever it holds.
    expect(container.querySelector("#za-zivalmi")).not.toBeNull();

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    // One step at two columns, clamped at the budget: the step would reach
    // ninety, and the budget at two columns is eighty.
    expect(screen.getAllByRole("article")).toHaveLength(
      Math.min(INITIAL_CARDS + ROWS_PER_STEP * 2, TARGET_ROWS * 2),
    );
  });

  it("renders the whole list where there is no observer to grow it", () => {
    renderGrid(many);
    expect(screen.getAllByRole("article")).toHaveLength(many.length);
  });

  // Most shelters in the register are this size. Their whole list is on the
  // page from the first render, so no button and no count was ever drawn, and
  // a line announcing the end of a list nobody watched grow would be the grid
  // talking about itself.
  it("says nothing under a list that fit in the first render", () => {
    stubGridColumns(columnTracks(2));
    stubIntersectionObserver();
    const { container } = renderGrid(shelterAnimals(12));

    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Prikaži še/ })).toBeNull();
    expect(screen.queryByText(/Konec seznama/)).toBeNull();
    expect(screen.queryByText(/od 12 živali/)).toBeNull();
  });

  it("swaps the sentinel for a button that says how much is left", () => {
    stubGridColumns(columnTracks(2));
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(many);

    // Walk the automatic budget out: 186 at two columns is past the eighty
    // the budget allows, so the steps stop at the budget and hand over.
    for (let i = 0; i < 4; i++) {
      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });
    }

    const drawn = TARGET_ROWS * 2;
    expect(screen.getAllByRole("article")).toHaveLength(drawn);
    expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
    const more = screen.getByRole("button", {
      name: `Prikaži še ${Math.min(CARDS_PER_CLICK, many.length - drawn)}`,
    });
    expect(screen.getByText(`${drawn} od ${many.length} živali`)).toBeTruthy();

    fireEvent.click(more);

    // One press buys the rest, the button leaves with nothing left to offer,
    // and focus stands on the first card the press added rather than on
    // body with the unmounted button.
    expect(screen.getAllByRole("article")).toHaveLength(many.length);
    expect(screen.queryByRole("button", { name: /Prikaži še/ })).toBeNull();
    // The line the button stood over stays and finishes the count, so the
    // list ends in a sentence rather than in blank space above the footer.
    expect(
      screen.getByText(`Konec seznama. ${many.length} od ${many.length} živali.`),
    ).toBeTruthy();
    const first = screen.getAllByRole("article")[drawn];
    expect(document.activeElement).toBe(
      within(first).getByRole("link", { name: /Muca/ }),
    );
  });

  // A cold load of an animal's own path is that animal's page, not this grid,
  // so the address that names an animal here is a history entry: Forward
  // after Back, or a reload that kept the client's state. It has to open
  // whether or not the card it names has been drawn.
  it("opens an animal whose card is past the cut when the address names it", async () => {
    stubGridColumns(columnTracks(2));
    stubIntersectionObserver();
    // The last animal in the order shown, well past the sixty that are drawn.
    const last = animalsForClient(many)[many.length - 1];
    window.history.replaceState(null, "", animalPath(last, "sl"));

    const { container } = renderGrid(many);

    // Its card is not on the page, so what opened the dialog was the whole
    // list and not the drawn part of it.
    expect(
      container.querySelector(
        `a[data-slot="card-link"][href="${animalPath(last, "sl")}"]`,
      ),
    ).toBeNull();
    // hidden: the open dialog is modal, so the grid behind it is aria-hidden
    // and the default query would not count it. Still only the first chunk.
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(
      INITIAL_CARDS,
    );
    expect((await screen.findByRole("dialog", {}, { timeout: 5000 })).textContent).toContain(last.name);
  });
});
