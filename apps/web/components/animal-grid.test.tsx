// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Animal, Species } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnimalGrid,
  CARDS_PER_CLICK,
  INITIAL_CARDS,
  ROWS_PER_STEP,
  TARGET_ROWS,
  UNDO_WINDOW_MS,
} from "./animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";

// AnimalGrid renders its own I18nProvider-consuming children, but the
// component itself does not open one: the page shell normally does that, so
// the test wraps it the same way the page does.
function renderGrid(animals: Animal[], locale: "sl" | "en" = "sl") {
  return render(
    <I18nProvider locale={locale}>
      <AnimalGrid
        // The grid is a client component, so what it is handed on the page is
        // the projection, not the dataset's own animals.
        animals={animalsForClient(animals)}
        logos={{}}
        referenceDate="2026-01-01"
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
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

function animal(id: string, species: Species, shelterId: string): Animal {
  return {
    id,
    source: {
      providerId: shelterId,
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: shelterId, name: `Shelter ${shelterId}`, city: "Ljubljana" },
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

// Three shelters: muri and tretje have only dogs/cats, druga has the only
// rabbit. Nobody has "other". This is the minimal set that can hit every
// branch of the shelter-only empty state: a single shelter with none of the
// active species, several shelters with none of it, and dropping the shelter
// filter actually turning up an animal.
const ANIMALS = [
  animal("dog-muri", "dog", "muri"),
  animal("dog-tretje", "dog", "tretje"),
  animal("cat-druga", "cat", "druga"),
  animal("rabbit-druga", "rabbit", "druga"),
];

function query() {
  return window.location.search;
}

// jsdom has no IntersectionObserver, which is the branch the grid falls back on
// by rendering everything. The chunking itself only exists where there is one,
// so the test that measures it brings its own and keeps the callbacks to fire
// by hand.
type ObserverEntries = { isIntersecting: boolean }[];

// The callbacks to fire by hand, and every registration the grid made against
// them. The registrations matter as much as the callbacks: a step has to
// re-arm its observation, and re-arming is the observe call.
type ObserverStub = {
  callbacks: ((entries: ObserverEntries) => void)[];
  calls: { method: "observe" | "unobserve"; node: Element }[];
};

function stubIntersectionObserver(): ObserverStub {
  const callbacks: ObserverStub["callbacks"] = [];
  const calls: ObserverStub["calls"] = [];
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: class {
      constructor(callback: (entries: ObserverEntries) => void) {
        callbacks.push(callback);
      }
      observe(node: Element) {
        calls.push({ method: "observe", node });
      }
      unobserve(node: Element) {
        calls.push({ method: "unobserve", node });
      }
      disconnect() {}
    },
  });
  return { callbacks, calls };
}

// The step is measured off the rendered grid's own column count, and jsdom
// lays nothing out, so the columns are stubbed instead of laid out. Only the
// card grid's element answers differently: the rest of the tree reads computed
// style too, and gets jsdom's real answer.
//
// Found by its data attribute and not by its classes, for the reason the grid
// marks itself with one: a class list is layout, and layout is free to gain a
// class. Matched on the class list, one call to cn() around CARD_GRID would
// have left this patching nothing, and every column count here quietly
// charging the two-column fallback instead.
const realComputedStyle = window.getComputedStyle.bind(window);

function stubGridColumns(tracks: string) {
  window.getComputedStyle = (element: Element, pseudo?: string | null) => {
    const style = realComputedStyle(element, pseudo ?? undefined);
    if (
      element instanceof HTMLElement &&
      element.hasAttribute("data-card-grid")
    ) {
      Object.defineProperty(style, "gridTemplateColumns", {
        configurable: true,
        value: tracks,
      });
    }
    return style;
  };
}

function columnTracks(columns: number) {
  return Array.from({ length: columns }, () => "245px").join(" ");
}

describe("animal grid empty state", () => {
  it("names the shelter-species conflict and offers to drop only the shelter", () => {
    window.history.replaceState(null, "", "/?vrsta=zajcek&zavetisce=muri");
    renderGrid(ANIMALS);

    expect(
      screen.getByText("Izbrano zavetišče trenutno nima drugih živali."),
    ).toBeTruthy();
    // The blunt "poskusi z manj filtri" line is only for the generic case.
    expect(screen.queryByText("Poskusi z manj filtri.")).toBeNull();

    const recover = screen.getByRole("button", {
      name: "Pokaži iz vseh zavetišč",
    });
    fireEvent.click(recover);

    // The species tab survives: only zavetisce came off the query, and the
    // one rabbit not at muri is now shown. The tab is written back under its
    // own slug, so the legacy zajcek one has normalized to ostalo.
    expect(query()).toBe("?vrsta=ostalo");
    expect(screen.getByRole("link", { name: /Shelter druga/ })).toBeTruthy();
  });

  it("uses the plural shelter form for more than one selected shelter", () => {
    window.history.replaceState(
      null,
      "",
      "/?vrsta=zajcek&zavetisce=muri,tretje",
    );
    renderGrid(ANIMALS);

    expect(
      screen.getByText("Izbrana zavetišča trenutno nimajo drugih živali."),
    ).toBeTruthy();
  });

  it("keeps the generic empty state when no shelter is selected", () => {
    // The rabbit is filtered out, so the Ostale tab matches nobody, and no
    // shelter filter is active, so dropping the shelter group could not
    // possibly help.
    window.history.replaceState(null, "", "/?vrsta=ostalo");
    renderGrid(ANIMALS.filter((a) => a.species !== "rabbit"));

    expect(screen.getByText("Ni zadetkov.")).toBeTruthy();
    expect(screen.getByText("Poskusi z manj filtri.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Pokaži iz vseh zavetišč" }),
    ).toBeNull();
  });

  it("keeps the generic empty state when dropping the shelter would not help either", () => {
    // Every shelter selected here has zero rabbits, and so does the rest of
    // the dataset once the shelter filter is lifted: dropping it buys nothing.
    window.history.replaceState(
      null,
      "",
      "/?vrsta=zajcek&zavetisce=muri,tretje,druga",
    );
    renderGrid(ANIMALS.filter((a) => a.species !== "rabbit"));

    expect(screen.getByText("Ni zadetkov.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Pokaži iz vseh zavetišč" }),
    ).toBeNull();
  });

  it("keeps the mobile dock and its shelter picker at a single result", () => {
    // One rabbit, at one shelter. Every facet collapses here: no group has two
    // distinct values, so the filter sheet has no sections, and the shelter
    // list used to be dropped for the same reason, which took the whole dock
    // off the page. That is the one state where the picker is the way back out
    // of a narrow search, so it has to be reachable.
    window.history.replaceState(null, "", "/?vrsta=zajcek");
    const { container } = renderGrid(ANIMALS);

    expect(screen.getByRole("link", { name: /Shelter druga/ })).toBeTruthy();
    expect(
      container.querySelector('[data-slot="mobile-filter-dock"]'),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /Zavetišče:/ }).length,
    ).toBeGreaterThan(0);
  });

  it("hands the picker every shelter, whatever the species tab says", () => {
    // The roster the picker counts and renders is the registry, not the
    // shelter facet of the current query. Measured against the species-filtered
    // pool, /?vrsta=zajcek left it holding only druga, so the trigger promised
    // one shelter over a list that still drew the others and a URL that could
    // already name two of them. Only each shelter's own number moves with the
    // tab.
    window.history.replaceState(null, "", "/?vrsta=zajcek");
    renderGrid(ANIMALS);

    const trigger = screen.getAllByRole("button", { name: /Zavetišče:/ })[0];
    expect(trigger.getAttribute("aria-label")).toContain("Vsa zavetišča");

    fireEvent.click(trigger);

    // The roster is the registry (three shelters), not the species-filtered
    // pool /?vrsta=zajcek leaves standing (druga alone): every shelter still
    // renders as a row, whatever the tab.
    const dialog = screen.getByRole("dialog");
    for (const id of ["muri", "tretje", "druga"]) {
      expect(dialog.querySelector(`[data-shelter-row='${id}']`)).toBeTruthy();
    }
    // One of the three has the rabbit; the other two say zero rather than
    // disappearing. Read off the rows themselves, because the panel no longer
    // carries the "Zavetišč z živalmi: 1 od 3" line that used to say it: that
    // fraction was the roster reporting it had counted itself, and no press in
    // the dialog acted on it. Each row still wears its own number, which is
    // the number the row is picked on.
    const panel = dialog.querySelector("[data-picker-panel]")!;
    expect(panel.textContent).not.toContain("Zavetišč z živalmi");
    const countOf = (id: string) =>
      panel.querySelector(`[data-shelter-row='${id}'] [data-slot='badge']`)!
        .textContent;
    // The digits, then the same number again in the words a screen reader
    // gets: two numbers ride every row and only one of them said what it was
    // counting before this.
    expect(countOf("druga")).toBe("11 žival");
    expect(countOf("muri")).toBe("00 živali");
    expect(countOf("tretje")).toBe("00 živali");
  });

  it("renders the English recovery copy", () => {
    window.history.replaceState(null, "", "/?vrsta=zajcek&zavetisce=muri");
    renderGrid(ANIMALS, "en");

    expect(
      screen.getByText("The selected shelter currently has no other animals."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show from all shelters" }),
    ).toBeTruthy();
  });
});

