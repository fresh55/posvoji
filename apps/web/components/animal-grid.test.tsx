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
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnimalGrid,
  CARDS_PER_CLICK,
  INITIAL_CARDS,
  ROWS_PER_STEP,
  ROWS_PER_STEP_BEHIND_DIALOG,
  TARGET_ROWS,
  UNDO_WINDOW_MS,
} from "./animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { chipRows, phoneRow, stickyRow } from "@/test/filter-rows";
import { animalsForClient } from "@/lib/dataset";
import {
  RESULTS_COLUMNS,
  RESULTS_GRID_TRACK,
  RESULTS_RAIL_TRACK,
} from "@/lib/card-grid";
import {
  columnTracks,
  restoreGridColumns,
  stubGridColumns,
  stubIdleCallback,
  stubIntersectionObserver,
} from "@/test/grid-stubs";

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
  vi.unstubAllGlobals();
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

// The grid waits for an idle moment to mount the dialog, and jsdom ships no
// requestIdleCallback: without this the mount waits out the two-second
// fallback instead, which is longer than a test should sit still for. The
// suite below that owns the moment of the mount stubs its own queue over this
// one.
stubIdleCallback();

// motion measures a keyframe by reading the page's scroll position and putting
// it back afterwards, and jsdom has no window.scrollTo to put it back with: the
// call goes to the virtual console as "Not implemented" and prints a stack over
// the run. The dialog renders in this file now, which is what reaches that code
// path, so the no-op belongs here rather than the noise.
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => {},
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

