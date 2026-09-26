// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Animal, Species } from "@posvoji/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimalGrid, INITIAL_CARDS } from "./animal-grid";
import { resetFilterSectionsStore } from "@/components/filters/use-filter-sections";
import { I18nProvider } from "@/components/i18n-provider";
import {
  prefetchAnimalDescriptions,
  resetAnimalDescriptionsStore,
} from "@/lib/animal-descriptions";
import { animalsForClient } from "@/lib/dataset";
import { phoneRow, stickyRow } from "@/test/filter-rows";
import {
  columnTracks,
  restoreGridColumns,
  stubGridColumns,
  stubIdleCallback,
  stubIntersectionObserver,
} from "@/test/grid-stubs";
// The chunks the grid fetches for the dialog, the filter sheet and the
// picker, loaded with the file so no test waits for them inside a find
// (test/picker-chunks.ts says why).
import "@/components/animal-dialog/animal-dialog";
import "@/components/filters/filter-sheet-content";
import "@/test/picker-chunks";

// The search as the page runs it: the grid, the rail, the chips row and the
// dialog host around one query in the address.

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});
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

function animal(
  id: string,
  species: Species,
  fields: Partial<Animal> = {},
): Animal {
  return {
    id,
    source: {
      providerId: "muri",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "muri", name: "Shelter muri", city: "Ljubljana" },
    name: id,
    species,
    sex: "male",
    size: "medium",
    approximateAgeMonths: 24,
    status: "available",
    medical: {},
    images: [],
    attribution: "Test fixture",
    ...fields,
  };
}

// "ovč" finds Ovčka by name, Rex by breed, and Ajda and Bor only by what the
// shelter wrote about them. Muri and the rabbit it does not find.
const ANIMALS = [
  animal("rex", "dog", { name: "Rex", breed: "nemški ovčar" }),
  animal("bor", "dog", { name: "Bor" }),
  animal("ovcka", "cat", { name: "Ovčka", sex: "female" }),
  animal("ajda", "dog", { name: "Ajda", sex: "female" }),
  animal("muri", "cat", { name: "Muri" }),
  animal("zajc", "rabbit", { name: "Zajc" }),
];

// The deferred file the grid fetches descriptions from. The grid's own
// animals carry none (animalsForClient).
const DETAILS = {
  bor: { description: "Ovčar po duši, miren in priden." },
  ajda: { description: "Ovčarka, ki ima rada otroke." },
  muri: { description: "Prijazen maček." },
};

/** The file, answered when the test says so. */
function serveDetails() {
  let answer: () => void = () => {};
  const arrived = new Promise<void>((resolve) => {
    answer = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await arrived;
      return { ok: true, json: async () => DETAILS };
    }),
  );
  return async () => {
    await act(async () => {
      answer();
      await arrived;
    });
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => DETAILS })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAnimalDescriptionsStore();
  window.history.replaceState(null, "", "/");
});

function renderGrid() {
  return render(
    <I18nProvider locale="sl">
      <AnimalGrid
        animals={animalsForClient(ANIMALS)}
        logos={{}}
        referenceDate="2026-01-01"
      />
    </I18nProvider>,
  );
}

function cardNames() {
  return Array.from(
    document.querySelectorAll("[data-card-grid] article h3"),
    (heading) => heading.textContent?.trim(),
  );
}

function tab(name: string) {
  return screen.getAllByRole("button", { name: new RegExp(`^${name}`) })[0];
}