describe("the empty dataset", () => {
  it("says the animals are still coming without pretending to load them", () => {
    // Four pulsing skeletons used to stand under this line for good, which is
    // a promise that something is on its way on the one page where nothing is.
    const { container } = renderGrid([]);

    expect(
      screen.getByText("Tu bodo živali, ko se dogovorimo s prvimi zavetišči."),
    ).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      0,
    );
  });
});

describe("a filter with nothing left to narrow", () => {
  it("keeps the section that would otherwise strand it", () => {
    // The one rabbit is male, so Spol has a single distinct value on the Ostale
    // tab. The section used to go, and with it the sheet's last section and the
    // Filtri trigger, while spol=samec went on filtering from the URL: an
    // active filter with no control anywhere on the phone that could drop it.
    window.history.replaceState(null, "", "/?vrsta=ostalo&spol=samec");
    renderGrid(ANIMALS);

    expect(screen.getByRole("link", { name: /Shelter druga/ })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Filtri, aktivnih: 1" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("the pre-hydration mark", () => {
  it("comes off once the grid has rendered the address it was opened at", () => {
    // The layout's inline script puts it on before anything paints, because a
    // static export serves the same unfiltered HTML to every filtered link.
    // Left on, the rule in globals.css would keep the results hidden for good.
    document.documentElement.dataset.filtering = "";
    window.history.replaceState(null, "", "/?spol=samec");
    renderGrid(ANIMALS);

    expect(document.documentElement.hasAttribute("data-filtering")).toBe(false);
  });
});

describe("how much of the grid is drawn", () => {
  const many = Array.from({ length: INITIAL_CARDS + 10 }, (_, i) =>
    animal(`dog-${i}`, "dog", "muri"),
  );

  // A list that outlasts the automatic budget at a given column count, with
  // `spare` animals left over for the button to offer.
  function pastTheBudget(columns: number, spare: number) {
    return Array.from({ length: TARGET_ROWS * columns + spare }, (_, i) =>
      animal(`dog-${i}`, "dog", "muri"),
    );
  }

  afterEach(() => {
    window.getComputedStyle = realComputedStyle;
    Reflect.deleteProperty(window, "IntersectionObserver");
  });

  it("draws the first chunk, then grows when the sentinel comes into view", () => {
    stubGridColumns(columnTracks(2));
    const { callbacks } = stubIntersectionObserver();
    renderGrid(many);

    expect(screen.getAllByRole("article")).toHaveLength(INITIAL_CARDS);
    // The result count is over the whole filtered list all the same: only
    // rendering is chunked, so nothing that counts is measured off the page.
    expect(screen.getAllByText(`${many.length} živali`).length).toBeGreaterThan(
      0,
    );

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    expect(screen.getAllByRole("article")).toHaveLength(many.length);
  });

  it("renders the whole list where there is no observer to grow it", () => {
    renderGrid(many);
    expect(screen.getAllByRole("article")).toHaveLength(many.length);
  });

  it("swaps the sentinel for a button once the automatic budget is spent", () => {
    // Two columns, so a step is 30 cards, but the budget is only 80: the
    // first step already overshoots it and clamps down to what is left of
    // the budget instead of running its full stride. Ten more than that, so
    // the button has something left to offer.
    stubGridColumns(columnTracks(2));
    const beyond = pastTheBudget(2, 10);
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(beyond);

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    // The budget is spent: the sentinel is gone, the grid stops growing on
    // its own, and the way on is a real control with the remainder on it.
    const drawn = TARGET_ROWS * 2;
    expect(drawn).toBeLessThan(INITIAL_CARDS + ROWS_PER_STEP * 2);
    expect(screen.getAllByRole("article")).toHaveLength(drawn);
    expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
    const more = screen.getByRole("button", { name: "Prikaži še 10" });
    expect(
      screen.getByText(`${drawn} od ${beyond.length} živali`),
    ).toBeTruthy();

    fireEvent.click(more);

    // Everything is drawn, the button has nothing left to say, and focus
    // stands on the first card the press added rather than falling to body
    // with the unmounted button.
    expect(screen.getAllByRole("article")).toHaveLength(beyond.length);
    expect(screen.queryByRole("button", { name: /Prikaži še/ })).toBeNull();
    const firstAdded = screen.getAllByRole("article")[drawn];
    expect(document.activeElement).toBe(firstAdded.querySelector("a"));
  });

  // Where two columns spend the whole budget in one step, three and four take
  // two, and the second one is short. That is one shape and not two, so it is
  // written once: a wider grid buys proportionally more cards for the same
  // scroll distance (45 a step at three columns, 60 at four), and either way a
  // full second stride would run past the budget, which is the case the clamp
  // exists for. The spare each one is given is what the button is then left to
  // offer: the remainder at three columns, a full press worth at four.
  it.each([
    { columns: 3, spare: 10 },
    { columns: 4, spare: CARDS_PER_CLICK + 10 },
  ])(
    "steps by the columns it draws and clamps the last step at the target ($columns columns)",
    ({ columns, spare }) => {
      expect(INITIAL_CARDS + ROWS_PER_STEP * columns * 2).toBeGreaterThan(
        TARGET_ROWS * columns,
      );

      stubGridColumns(columnTracks(columns));
      const beyond = pastTheBudget(columns, spare);
      const { callbacks } = stubIntersectionObserver();
      const { container } = renderGrid(beyond);

      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });

      // One full stride, short of the budget, so the sentinel stands and
      // nothing interrupts the scroll yet.
      expect(screen.getAllByRole("article")).toHaveLength(
        INITIAL_CARDS + ROWS_PER_STEP * columns,
      );
      expect(container.querySelector("[data-grid-sentinel]")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Prikaži še/ })).toBeNull();

      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });

      // The second step is the short one. The grid settles on the number
      // TARGET_ROWS names rather than a stride past it, and the way on is the
      // button, carrying a press worth or the remainder, whichever is less.
      expect(screen.getAllByRole("article")).toHaveLength(
        TARGET_ROWS * columns,
      );
      expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
      expect(
        screen.getByRole("button", {
          name: `Prikaži še ${Math.min(CARDS_PER_CLICK, spare)}`,
        }),
      ).toBeTruthy();
      expect(
        screen.getByText(`${TARGET_ROWS * columns} od ${beyond.length} živali`),
      ).toBeTruthy();
    },
  );

  it("re-arms the observation on a step that leaves the sentinel standing", () => {
    // An observer reports a change of state and nothing else, so after a step
    // it is still holding "intersecting" and only a delivered leave moves it
    // off that. A reader who is already at the end of the document when a step
    // lands grows the page entirely below the viewport, and measured on
    // 28 August 2026 Chrome did not always report the leave that follows: two
    // of three loads at 1440x900 in a headed browser missed it. The grid froze
    // at one step for good, with no entry left to come and no button to press.
    stubGridColumns(columnTracks(4));
    const beyond = pastTheBudget(4, CARDS_PER_CLICK);
    const { callbacks, calls } = stubIntersectionObserver();
    const { container } = renderGrid(beyond);

    const sentinel = container.querySelector("[data-grid-sentinel]");
    expect(sentinel).toBeTruthy();
    const armed = calls.length;

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    // Still short of the budget, so the sentinel stands, and the step has
    // registered it again rather than leaving the next entry to the geometry.
    expect(container.querySelector("[data-grid-sentinel]")).toBe(sentinel);
    expect(calls.slice(armed)).toEqual([
      { method: "unobserve", node: sentinel },
      { method: "observe", node: sentinel },
    ]);
  });

  it("charges an unmeasurable grid for two columns", () => {
    // Deliberately unstubbed: jsdom lays out nothing, so this is the real
    // computed value the fallback exists for. The step is the two-column one,
    // which the two-column budget then clamps, and a list long enough that a
    // four-column step would show as 120.
    const beyond = pastTheBudget(4, 0);
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(beyond);

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    expect(screen.getAllByRole("article")).toHaveLength(
      Math.min(INITIAL_CARDS + ROWS_PER_STEP * 2, TARGET_ROWS * 2),
    );
    expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
  });

  it("goes back to the first chunk when the filters change", () => {
    stubGridColumns(columnTracks(2));
    const { callbacks } = stubIntersectionObserver();
    renderGrid(many);

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });
    expect(screen.getAllByRole("article")).toHaveLength(many.length);

    // A filter write, taken the way the store hears one. Every animal here is
    // male, so the list holds the same seventy: what matters is that it is a
    // new list, and a new list is read from its top.
    act(() => {
      window.history.replaceState(null, "", "/?spol=samec");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getAllByRole("article")).toHaveLength(INITIAL_CARDS);
  });
});

