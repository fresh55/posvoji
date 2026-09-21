// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import {
  applyFilters,
  EMPTY_FILTERS,
  facetCounts,
  goodWithCounts,
  goodWithOptions,
  GROUPS,
  groupOptions,
  toggleCounts,
  toggleLabel,
  visibleGoodWith,
  visibleGroups,
  visibleToggles,
  type Filters,
} from "@/lib/filters";
import { installFilterFoldSeams } from "@/test/filter-folds";
import type { CardGroup } from "./filter-groups";
import { FilterSidebar } from "./filter-sidebar";
import { resetFilterSectionsStore } from "./use-filter-sections";

const STORAGE_KEY = "posvoji:filter-sections";
const NOW = new Date("2026-01-01T00:00:00.000Z");

// A header tooltip opens on focus, and Radix positions it with an observer
// jsdom does not ship. The fold's own seams, and the stored folds dropped
// around every test, come from the shared helper; the spy it hands back is
// what the reveal is measured on below.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;

const scrollIntoView = installFilterFoldSeams();

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

function animal(
  id: string,
  sex: "male" | "female",
  approximateAgeMonths: number,
  size: "small" | "medium" | "large",
  energy: Animal["energy"],
  medical: Animal["medical"] = {},
  goodWith: Animal["goodWith"] = undefined,
): Animal {
  return {
    ...(goodWith ? { goodWith } : {}),
    ...(energy ? { energy } : {}),
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
    species: "dog",
    sex,
    size,
    approximateAgeMonths,
    status: "available",
    medical,
    images: [],
    attribution: "Test fixture",
  };
}

// Every section the sidebar can show has something to show: two sexes, three
// ages and sizes, two energy levels, two health traits, two household answers.
const ANIMALS = [
  animal("male-young", "male", 6, "small", "calm", { neutered: true }, {
    kids: "yes",
    dogs: "yes",
  }),
  animal("female-adult", "female", 36, "medium", "lively", { vaccinated: true }, {
    kids: "yes",
    dogs: "no",
  }),
  animal("male-senior", "male", 120, "large", undefined),
];

const NOOP = () => undefined;

function sidebarProps(filters: Filters) {
  const shown = visibleGroups(ANIMALS, filters, NOW);
  const goodWithKeys = visibleGoodWith(ANIMALS, filters.goodWith);

  return {
    filters,
    groups: GROUPS.filter(
      (group): group is CardGroup => group !== "shelter" && shown[group],
    ).map((group) => ({
      group,
      options: groupOptions(group, ANIMALS, "sl"),
    })),
    counts: facetCounts(ANIMALS, filters, NOW),
    toggles: visibleToggles(ANIMALS, filters.species, filters.toggles).map(
      (definition) => ({
        ...definition,
        label: toggleLabel(definition.key, "sl"),
      }),
    ),
    toggleTally: toggleCounts(ANIMALS, filters, NOW),
    goodWith: {
      options: goodWithOptions("sl").filter(({ key }) =>
        goodWithKeys.includes(key),
      ),
      counts: goodWithCounts(ANIMALS, filters, NOW),
      resultCount: applyFilters(ANIMALS, filters, NOW).length,
      total: ANIMALS.length,
      onToggle: NOOP,
      onToggleMany: NOOP,
    },
  };
}

// The folding tests need selections to survive a click, so the sidebar runs on
// the real URL-backed filter state.
function SidebarHarness() {
  const {
    filters,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    toggleGoodWith,
    toggleManyGoodWith,
  } = useAnimalFilters();
  const props = sidebarProps(filters);

  return (
    <I18nProvider locale="sl">
      <FilterSidebar
        {...props}
        goodWith={{
          ...props.goodWith,
          onToggle: toggleGoodWith,
          onToggleMany: toggleManyGoodWith,
        }}
        onToggle={toggle}
        onToggleMany={toggleMany}
        onToggleProperty={toggleProperty}
        onToggleManyProperties={toggleManyProperties}
      />
    </I18nProvider>
  );
}

function renderSidebar() {
  return render(<SidebarHarness />);
}

// The heading tests care about what the sidebar is handed, not where it came
// from, so they state the filters outright.
function renderStatic(filters: Filters) {
  return render(
    <I18nProvider locale="sl">
      <FilterSidebar
        {...sidebarProps(filters)}
        onToggle={NOOP}
        onToggleMany={NOOP}
        onToggleProperty={NOOP}
        onToggleManyProperties={NOOP}
      />
    </I18nProvider>,
  );
}