describe("the search over the grid", () => {
  it("finds by name, then breed, then description, each in the chosen order", async () => {
    // Sorted by name the four would read Ajda, Bor, Ovčka, Rex.
    window.history.replaceState(null, "", "/?isci=ov%C4%8D&razvrsti=ime");
    renderGrid();

    await waitFor(() =>
      expect(cardNames()).toEqual(["Ovčka", "Rex", "Ajda", "Bor"]),
    );
  });

  it("matches the words without their accents", async () => {
    window.history.replaceState(null, "", "/?isci=OVC&razvrsti=ime");
    renderGrid();

    await waitFor(() =>
      expect(cardNames()).toEqual(["Ovčka", "Rex", "Ajda", "Bor"]),
    );
  });

  it("adds what the descriptions find once they arrive", async () => {
    const arrive = serveDetails();
    window.history.replaceState(null, "", "/?isci=ov%C4%8D&razvrsti=ime");
    renderGrid();

    // Name and breed need no file.
    await waitFor(() => expect(cardNames()).toEqual(["Ovčka", "Rex"]));

    await arrive();
    await waitFor(() =>
      expect(cardNames()).toEqual(["Ovčka", "Rex", "Ajda", "Bor"]),
    );
  });

  it("counts the tabs over what it found, and keeps every tab", async () => {
    window.history.replaceState(null, "", "/?isci=ov%C4%8D");
    renderGrid();
    await waitFor(() => expect(cardNames()).toHaveLength(4));

    expect(tab("Psi").textContent).toContain("3");
    expect(tab("Mačke").textContent).toContain("1");
    // The rabbit is not found, and its tab stays on the strip at 0.
    expect(tab("Ostal").textContent).toContain("0");
  });

  it("counts the facets over what it found", async () => {
    // Spol starts folded (use-filter-sections.ts). A stored fold opens it
    // without the press, whose reveal jsdom has no layout for.
    window.localStorage.setItem(
      "posvoji:filter-sections",
      JSON.stringify({ sex: true }),
    );
    resetFilterSectionsStore();
    try {
      window.history.replaceState(null, "", "/?isci=ov%C4%8D");
      renderGrid();
      await waitFor(() => expect(cardNames()).toHaveLength(4));

      const rail = screen.getByRole("complementary");
      // Rex and Bor are male, Ovčka and Ajda female; Muri, a male, is not
      // found.
      expect(
        within(rail).getByRole("button", { name: /^Samec/ }).textContent,
      ).toContain("2");
    } finally {
      window.localStorage.removeItem("posvoji:filter-sections");
      resetFilterSectionsStore();
    }
  });

  it("leads the chips row with the query, and its pill takes the search off", async () => {
    window.history.replaceState(null, "", "/?isci=ov%C4%8D&spol=samec");
    renderGrid();
    await waitFor(() => expect(cardNames()).toEqual(["Rex", "Bor"]));

    const pills = within(stickyRow()).getAllByRole("button", {
      name: /^Odstrani filter/,
    });
    expect(pills.map((pill) => pill.getAttribute("aria-label"))).toEqual([
      "Odstrani filter „ovč“",
      "Odstrani filter Samec",
    ]);
    // The field's own magnifier, where every other pill wears its facet's.
    expect(pills[0].querySelector("svg.lucide-search")).toBeTruthy();
    // The phone's row names it first as well.
    expect(
      within(phoneRow()).getAllByRole("button", {
        name: /^Odstrani filter/,
        hidden: true,
      })[0].getAttribute("aria-label"),
    ).toBe("Odstrani filter „ovč“");

    fireEvent.click(pills[0]);

    expect(window.location.search).toBe("?spol=samec");
    await waitFor(() =>
      expect(cardNames().toSorted()).toEqual(["Bor", "Muri", "Rex", "Zajc"]),
    );
  });

  it("counts on the Filtri badges like any other value", async () => {
    window.history.replaceState(null, "", "/?isci=ov%C4%8D&spol=samec");
    renderGrid();
    await waitFor(() => expect(cardNames()).toHaveLength(2));

    expect(
      screen.getByRole("button", { name: "Filtri, aktivnih: 2" }),
    ).toBeTruthy();
    const rail = screen.getByRole("complementary");
    expect(
      within(rail).getByRole("heading", { name: /Filtri/ }).textContent,
    ).toContain("2");
  });

  it("goes with Počisti filtre and comes back with the undo", async () => {
    window.history.replaceState(null, "", "/?isci=ov%C4%8D&spol=samec");
    renderGrid();
    await waitFor(() => expect(cardNames()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Počisti filtre" }));
    expect(window.location.search).toBe("");
    const field = within(screen.getByRole("complementary")).getByRole<
      HTMLInputElement
    >("searchbox");
    expect(field.value).toBe("");

    fireEvent.click(
      screen.getAllByRole("button", { name: "Razveljavi čiščenje filtrov" })[0],
    );
    expect(window.location.search).toBe("?isci=ov%C4%8D&spol=samec");
    expect(field.value).toBe("ovč");
  });

  it("says when nothing answers the query, and offers to take it off", async () => {
    window.history.replaceState(null, "", "/?isci=xyz");
    renderGrid();

    const said = await screen.findByText("Za „xyz“ ni zadetkov.");
    // Not the advice about filters: no filter is why.
    expect(screen.queryByText("Poskusi z manj filtri.")).toBeNull();

    const results = said.closest('[data-slot="results"]')!;
    fireEvent.click(
      within(results as HTMLElement).getByRole("button", {
        name: "Počisti iskanje",
      }),
    );

    expect(window.location.search).toBe("");
    await waitFor(() => expect(cardNames()).toHaveLength(ANIMALS.length));
  });

  it("does not say so before the descriptions have had their say", async () => {
    const arrive = serveDetails();
    window.history.replaceState(null, "", "/?isci=pride");
    renderGrid();

    expect(await screen.findByText("Iščem po opisih…")).toBeTruthy();
    expect(screen.queryByText("Za „pride“ ni zadetkov.")).toBeNull();

    await arrive();
    await waitFor(() => expect(cardNames()).toEqual(["Bor"]));
  });

  it("keeps the empty state's own lines when the filters are why", async () => {
    // Rex is found and is male; the search is not the reason for nothing.
    window.history.replaceState(null, "", "/?isci=rex&spol=samica");
    renderGrid();

    expect(await screen.findByText("Ni zadetkov.")).toBeTruthy();
    expect(screen.queryByText(/Za „rex“/)).toBeNull();
  });

  it("opens an animal named in the address, whether or not the search finds it", async () => {
    window.history.replaceState(null, "", "/?isci=ov%C4%8D&zival=muri");
    renderGrid();

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { level: 2, name: "Muri" }),
    ).toBeTruthy();
    // And the list behind it is still the search's.
    expect(cardNames()).not.toContain("Muri");
  });
});

describe("the descriptions landing with no query", () => {
  afterEach(() => {
    restoreGridColumns();
    Reflect.deleteProperty(window, "IntersectionObserver");
  });

  it("leaves the grid as far down as it had grown", async () => {
    // The file lands whenever the grid is first hovered. Were the search to
    // hand the grid a new list for it, the grid would be read from its top
    // again (use-incremental-grid.ts) under a visitor who searched nothing.
    stubGridColumns(columnTracks(2));
    const { callbacks } = stubIntersectionObserver();
    const many = Array.from({ length: INITIAL_CARDS + 10 }, (_, i) =>
      animal(`dog-${i}`, "dog"),
    );
    render(
      <I18nProvider locale="sl">
        <AnimalGrid
          animals={animalsForClient(many)}
          logos={{}}
          referenceDate="2026-01-01"
        />
      </I18nProvider>,
    );
    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });
    expect(screen.getAllByRole("article")).toHaveLength(many.length);

    await act(async () => {
      await prefetchAnimalDescriptions();
    });

    expect(screen.getAllByRole("article")).toHaveLength(many.length);
  });
});