describe("the chips row inside the grid", () => {
  it("takes a cleared filter state back, and drops the offer once something else is picked", () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState(null, "", "/?zavetisce=muri,druga");
      renderGrid(ANIMALS);

      fireEvent.click(
        screen.getByRole("button", { name: "Počisti vse filtre" }),
      );
      expect(query()).toBe("");

      // The offer stands, and it puts the query back exactly as it was.
      //
      // Two of them, from one component. The chips row carries it at lg and
      // the phone's status line carries it below that (UndoOffer,
      // filter-chips.tsx), and only CSS separates the two surfaces, so jsdom
      // renders both. Either one has to do the whole job, and taking the
      // offer has to end it everywhere.
      const offers = screen.getAllByRole("button", {
        name: "Razveljavi čiščenje filtrov",
      });
      expect(offers).toHaveLength(2);
      fireEvent.click(offers[0]);
      expect(query()).toBe("?zavetisce=muri,druga");
      expect(
        screen.queryAllByRole("button", {
          name: "Razveljavi čiščenje filtrov",
        }),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the offer expire rather than leaving a way back that no longer fits", async () => {
    window.history.replaceState(null, "", "/?zavetisce=muri");
    renderGrid(ANIMALS);

    vi.useFakeTimers();
    try {
      fireEvent.click(
        screen.getByRole("button", { name: "Počisti vse filtre" }),
      );
      expect(
        screen.getAllByRole("button", {
          name: "Razveljavi čiščenje filtrov",
        }).length,
      ).toBeGreaterThan(0);

      act(() => {
        vi.advanceTimersByTime(UNDO_WINDOW_MS + 1000);
      });
    } finally {
      // The row fades out rather than vanishing, and that animation runs on
      // frames rather than on timers, so the assertion waits for real ones.
      vi.useRealTimers();
    }

    await waitFor(() =>
      expect(
        screen.queryAllByRole("button", {
          name: "Razveljavi čiščenje filtrov",
        }),
      ).toHaveLength(0),
    );
  });

  it("offers no cost for a value whose removal would narrow rather than widen", () => {
    // Values inside one facet are OR-ed, so dropping one of two shelters
    // leaves a stricter filter. A row that showed "+N" there would be
    // promising animals that taking it off cannot deliver. The tooltip
    // wrapper is what marks a pill as having a cost worth showing.
    window.history.replaceState(null, "", "/?zavetisce=muri,tretje");
    renderGrid(ANIMALS);

    const chip = screen.getByRole("button", {
      name: "Odstrani filter Shelter muri",
    });
    expect(chip.hasAttribute("data-slot")).toBe(false);
  });

  it("marks the filter that is costing the most when nothing matches", () => {
    // A shelter with only dogs plus the small-animal tab: nothing matches,
    // and dropping the shelter is the cheaper of the two ways out.
    window.history.replaceState(null, "", "/?vrsta=zajcek&zavetisce=muri");
    renderGrid(ANIMALS);

    // Two rows again, and this is the state both of them exist for. At lg the
    // sticky bar's row is on screen; below it that row is gone and the empty
    // state carries its own copy, which is the only place a phone is told
    // which of its filters is the one to drop. Whichever surface the visitor
    // is on, the way out has to be marked, so both are checked.
    const chips = screen.getAllByRole("button", {
      name: "Odstrani filter Shelter muri",
    });
    expect(chips).toHaveLength(2);
    for (const chip of chips) expect(chip.textContent).toContain("+1");
  });
});