// The grid at rest with its dialog on the page. The mount is a state change,
// and what it mounts is a lazy component whose chunk is fetched: the import is
// awaited rather than a timer run, because it is the same module the lazy
// resolves from. The two flushes after it are the retry React schedules once
// that promise settles, and each is a macrotask so the idle callback the mount
// is scheduled from gets its turn as well.
async function settle() {
  await act(async () => {
    await import("@/components/animal-dialog/animal-dialog");
  });
  for (let flush = 0; flush < 2; flush++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

// The press that opens the dialog re-renders the whole grid: which animal is
// open is an address, so every card renders again inside the one synchronous
// commit the view transition is holding. At sixty cards that was most of the
// freeze between the tap and the first frame on a phone, for a change that
// touches none of them, so the card is memoised and the grid hands it nothing
// that is rebuilt per render.
//
// Counted through the animal itself, the way the fan's own render tests count:
// a getter on what only the card reads says whether that card rendered again.
// The entrance delay is the prop that would defeat all of this, because it is
// an object; it is written once per ordinal (STAGGER_STYLE) and both cards
// here carry one.
describe("animal grid renders", () => {
  it("leaves the other cards alone when one of them opens", async () => {
    const [first, second] = animalsForClient([
      animal("dog-muri", "dog", "muri"),
      animal("dog-tretje", "dog", "tretje"),
    ]);
    let reads = 0;
    const counted = {
      ...second,
      get images() {
        reads++;
        return second.images;
      },
    };
    render(
      <I18nProvider locale="sl">
        <AnimalGrid
          animals={[first, counted]}
          logos={{}}
          referenceDate="2026-01-01"
        />
      </I18nProvider>,
    );

    const drawn = reads;
    expect(drawn).toBeGreaterThan(0);

    // The grid mounts the dialog on idle, which renders the grid again, and
    // the dialog reports that it is there, which used to be a prop of every
    // card and so a render of every card. It is an accessor the host hook
    // holds now (use-animal-dialog-host.ts), so the cards sit through both.
    await settle();
    expect(reads).toBe(drawn);

    const link = screen
      .getAllByRole("link")
      .find((element) => element.textContent?.includes("dog-muri"));
    await act(async () => {
      fireEvent.click(link!);
    });
    await screen.findByRole("dialog", {}, { timeout: 5000 });

    // The grid rendered again, with the dialog in it and the address changed,
    // and the card that has nothing to do with the animal being opened did
    // not.
    expect(window.location.pathname).not.toBe("/");
    expect(reads).toBe(drawn);
  });
});

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

  it("uses the dual shelter form for exactly two selected shelters", () => {
    // Slovenian counts a dual, and two is the count a singular/plural pair
    // gets wrong: "izbrana zavetišča nimajo" is three or more shelters.
    window.history.replaceState(
      null,
      "",
      "/?vrsta=zajcek&zavetisce=muri,tretje",
    );
    renderGrid(ANIMALS);

    expect(
      screen.getByText("Izbrani zavetišči trenutno nimata drugih živali."),
    ).toBeTruthy();
  });

  it("uses the plural shelter form from three selected shelters up", () => {
    // A fourth shelter with no rabbit, so three can be selected while druga,
    // which has the only one, stays out of the selection: the state is still
    // the shelter-only empty one, and only the count has moved past the dual.
    window.history.replaceState(
      null,
      "",
      "/?vrsta=zajcek&zavetisce=muri,tretje,cetrto",
    );
    renderGrid([...ANIMALS, animal("dog-cetrto", "dog", "cetrto")]);

    expect(
      screen.getByText("Izbrana zavetišča trenutno nimajo drugih živali."),
    ).toBeTruthy();
  });

  it("floors the block below lg so the dock cannot cover the footer", () => {
    // The filter dock is fixed over the page end below lg, and this state is
    // short enough that the footer's nav row used to be drawn inside the
    // dock's band: a tap on "Zavetišča" opened the filter sheet. The floor is
    // on the block, not on the footer, because the footer's own docked
    // padding already covers the page end and a second clearance is not the
    // answer to a short page.
    window.history.replaceState(null, "", "/?vrsta=ostalo");
    renderGrid(ANIMALS.filter((a) => a.species !== "rabbit"));

    const block = screen.getByText("Ni zadetkov.").closest("div.py-16");
    expect(block!.className).toContain("max-lg:min-h-[60dvh]");
    expect(block!.className).toContain("justify-center");
  });

  it("keeps its own actions out of the dock's band below lg", () => {
    // The floor above put the block's contents in the middle of a screenful,
    // which is the bottom of the screen: at 375x667 the clear was 44px under
    // the dock and entirely hidden, at 320x568 the primary button was fully
    // covered. Below lg the block starts at the top of its floor and reserves
    // the dock's own clearance underneath, read from the token the button in
    // the corner and the footer's run-off already share. jsdom runs no media
    // query, so what is pinned is the pair of insets and the paw leaving.
    window.history.replaceState(null, "", "/?vrsta=ostalo");
    const { container } = renderGrid(
      ANIMALS.filter((a) => a.species !== "rabbit"),
    );

    const block = screen.getByText("Ni zadetkov.").closest("div.py-16")!;
    expect(block.className).toContain("max-lg:justify-start");
    // pt-6, not the pt-8 this reserved on its own: the phone chip row landed
    // in the same release and measured the same top inset from the other
    // side, against the pills the advice is advice about. The smaller one only
    // moves the actions further from the dock.
    expect(block.className).toContain("max-lg:pt-6");
    expect(block.className).toContain("max-lg:pb-(--back-to-top-bottom)");
    expect(container.querySelector("svg.max-lg\\:hidden")).toBeTruthy();
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
    // Nothing was answered, so there is no thin answer to name.
    expect(screen.queryByText(/poznamo pri/)).toBeNull();
  });

  it("names the thin answer when it is the likeliest reason nothing matched", () => {
    // Psi, Otroke and Mačko on the live dataset can read as no dog being fine
    // with children, when 121 of the 124 had no answer about children at all.
    window.history.replaceState(null, "", "/?vrsta=pes&druzba=otroci");
    renderGrid([
      { ...animal("dog-no", "dog", "muri"), goodWith: { kids: "no" } },
      animal("dog-silent", "dog", "muri"),
      animal("dog-quiet", "dog", "tretje"),
      animal("cat-muri", "cat", "muri"),
    ]);

    expect(screen.getByText("Ni zadetkov.")).toBeTruthy();
    expect(
      screen.getByText("Odnos do otrok poznamo pri 1 od 3 psov."),
    ).toBeTruthy();
    expect(screen.getByText("Poskusi z manj filtri.")).toBeTruthy();
  });

  it("counts Velikost on Vse over the animals it is asked of", () => {
    // Cats are not asked a size, so "od 4 živali" would take in a cat nobody
    // asked, and the line would say the size was known for fewer than it is.
    // The fixture sizes every animal medium, so two of them lose theirs.
    const unsized = (fixture: Animal): Animal => {
      const copy = { ...fixture };
      delete copy.size;
      return copy;
    };
    window.history.replaceState(null, "", "/?velikost=majhna");
    renderGrid([
      { ...animal("dog-large", "dog", "muri"), size: "large" },
      unsized(animal("dog-unsized", "dog", "muri")),
      unsized(animal("rabbit-unsized", "rabbit", "muri")),
      { ...animal("cat-small", "cat", "muri"), size: "small" },
    ]);

    expect(screen.getByText("Ni zadetkov.")).toBeTruthy();
    expect(
      screen.getByText("Velikost poznamo pri 1 od 3 psov in drugih živali."),
    ).toBeTruthy();
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

  it("leaves one clear control per surface once chips can carry it", () => {
    // A shelter is picked, so there is a chip, so both chip rows render: the
    // sticky bar's at lg and the phone's own below it. Nothing matches here,
    // which is the one state the phone's row ends in a clear of its own, and
    // the empty state used to put a second clear button under the pills
    // anyway -- two stacked on a phone, and a third at lg back when the
    // sidebar head carried its own copy too, all of them the same press.
    window.history.replaceState(null, "", "/?vrsta=zajcek&zavetisce=muri");
    renderGrid(ANIMALS);

    // One per surface, and no surface twice, which is also what says no third
    // button stands under the pills. The class tokens are how the two
    // rows are told apart, because only one of them is painted at a time and
    // jsdom paints neither.
    const clears = screen.getAllByRole("button", {
      name: "Počisti filtre",
    });
    expect(clears).toHaveLength(2);
    expect(
      clears.filter((clear) => clear.closest('[class~="lg:hidden"]')),
    ).toHaveLength(1);
    expect(
      clears.filter((clear) => clear.closest('[class~="max-lg:hidden"]')),
    ).toHaveLength(1);

    // The row's own clear clears the filters. The species tab stays: it is
    // the scope the list is read in, not one of the pills, and clearing from
    // under it lands on every rabbit rather than on every animal
    // (use-animal-filters.ts).
    fireEvent.click(
      clears.find((clear) => clear.closest('[class~="lg:hidden"]'))!,
    );

    expect(query()).toBe("?vrsta=ostalo");
  });

  it("draws the phone way out in the wrapping row rather than off the end of a strip", () => {
    // Same state as above, read for where the clear is rather than how many
    // there are. It is back inside the row, because the row below lg no
    // longer scrolls: the pills wrap under the toolbar band and the clear
    // wraps with them. In the strip it was the last item, and measured at
    // 390px with four filters active the pills ran to x 497 and the clear sat
    // at x 514, off the right edge, with nothing on screen saying the strip
    // scrolled sideways.
    window.history.replaceState(null, "", "/?vrsta=zajcek&zavetisce=muri");
    renderGrid(ANIMALS);

    const row = phoneRow();
    expect(row.className).toContain("lg:hidden");
    // Nothing in it scrolls sideways, so there is no end to fall off.
    expect(row.querySelector('[class*="overflow-x-auto"]')).toBeNull();

    const clear = within(row).getByRole("button", { name: "Počisti filtre" });
    // The row's own clear, walked by the arrow keys with the pills it clears,
    // and not the outline button the empty state used to draw under them: the
    // state draws no chips and no clear of its own any more, so the two rows
    // on the page are both the filters' own.
    expect(clear.closest("[role='toolbar']")).not.toBeNull();
    expect(chipRows()).toHaveLength(2);
    expect(
      screen
        .getAllByRole("button", { name: "Počisti filtre" })
        .filter((button) => button.getAttribute("data-slot") === "button"),
    ).toHaveLength(0);

    fireEvent.click(clear);
    expect(query()).toBe("?vrsta=ostalo");
  });

  it("offers the species' own way back where no chip row exists", () => {
    // The species tab is the one filter that makes no chip (it undoes itself
    // in a press of its own tab), so an empty tab with nothing else on has no
    // chips row on either surface, and a clear would leave the species
    // standing anyway. The only thing left to undo is the species, so that
    // is what the button says and does.
    window.history.replaceState(null, "", "/?vrsta=ostalo");
    renderGrid(ANIMALS.filter((a) => a.species !== "rabbit"));

    expect(
      screen.queryAllByRole("button", { name: "Počisti filtre" }),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Pokaži vse vrste (3)" }));

    expect(query()).toBe("");
  });

  it.each([
    ["sl", "Pokaži vse vrste (1)"],
    ["en", "Show all species (1)"],
  ] as const)("offers cross-species recovery with active chips in %s", (locale, name) => {
    window.history.replaceState(null, "", "/?vrsta=ostalo&zavetisce=muri&spol=samec");
    renderGrid(ANIMALS, locale);

    fireEvent.click(screen.getByRole("button", { name }));

    const params = new URLSearchParams(query());
    expect(params.has("vrsta")).toBe(false);
    expect(params.get("zavetisce")).toBe("muri");
    expect(params.get("spol")).toBe("samec");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "dog-muri" })).toBeTruthy();
  });

  it.each(["?vrsta=ostalo&spol=samica", "?spol=samica"])("offers no species recovery when no species matches for %s", (search) => {
    window.history.replaceState(null, "", `/${search}`);
    renderGrid(ANIMALS);

    expect(screen.getByText("Ni zadetkov.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pokaži vse vrste/ })).toBeNull();
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

  it("hands the picker every shelter, whatever the species tab says", async () => {
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
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
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
    expect(countOf("muri")).toBe("00 živali s temi filtri");
    expect(countOf("tretje")).toBe("00 živali s temi filtri");
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
    // The count covers the stand-in below as well: with no dataset there is
    // nothing for a filtered link to be waiting for either.
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

  it("keeps Posvojitev under the press that turns it off", () => {
    // Nobody on Ostale is on hold here, so the section is drawn only because
    // its row is on. Pressing it off took the section away, and the keyboard
    // focus on its row with it.
    window.history.replaceState(null, "", "/?vrsta=ostalo&posvojitev=na-voljo");
    const { container } = renderGrid([
      { ...animal("dog-hold", "dog", "muri"), status: "hold" },
      animal("rabbit-druga", "rabbit", "druga"),
    ]);
    const rail = container.querySelector("aside")!;
    const row = within(rail).getByRole("button", { name: /^Samo na voljo,/ });
    row.focus();

    fireEvent.click(row);

    expect(row.isConnected).toBe(true);
    expect(row.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(row);
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

  it("leaves something standing where the hidden results are", () => {
    // The rule in globals.css hides the whole results block, tabs and count
    // and sort control included, so a shared filtered link opened on nothing
    // at all until this. jsdom applies no stylesheet, so what is pinned here
    // is the shape the rule acts on: the stand-in is in the markup, it is
    // outside the block being hidden, and it says nothing to a screen reader.
    const { container } = renderGrid(ANIMALS);

    const pending = container.querySelector('[data-slot="results-pending"]');
    expect(pending).toBeTruthy();
    expect(pending!.closest('[data-slot="results"]')).toBeNull();
    expect(pending!.getAttribute("aria-hidden")).toBe("true");
    // Six cards and the bar standing in for the toolbar above them.
    expect(pending!.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7);
  });

  it("stands the cards in the column they will arrive in", () => {
    // The stand-in and the block it stands in for are siblings, so nothing
    // makes them agree about the page's shape except the string they share.
    // Drawn as one full-width column while the results draw two, the whole
    // grid jumped 256px sideways the moment hydration landed, on precisely
    // the filtered links people share. jsdom applies no stylesheet, so what
    // is pinned is that both wear the track and that the cards are in the
    // second of its two columns.
    const { container } = renderGrid(ANIMALS);

    const pending = container.querySelector('[data-slot="results-pending"]')!;
    const results = container.querySelector('[data-slot="results"]')!;
    expect(results.className).toContain(RESULTS_COLUMNS);
    expect(pending.className).toContain(RESULTS_COLUMNS);
    expect(pending.children).toHaveLength(1);
    expect(pending.children[0].className).toContain(RESULTS_GRID_TRACK);
  });

  it("reads in the order the page is used in, and draws in the other one", () => {
    // The toolbar over the cards holds the species tabs and the sort control,
    // and with the panel rendered first they were the 26th tab stop of the
    // page, behind 14 to 32 stops of filters. The results come first in the
    // document now and the two tracks put the drawing back, so what is pinned
    // here is both halves: the reading order, and that neither element is
    // left to auto-placement.
    const { container } = renderGrid(ANIMALS);

    const results = container.querySelector('[data-slot="results"]')!;
    const rail = results.querySelector("aside")!;
    const column = results.querySelector(`[class*="${RESULTS_GRID_TRACK}"]`)!;

    expect(rail.className).toContain(RESULTS_RAIL_TRACK);
    expect(column.querySelector("[data-card-grid]")).toBeTruthy();
    expect(
      column.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("holds a screenful so the footer stays under the fold", () => {
    // Six cards are 613px of a 1321px document on a 390x844 phone, which puts
    // the footer 70px below the fold and 14px below it on a 932 one; the grid
    // that replaces them is 9667px, so any of that showing is a shift. The
    // height is the stand-in's job, not the cards'.
    const { container } = renderGrid(ANIMALS);

    const pending = container.querySelector('[data-slot="results-pending"]');
    expect(pending!.className).toContain("min-h-[100dvh]");
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
    restoreGridColumns();
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

  // Both ways the grid grows are this component's, so a browser with our
  // scripts off keeps whatever the export drew and is told nothing about the
  // rest. The fallback under the grid is drawn exactly where there is a rest.
  //
  // Whether it is drawn, and not what is inside it: react-dom's client
  // renderer treats a <noscript> as text content and drops element children,
  // where the server renderer that writes the exported HTML keeps them. The
  // sentence and its link are verified against the built page.
  it("carries a scriptless fallback only while the export left something behind", () => {
    stubGridColumns(columnTracks(2));
    stubIntersectionObserver();
    const { container } = renderGrid(many);
    expect(container.querySelector("noscript")).not.toBeNull();

    cleanup();
    stubIntersectionObserver();
    const whole = renderGrid(many.slice(0, INITIAL_CARDS));
    expect(whole.container.querySelector("noscript")).toBeNull();
  });

  it("swaps the sentinel for a button once the automatic budget is spent", () => {
    // Two columns, so a step is 30 cards, but the budget is only 80: the
    // second step overshoots it and clamps down to what is left of
    // the budget instead of running its full stride. Ten more than that, so
    // the button has something left to offer.
    stubGridColumns(columnTracks(2));
    const beyond = pastTheBudget(2, 10);
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(beyond);

    for (let step = 0; step < 2; step++) {
      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });
    }

    // The budget is spent: the sentinel is gone, the grid stops growing on
    // its own, and the way on is a real control with the remainder on it.
    const drawn = TARGET_ROWS * 2;
    expect(drawn).toBeLessThan(INITIAL_CARDS + ROWS_PER_STEP * 2 * 2);
    expect(screen.getAllByRole("article")).toHaveLength(drawn);
    expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
    const more = screen.getByRole("button", { name: "Pokaži še 10" });
    expect(
      screen.getByText(`${drawn} od ${beyond.length} živali`),
    ).toBeTruthy();

    fireEvent.click(more);

    // Everything is drawn, the button has nothing left to say, and focus
    // stands on the first card the press added rather than falling to body
    // with the unmounted button.
    expect(screen.getAllByRole("article")).toHaveLength(beyond.length);
    expect(screen.queryByRole("button", { name: /Pokaži še/ })).toBeNull();
    // The count the button stood over stays behind and finishes itself. It
    // used to go with the button, which left the grid ending on blank space
    // with the counter stopped partway and nothing saying that was the lot.
    expect(
      screen.getByText(
        `Konec seznama. ${beyond.length} od ${beyond.length} živali.`,
      ),
    ).toBeTruthy();
    const firstAdded = screen.getAllByRole("article")[drawn];
    // The card's own name link, and not simply its first anchor. The photo
    // block comes first in every card and its anchor is decorative: it is
    // aria-hidden and out of the tab order (photo-gallery.tsx), so focus
    // landing there hands the reading position to an element a screen reader
    // cannot see at all.
    const decorative = firstAdded.querySelector('a[aria-hidden="true"]');
    expect(decorative).toBeTruthy();
    expect(decorative).toBe(firstAdded.querySelector("a"));
    expect(document.activeElement).not.toBe(decorative);
    expect(document.activeElement).toBe(
      firstAdded.querySelector('a:not([aria-hidden="true"])'),
    );
  });

  // Where two columns spend the whole budget in two steps, three and four take
  // three, and the last one is short. That is one shape and not two, so it is
  // written once: a wider grid buys proportionally more cards for the same
  // scroll distance (45 a step at three columns, 60 at four), and either way a
  // full third stride would run past the budget, which is the case the clamp
  // exists for. The spare each one is given is what the button is then left to
  // offer: the remainder at three columns, a full press worth at four.
  it.each([
    { columns: 3, spare: 10 },
    { columns: 4, spare: CARDS_PER_CLICK + 10 },
  ])(
    "steps by the columns it draws and clamps the last step at the target ($columns columns)",
    ({ columns, spare }) => {
      expect(INITIAL_CARDS + ROWS_PER_STEP * columns * 3).toBeGreaterThan(
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
      expect(screen.queryByRole("button", { name: /Pokaži še/ })).toBeNull();

      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });

      expect(container.querySelector("[data-grid-sentinel]")).toBeTruthy();
      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });

      // The third step is the short one. The grid settles on the number
      // TARGET_ROWS names rather than a stride past it, and the way on is the
      // button, carrying a press worth or the remainder, whichever is less.
      expect(screen.getAllByRole("article")).toHaveLength(
        TARGET_ROWS * columns,
      );
      expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
      expect(
        screen.getByRole("button", {
          name: `Pokaži še ${Math.min(CARDS_PER_CLICK, spare)}`,
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

  // One automatic step, at four columns, with the dialog either closed or
  // opened over the grid by the address the render starts at. Both answers are
  // measured the same way and inside one call, because what the step behind a
  // dialog is worth is only sayable against the one in front of it.
  //
  // Counted off the grid element rather than by role: radix hides the rest of
  // the page from the accessibility tree while a modal dialog is open, so the
  // cards behind it answer no role query at all.
  async function oneStep(at: string) {
    window.history.replaceState(null, "", at);
    stubGridColumns(columnTracks(4));
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(pastTheBudget(4, 0));
    // The dialog is fetched rather than imported (animal-grid.tsx), so an
    // address that names an animal gets it a tick after the render that asked
    // for it. What the step budget below reads is the address and not the
    // mount, so the wait is only so that this measurement can say which of the
    // two states it took.
    if (at.includes("zival=")) {
      await waitFor(() =>
        expect(document.querySelector('[role="dialog"]')).toBeTruthy(),
      );
    }
    const dialog = document.querySelector('[role="dialog"]') !== null;

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    const drawn = container.querySelectorAll("[data-card-grid] article").length;
    cleanup();
    return { drawn, dialog };
  }

  it("steps by fewer rows while a dialog stands over the grid", async () => {
    // The same observer entry mounts fewer cards while the dialog is open.
    // Traced on the production build on 4 September 2026 with the CPU
    // throttled four times, the commit of a sixty-card step was a 50ms task,
    // and behind a dialog that is a dropped frame in the middle of a drag of
    // the photo fan. The step behind a dialog is a dozen cards instead, which
    // commits inside a frame.
    const closed = await oneStep("/");
    const behind = await oneStep("/?zival=dog-0");

    expect(closed.dialog).toBe(false);
    expect(closed.drawn).toBe(INITIAL_CARDS + ROWS_PER_STEP * 4);
    expect(behind.dialog).toBe(true);
    expect(behind.drawn).toBe(INITIAL_CARDS + ROWS_PER_STEP_BEHIND_DIALOG * 4);
  });

  it("reaches the same budget behind an open dialog, in more steps", async () => {
    // Nothing is held back behind the dialog, only sliced: the grid walks to
    // the same TARGET_ROWS budget and settles there the same way, so the
    // dialog's own previous and next arrows, which walk the drawn cards, keep
    // gaining reach exactly as they do with it closed.
    window.history.replaceState(null, "", "/?zival=dog-0");
    stubGridColumns(columnTracks(4));
    const spare = 10;
    const beyond = pastTheBudget(4, spare);
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(beyond);

    // One tick for the dialog's own chunk. See oneStep above.
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeTruthy(),
    );

    // A three-row step is shorter than the watched band, so in the browser
    // every step re-arms straight into the next one. Here that is a delivered
    // entry per step, and the sentinel going is the budget being spent.
    let steps = 0;
    while (container.querySelector("[data-grid-sentinel]")) {
      expect(steps).toBeLessThan(TARGET_ROWS);
      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });
      steps += 1;
    }

    expect(steps).toBe(
      Math.ceil(
        (TARGET_ROWS * 4 - INITIAL_CARDS) / (ROWS_PER_STEP_BEHIND_DIALOG * 4),
      ),
    );
    expect(container.querySelectorAll("[data-card-grid] article")).toHaveLength(
      TARGET_ROWS * 4,
    );
    // Settled, and settled the way a closed-dialog grid settles: the last step
    // is the short one the clamp makes of it, the sentinel is gone, and the way
    // on is the button with the remainder on it.
    expect(container.querySelector("[data-card-grid] button")?.textContent).toBe(
      `Pokaži še ${spare}`,
    );
  });

  it("charges an unmeasurable grid for two columns", () => {
    // Deliberately unstubbed: jsdom lays out nothing, so this is the real
    // computed value the fallback exists for. A step adds 30 cards rather
    // than the 60 a four-column grid would add.
    const beyond = pastTheBudget(4, 0);
    const { callbacks } = stubIntersectionObserver();
    const { container } = renderGrid(beyond);

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    expect(screen.getAllByRole("article")).toHaveLength(
      Math.min(INITIAL_CARDS + ROWS_PER_STEP * 2, TARGET_ROWS * 2),
    );
    expect(container.querySelector("[data-grid-sentinel]")).toBeTruthy();
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
  it("offers and restores cleared filters inside the still-open mobile sheet", async () => {
    window.history.replaceState(null, "", "/?zavetisce=muri,druga");
    renderGrid(ANIMALS);
    fireEvent.click(screen.getByRole("button", { name: /^Filtri, / }));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });

    fireEvent.click(within(dialog).getByRole("button", { name: "Počisti filtre" }));
    expect(query()).toBe("");
    const undo = within(dialog).getByRole("button", {
      name: "Razveljavi čiščenje filtrov",
    });
    expect(undo.hasAttribute("disabled")).toBe(false);
    expect(undo.closest(".overflow-y-auto")).toBeNull();

    // The open sheet owns this button for as long as the visitor needs it.
    // Expiring the page's window must not disable a focused footer control.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      undo.focus();
      act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS + 1000));
      expect(undo.hasAttribute("disabled")).toBe(false);
      expect(document.activeElement).toBe(undo);
    } finally {
      vi.useRealTimers();
    }

    fireEvent.click(undo);
    expect(query()).toBe("?zavetisce=muri,druga");
    expect(dialog.getAttribute("data-state")).toBe("open");
    expect(within(dialog).queryByRole("button", {
      name: "Razveljavi čiščenje filtrov",
    })).toBeNull();
  });

  it("starts a fresh Undo window after the sheet closes", async () => {
    window.history.replaceState(null, "", "/?zavetisce=muri,druga");
    renderGrid(ANIMALS);
    fireEvent.click(screen.getByRole("button", { name: /^Filtri, / }));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    const undoName = "Razveljavi čiščenje filtrov";

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(within(dialog).getByRole("button", { name: "Počisti filtre" }));
      act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS * 2));
      fireEvent.click(within(dialog).getByRole("button", { name: "Zapri" }));
      act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS - 1));
      expect(within(phoneRow()).getByRole("button", {
        name: undoName,
        hidden: true,
      })).toBeTruthy();
      act(() => vi.advanceTimersByTime(1));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(screen.queryAllByRole("button", {
      name: undoName,
    })).toHaveLength(0));
  });

  it("takes a cleared filter state back, and drops the offer once something else is picked", () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState(null, "", "/?zavetisce=muri,druga");
      renderGrid(ANIMALS);

      fireEvent.click(
        screen.getByRole("button", { name: "Počisti filtre" }),
      );
      expect(query()).toBe("");

      // The offer stands, and it puts the query back exactly as it was.
      //
      // Two of them, from one component. The sticky bar's chips row carries
      // it at lg and the phone's row under the band carries it below that,
      // each in place of the pills the clear took away (UndoOffer,
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
        screen.getByRole("button", { name: "Počisti filtre" }),
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

    // Named against one of the two rows: both draw the same pills, and the
    // question here is about the pill and not about the surface.
    const chip = within(stickyRow()).getByRole("button", {
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
    // sticky bar's row is on screen; below it the phone's own row under the
    // band is, and it is the only place a phone is told which of its filters
    // is the one to drop. Whichever surface the visitor is on, the way out
    // has to be marked, so both are checked.
    // The marked pill carries the number it draws in its name too.
    const chips = screen.getAllByRole("button", {
      name: "Odstrani filter Shelter muri: +1 žival",
    });
    expect(chips).toHaveLength(2);
    for (const chip of chips) expect(chip.textContent).toContain("+1");
  });

  it("states the same filters once per width, each row in its own band", () => {
    // Below lg the count on the Filtri button was the whole statement: a
    // number, with the names of what it counts a tap away behind the sheet.
    // The row under the band names them, and the sticky bar's copy stays the
    // one drawn at lg, where it costs a wide screen nothing.
    window.history.replaceState(null, "", "/?zavetisce=muri,druga");
    renderGrid(ANIMALS);

    const phone = phoneRow();
    const sticky = stickyRow();
    expect(phone.className).toContain("lg:hidden");
    expect(sticky.closest('[class~="max-lg:hidden"]')).not.toBeNull();
    // In flow under the band and not inside it: the row grows the page rather
    // than the sticky header, so it pushes the grid once instead of holding
    // the pixels for the whole scroll.
    expect(phone.closest('[class~="sticky"]')).toBeNull();

    // Two shelters picked, so two pills, and the same two in both rows.
    for (const row of [phone, sticky]) {
      expect(
        within(row)
          .getAllByRole("button", { name: /^Odstrani filter/ })
          .map((pill) => pill.textContent),
      ).toEqual(["Shelter muri", "Shelter druga"]);
    }
  });

  it("keeps the phone's clear for the state where clearing is the way out", () => {
    // With results on screen the row is a statement of what is on, and
    // clearing everything is one tap away in the sheet's footer the whole
    // time. With nothing matching the row is the way out, so it ends in one.
    // The sticky row carries its own at either count: nothing there is
    // competing for a phone's width.
    window.history.replaceState(null, "", "/?zavetisce=muri,druga");
    const { unmount } = renderGrid(ANIMALS);

    expect(
      within(phoneRow()).queryByRole("button", { name: "Počisti filtre" }),
    ).toBeNull();
    expect(
      within(stickyRow()).getByRole("button", { name: "Počisti filtre" }),
    ).toBeTruthy();

    // The same filter state with nothing left matching it. Unmounted first,
    // because two grids in one document would be four rows.
    unmount();
    window.history.replaceState(null, "", "/?vrsta=zajcek&zavetisce=muri");
    renderGrid(ANIMALS);

    expect(
      within(phoneRow()).getByRole("button", { name: "Počisti filtre" }),
    ).toBeTruthy();
    expect(
      within(stickyRow()).getByRole("button", { name: "Počisti filtre" }),
    ).toBeTruthy();
  });

  it("offers the way back from a clear in the phone's row, where the pills were", () => {
    // What the undo row below the band used to be on its own, now the same
    // row that named the filters: clearing is the one filter action a phone
    // cannot take back by repeating the gesture, and the offer stands in the
    // place the pills it took away were standing.
    window.history.replaceState(null, "", "/?zavetisce=muri");
    renderGrid(ANIMALS);

    fireEvent.click(
      within(stickyRow()).getByRole("button", { name: "Počisti filtre" }),
    );
    expect(query()).toBe("");

    const phone = phoneRow();
    expect(
      within(phone).queryAllByRole("button", { name: /^Odstrani filter/ }),
    ).toHaveLength(0);
    fireEvent.click(
      within(phone).getByRole("button", {
        name: "Razveljavi čiščenje filtrov",
      }),
    );
    expect(query()).toBe("?zavetisce=muri");
  });
});

describe("the long-stay mark in the grid", () => {
  // Every one of these has waited well past the threshold, so the mark is a
  // question about the order and not about the animals.
  const WAITING = ANIMALS.map((entry) => ({
    ...entry,
    intakeDate: "2018-01-01",
  }));

  it("leaves the mark off under the order that already tells the wait", () => {
    // The default sort is longest in shelter, so the mark would be on every
    // card in the list, saying what the order has already said.
    renderGrid(WAITING);

    expect(screen.queryByText(/Čaka/)).toBeNull();
  });

  it("draws it again under any other order", () => {
    window.history.replaceState(null, "", "/?razvrsti=novi");
    renderGrid(WAITING);

    expect(screen.getAllByText(/Čaka/)).toHaveLength(WAITING.length);
  });
});

describe("when the dialog reaches the page", () => {
  // Every test here starts from a module registry of its own. The grid holds
  // the lazy dialog in a module constant, and a lazy that any earlier test in
  // this file resolved renders straight away for the rest of the run, which
  // is exactly the difference these three are measuring. The provider is
  // re-imported with the grid because a context is an identity: the grid from
  // the new registry does not read the one the old registry's provider opens.
  async function freshGrid() {
    vi.resetModules();
    const [{ AnimalGrid }, { I18nProvider: Provider }] = await Promise.all([
      import("./animal-grid"),
      import("@/components/i18n-provider"),
    ]);
    return (animals: Animal[]) =>
      render(
        <Provider locale="sl">
          <AnimalGrid
            animals={animalsForClient(animals)}
            logos={{}}
            referenceDate="2026-01-01"
          />
        </Provider>,
      );
  }

  // jsdom ships no requestIdleCallback and the grid mounts the dialog from
  // one. A queue the test drains by hand puts the grid on the path a browser
  // takes and leaves the moment of the mount to the test, which is the one
  // thing these have to control.
  function idleQueue() {
    const queued: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      queued.push(callback);
      return queued.length;
    });
    vi.stubGlobal("cancelIdleCallback", () => {});
    return async function runIdle() {
      const due = queued.splice(0);
      await act(async () => {
        for (const callback of due) {
          callback({ didTimeout: false, timeRemaining: () => 50 });
        }
      });
      await settle();
    };
  }

  function firstCard() {
    return document.querySelector<HTMLAnchorElement>(
      '[data-card-grid] a[data-slot="card-link"]',
    )!;
  }

  it("mounts it on idle, so the first open lands inside the click", async () => {
    // The 300ms hole this closes, measured on the built export: a dialog
    // first mounted by the click renders its Suspense fallback there, and
    // React holds a commit that only resolves a fallback until 300ms after
    // the fallback was shown. The first open took 350ms and every one after
    // it 40ms. Mounted from idle there is no fallback left to resolve, and
    // the dialog is in the document when the handler returns.
    const runIdle = idleQueue();
    const renderFresh = await freshGrid();
    renderFresh(ANIMALS);
    await runIdle();

    act(() => {
      fireEvent.click(firstCard());
    });

    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("stays off the render that draws the grid", async () => {
    // The chunk is still not in the document: it is asked for when the page
    // has nothing better to do, behind hydration and the first photos, and
    // the visitor who opens no animal at all is who that is for. With idle
    // held back here, the click is left to mount the dialog itself, which is
    // the slow path and not one the grid takes any more.
    idleQueue();
    const renderFresh = await freshGrid();
    renderFresh(ANIMALS);

    act(() => {
      fireEvent.click(firstCard());
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeTruthy(),
    );
  });

  it("mounts it in the first client render for a link naming an animal", async () => {
    // A shared link cannot wait for idle, and here idle never comes: the
    // animal is already chosen in the render that reads the address, so the
    // mount is made in that render instead.
    idleQueue();
    window.history.replaceState(null, "", "/?zival=dog-muri");
    const renderFresh = await freshGrid();
    renderFresh(ANIMALS);

    await settle();

    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });
});