function header(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

function expanded(label: string): string | null {
  return header(label).getAttribute("aria-expanded");
}

function card(name: RegExp): HTMLElement | null {
  return screen.queryByRole("button", { name });
}

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
}

/** The green mark an answered section carries in its heading while its cards
 *  are drawn. A folded one prints the answer itself instead, which the
 *  summary tests above read off the text. */
function mark(label: string): Element | null {
  return header(label).querySelector(".bg-brand-border");
}

/** An address arriving at a panel that is already mounted: a shared link
 *  reaching hydration, or the back gesture. The page is statically exported,
 *  so this is the only way a sidebar ever sees a filter it did not draw
 *  itself (lib/location-search.ts). */
function arrive(url: string): void {
  window.history.replaceState(null, "", url);
  fireEvent.popState(window);
}

describe("collapsible filter sections", () => {
  it("folds age on short desktops without replacing a saved choice", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("49.99rem"), media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    const { unmount } = renderSidebar();
    expect(expanded("Starost")).toBe("false");
    expect(stored()).toBeNull();
    fireEvent.click(header("Starost"));
    expect(expanded("Starost")).toBe("true");
    unmount();
    renderSidebar();
    expect(expanded("Starost")).toBe("true");
  });

  it("counts recorded energy with other filters applied and its own selection lifted", () => {
    renderSidebar();
    fireEvent.click(header("Energija"));
    expect(screen.getByText(/S podatkom ob drugih izbranih filtrih: 2\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Miren,/ }));
    expect(screen.getByText(/S podatkom ob drugih izbranih filtrih: 2\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Samec,/ }));
    expect(screen.getByText(/S podatkom ob drugih izbranih filtrih: 1\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Miren,/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Senior,/ }));
    expect(screen.getByText(/S podatkom ob drugih izbranih filtrih: 0\./)).toBeTruthy();
  });

  it("opens what a visitor reaches for first and folds the rest away", () => {
    // Two sections and no more. The panel scrolls on its own, so anything
    // past its fold is reached by scrolling the panel and not the page, and
    // open by default Velikost cost 185px of a first screen that was already
    // 96px over at 1440x900.
    renderSidebar();

    expect(expanded("Spol")).toBe("true");
    expect(expanded("Starost")).toBe("true");
    expect(card(/^Samec/)).toBeTruthy();
    expect(card(/^Mladiček/)).toBeTruthy();

    expect(expanded("Velikost")).toBe("false");
    expect(card(/^Majhna/)).toBeNull();
    expect(expanded("Energija")).toBe("false");
    expect(expanded("Zdravje")).toBe("false");
    expect(expanded("Doma imam")).toBe("false");
    expect(card(/^Miren/)).toBeNull();
    expect(card(/^Sterilizacija/)).toBeNull();
    expect(card(/^Otroke/)).toBeNull();
  });

  it("unfolds a section from its header and folds it back", async () => {
    renderSidebar();

    fireEvent.click(header("Zdravje"));
    expect(expanded("Zdravje")).toBe("true");
    expect(card(/^Sterilizacija/)).toBeTruthy();

    fireEvent.click(header("Zdravje"));
    expect(expanded("Zdravje")).toBe("false");
    await waitFor(() => expect(card(/^Sterilizacija/)).toBeNull());
  });

  it("points the header at the body it controls", () => {
    renderSidebar();

    const contentId = header("Zdravje").getAttribute("aria-controls");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(contentId ?? "")).toBeNull();

    fireEvent.click(header("Zdravje"));
    const body = document.getElementById(contentId ?? "");
    expect(body?.contains(card(/^Sterilizacija/))).toBe(true);
  });

  it("keeps a folded selection visible in the header", async () => {
    renderSidebar();

    fireEvent.click(header("Zdravje"));
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    fireEvent.click(header("Zdravje"));
    expect(header("Zdravje").textContent).toContain("Sterilizacija");

    fireEvent.click(header("Zdravje"));
    await waitFor(() =>
      expect(card(/^Cepljenje/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Cepljenje/ }));
    fireEvent.click(header("Zdravje"));
    expect(header("Zdravje").textContent).toContain("Sterilizacija +1");
  });

  it("opens a folded section when its answer arrives with the address", async () => {
    renderSidebar();
    expect(expanded("Velikost")).toBe("false");

    arrive("/?velikost=majhna");

    expect(expanded("Velikost")).toBe("true");
    await waitFor(() => expect(card(/^Majhna/)).toBeTruthy());
  });

  it("leaves the visitor's own fold alone when another section is answered", () => {
    renderSidebar();
    fireEvent.click(header("Spol"));
    expect(expanded("Spol")).toBe("false");

    arrive("/?velikost=majhna");

    expect(expanded("Velikost")).toBe("true");
    expect(expanded("Spol")).toBe("false");
  });

  it("keeps a revealed section open once its answer is cleared", () => {
    renderSidebar();
    arrive("/?velikost=majhna");
    expect(expanded("Velikost")).toBe("true");

    // The section folding away under the press that emptied it would take the
    // rest of its options with it, and they are what a visitor clearing one
    // answer is most likely to want next.
    arrive("/");

    expect(expanded("Velikost")).toBe("true");
  });

  it("puts an arriving answer where it can be seen, and a later one never", async () => {
    renderSidebar();

    arrive("/?velikost=majhna");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({
      block: "nearest",
    });

    // Mid-visit the panel is already being read, so a second answer opens its
    // section where it stands and moves nothing.
    arrive("/?velikost=majhna&lastnosti=sterilizacija");
    await waitFor(() => expect(expanded("Zdravje")).toBe("true"));
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("marks an answered section whose cards are drawn", () => {
    const { unmount } = renderStatic(EMPTY_FILTERS);
    expect(expanded("Spol")).toBe("true");
    expect(mark("Spol")).toBeNull();
    unmount();

    renderStatic({ ...EMPTY_FILTERS, sex: ["female"] });
    expect(mark("Spol")).toBeTruthy();
    // The heading still reads as itself: the mark is not in the name.
    expect(header("Spol").textContent).toBe("Spol");
  });

  it("hands the reset back only once the section is open", () => {
    renderSidebar();
    const resetName = "Ponastavi zdravstvene filtre";

    fireEvent.click(header("Zdravje"));
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    expect(screen.getByRole("button", { name: resetName })).toBeTruthy();

    fireEvent.click(header("Zdravje"));
    expect(screen.queryByRole("button", { name: resetName })).toBeNull();
    expect(
      screen.getByLabelText(resetName).getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("brings a freshly unfolded section into view, and a folded one never", async () => {
    renderSidebar();

    fireEvent.click(header("Doma imam"));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({
      block: "nearest",
    });

    fireEvent.click(header("Doma imam"));
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("walks the section headers with the arrow keys", () => {
    renderSidebar();

    header("Spol").focus();
    fireEvent.keyDown(header("Spol"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(header("Starost"));

    fireEvent.keyDown(header("Starost"), { key: "End" });
    expect(document.activeElement).toBe(header("Doma imam"));

    fireEvent.keyDown(header("Doma imam"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(header("Zdravje"));

    fireEvent.keyDown(header("Zdravje"), { key: "Home" });
    expect(document.activeElement).toBe(header("Spol"));
  });

  // The classes and not the computed style: jsdom ships no browser stylesheet,
  // so the button rules that reset text-transform and letter-spacing, the
  // whole reason a folding heading printed in sentence case, are not there to
  // measure against.
  it("prints a folding heading in the case every other heading uses", () => {
    renderSidebar();

    expect(header("Zdravje").classList.contains("uppercase")).toBe(true);
    expect(header("Zdravje").classList.contains("tracking-wide")).toBe(true);
  });

  it("leaves the folded summary in its own case", () => {
    renderSidebar();

    fireEvent.click(header("Zdravje"));
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    fireEvent.click(header("Zdravje"));

    const summary = [...header("Zdravje").querySelectorAll("span")].find(
      (span) => span.textContent === "Sterilizacija",
    );
    expect(summary?.classList.contains("normal-case")).toBe(true);
    expect(summary?.classList.contains("tracking-normal")).toBe(true);
  });
});

describe("the sidebar's own scroll", () => {
  // A sidebar taller than the viewport cuts its last sections off with nothing
  // but a faint fade to say so, so this one container keeps its scrollbar.
  // Carrying fade-scroll as well would hide it again: see globals.css.
  it("keeps a scrollbar where the fade alone stands in everywhere else", () => {
    const { container } = renderSidebar();
    const aside = container.querySelector("aside");

    expect(aside?.classList.contains("fade-scroll-thin")).toBe(true);
    expect(aside?.classList.contains("fade-scroll")).toBe(false);
  });
});

describe("remembered folds", () => {
  it("stores only what departs from the defaults", () => {
    renderSidebar();

    fireEvent.click(header("Zdravje"));
    expect(stored()).toEqual({ health: true });

    fireEvent.click(header("Spol"));
    expect(stored()).toEqual({ health: true, sex: false });
  });

  it("restores the stored folds in a fresh render", () => {
    const { unmount } = renderSidebar();
    fireEvent.click(header("Zdravje"));
    fireEvent.click(header("Spol"));
    unmount();

    // A new tab reads the same storage and starts from nothing else.
    resetFilterSectionsStore();
    renderSidebar();

    expect(expanded("Zdravje")).toBe("true");
    expect(expanded("Spol")).toBe("false");
    expect(expanded("Starost")).toBe("true");
  });
});

describe("the sidebar heading", () => {
  it("counts selected values, not the sections holding them", () => {
    const { unmount } = renderStatic(EMPTY_FILTERS);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Filtri");
    unmount();

    // Two sections, three values. The chips row below this heading draws
    // three pills, so the badge that outlives it has to say three.
    renderStatic({
      ...EMPTY_FILTERS,
      sex: ["male", "female"],
      toggles: ["sterilizacija"],
    });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Filtri3");
  });

  it("leaves the clearing to the chips row", () => {
    // The head used to carry its own "Počisti vse" on the same handler as the
    // row's, 47px from it on a 1440 screen with both drawn at lg. The row is
    // the one that stayed: it sits among the pills it removes, and it is on
    // screen whenever this head is, because every value has a pill there but
    // the species tab, which undoes itself.
    renderStatic({ ...EMPTY_FILTERS, sex: ["male"] });

    expect(screen.queryByText("Počisti vse")).toBeNull();
  });
});

describe("the sidebar's surfaces", () => {
  // The panel stands beside a grid of borderless cards, and for a while it
  // answered with five surfaces of its own: the map plate, sex tiles, size
  // tiles, the rows and the chips. Everything that can be pressed in a
  // section is a row now, on the one treatment filter-card.tsx describes: a
  // transparent border, no ground, no shadow at rest, and a 40px line. The
  // row is 40px and not the 44px a finger needs because the sidebar is
  // lg-only and mouse-driven; the sheet is what a phone gets. A section that
  // arrives as a tile fails here.
  it("draws every facet option in a section as a row", () => {
    const { container } = renderStatic(EMPTY_FILTERS);
    // A folded section leaves its options out of the DOM, so every header
    // that is closed is opened first and the sweep sees the whole panel.
    for (const trigger of container.querySelectorAll<HTMLElement>(
      'button[aria-expanded="false"]',
    )) {
      fireEvent.click(trigger);
    }

    const options = container.querySelectorAll<HTMLElement>(
      '[data-slot="toggle-group-item"], button[aria-pressed]',
    );
    // Two sexes, three ages, three sizes, two of three energies (no animal in
    // the fixture is Uravnotežen, and the sidebar leaves a dead option out),
    // two health traits and two household answers.
    expect(options).toHaveLength(14);

    for (const option of options) {
      expect(option.className).toContain("border-transparent");
      expect(option.className).toContain("bg-transparent");
      expect(option.className).toContain("shadow-none");
      expect(option.className).toContain("h-10");
    }
  });

  // The panel is lg-only, so the max-lg gate these two used to carry never
  // applied anywhere: at 1180x820 with a coarse pointer every section heading
  // measured 24px and every reset 20px, and 1024x768 measured the same,
  // because the loss is the lg boundary and not the width.
  it("gives a thumb a section heading and a reset to press", () => {
    const { container } = renderStatic({ ...EMPTY_FILTERS, sex: ["male"] });

    const heading = header("Spol");
    // Grown and not overlaid: the header's own mb-2 puts the first row 8px
    // below it and a 44px overlay over a 24px row overhangs 10.
    expect(heading.className).toContain("pointer-coarse:min-h-11");
    expect(heading.className).not.toContain("tap-target");

    const reset = container.querySelector<HTMLElement>(
      'button[aria-label^="Ponastavi"]',
    );
    // Out of flow in a folding header, so the box grows without moving the
    // row; tap-target would set position: relative and fight the absolute.
    expect(reset?.className).toContain("pointer-coarse:min-h-11");
    expect(reset?.className).toContain("absolute");
    // A mouse gets a 25px box from padding, not from an overlay, and the
    // shared p-0 must not ride along or the stylesheet's order decides which
    // wins.
    expect(reset?.className).toContain("px-1");
    expect(reset?.className).not.toContain("p-0");
  });
});
