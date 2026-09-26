// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Animal, Species } from "@posvoji/schema";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalGrid, INITIAL_CARDS } from "./animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";
import { tabCountAt, tabCountShown, tabPronoun } from "@/lib/labels";
import { stickyRow } from "@/test/filter-rows";
import {
  columnTracks,
  restoreGridColumns,
  stubGridColumns,
  stubIdleCallback,
  stubIntersectionObserver,
} from "@/test/grid-stubs";
// The dialog's chunk, which one test here opens (test/picker-chunks.ts says
// why a suite imports what it opens).
import "@/components/animal-dialog/animal-dialog";

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

afterEach(() => {
  cleanup();
  restoreGridColumns();
  Reflect.deleteProperty(window, "IntersectionObserver");
  window.history.replaceState(null, "", "/");
});

function animal(
  id: string,
  species: Species,
  rest: Partial<Animal> = {},
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
    ...rest,
  };
}

const kids = (answer: "yes" | "no") => ({ goodWith: { kids: answer } });

// Two dogs good with children, one that is not, three nobody answered for,
// and a cat nobody answered for either, which Psi keeps out of everything.
const HOUSEHOLD = [
  animal("dog-ana", "dog", kids("yes")),
  animal("dog-bor", "dog", kids("yes")),
  animal("dog-no", "dog", kids("no")),
  animal("dog-cene", "dog", { sex: "female" }),
  animal("dog-dora", "dog"),
  animal("dog-ema", "dog", { sex: "female" }),
  animal("cat-silent", "cat"),
];

function renderGrid(animals: Animal[], locale: "sl" | "en" = "sl") {
  return render(
    <I18nProvider locale={locale}>
      <AnimalGrid
        animals={animalsForClient(animals)}
        logos={{}}
        referenceDate="2026-01-01"
      />
    </I18nProvider>,
  );
}

function at(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

// A filter write, taken the way the store hears one.
function navigate(search: string) {
  act(() => {
    window.history.replaceState(null, "", `/${search}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

const names = () =>
  [...document.querySelectorAll("[data-card-grid] article")].map(
    (card) => card.querySelector("h3")?.textContent,
  );
const divider = () => screen.queryByRole("heading", { level: 2, name: /^Brez / });

describe("the offer under the matches", () => {
  it("waits until every match is drawn", () => {
    // More matches than the first render draws, so the list has not run out
    // until the step that draws the rest.
    stubGridColumns(columnTracks(2));
    const { callbacks } = stubIntersectionObserver();
    const matches = Array.from({ length: INITIAL_CARDS + 6 }, (_, n) =>
      animal(`match-${n}`, "dog", kids("yes")),
    );
    const silent = Array.from({ length: 5 }, (_, n) => animal(`silent-${n}`, "dog"));
    at("?vrsta=pes&druzba=otroci");
    renderGrid([...matches, ...silent]);

    expect(screen.getAllByRole("article")).toHaveLength(INITIAL_CARDS);
    expect(screen.queryByText(/ni podatka o otrocih/)).toBeNull();

    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

    expect(screen.getAllByRole("article")).toHaveLength(matches.length);
    expect(screen.getByText("Pri 5 psih ni podatka o otrocih.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pokaži jih" })).toBeTruthy();
  });

  it("names what is missing and how many, and draws nothing of the band yet", () => {
    at("?vrsta=pes&druzba=otroci");
    renderGrid(HOUSEHOLD);

    expect(names()).toEqual(["dog-ana", "dog-bor"]);
    const offer = screen.getByRole("button", { name: "Pokaži jih" });
    // The sentence is the button's description, for whoever reaches it by Tab.
    const sentence = document.getElementById(offer.getAttribute("aria-describedby")!);
    expect(sentence?.textContent).toBe("Pri 3 psih ni podatka o otrocih.");
    expect(divider()).toBeNull();
    // The toolbar's count is the matches'.
    expect(screen.getAllByText("2 živali").length).toBeGreaterThan(0);
  });

  it("says it generically when the band lacks more than one answer", () => {
    at("?vrsta=pes&druzba=otroci&velikost=majhna");
    renderGrid([
      animal("dog-small-kids", "dog", { ...kids("yes"), size: "small" }),
      animal("dog-unsized", "dog", { ...kids("yes"), size: undefined }),
      animal("dog-small", "dog", { size: "small" }),
      animal("dog-large", "dog", { size: "large" }),
    ]);

    expect(
      screen.getByText("Pri 2 psih manjka kateri od izbranih podatkov."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pokaži ju" })).toBeTruthy();
  });

  it("draws nothing where no pick hides anything for want of an answer", () => {
    // Every dog here answers the question, the one that says no included.
    at("?vrsta=pes&druzba=otroci");
    renderGrid(HOUSEHOLD.filter(({ goodWith }) => goodWith));
    expect(screen.queryByText(/ni podatka/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pokaži (ga|jo|ju|jih)$/ })).toBeNull();

    cleanup();
    at("");
    renderGrid(HOUSEHOLD);
    expect(screen.queryByText(/ni podatka/)).toBeNull();
  });

  it("is not in the server's render, which has no filters to hide anything", () => {
    at("?vrsta=pes&druzba=otroci");
    const html = renderToString(
      <I18nProvider locale="sl">
        <AnimalGrid
          animals={animalsForClient(HOUSEHOLD)}
          logos={{}}
          referenceDate="2026-01-01"
        />
      </I18nProvider>,
    );
    expect(html).not.toContain("ni podatka");
    expect(html).not.toContain("Pokaži jih");
  });
});

describe("the band once it is shown", () => {
  it("draws a divider and the band's cards after the matches, and focuses the first", () => {
    at("?vrsta=pes&druzba=otroci&razvrsti=ime");
    renderGrid(HOUSEHOLD);

    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));

    // The matches, then the band in the order chosen for the list; never the
    // dog that said no, and never the cat on the dogs' tab.
    expect(names()).toEqual(["dog-ana", "dog-bor", "dog-cene", "dog-dora", "dog-ema"]);
    const heading = divider();
    expect(heading?.textContent).toBe("Brez podatka o otrocih");
    const cards = screen.getAllByRole("article");
    expect(
      heading!.compareDocumentPosition(cards[1]) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      heading!.compareDocumentPosition(cards[2]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The press's button went with the offer, so focus stands on the first
    // card it brought.
    expect(document.activeElement).toBe(
      cards[2].querySelector('[data-slot="card-link"]'),
    );
    // Every count stays the matches'.
    expect(screen.getAllByText("2 živali").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pri 3 psih ni podatka o otrocih.")).toBeNull();
  });

  it("plays the entrance from the band's own first card", () => {
    // Past the dozen the entrance is kept for, so the band's first card would
    // arrive without one if it counted from the top of the list.
    const matches = Array.from({ length: 14 }, (_, n) =>
      animal(`match-${n}`, "dog", kids("yes")),
    );
    at("?vrsta=pes&druzba=otroci");
    renderGrid([...matches, ...HOUSEHOLD]);
    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));

    const cards = screen.getAllByRole("article");
    expect(cards[matches.length + 1].className).not.toContain("fade-in");
    const first = cards[matches.length + 2];
    expect(first.className).toContain("fade-in");
    expect(first.style.animationDelay).toBe("0ms");
    expect(cards[matches.length + 3].style.animationDelay).toBe("30ms");
  });

  it("goes away again at the hide button, which hands focus back to the offer", () => {
    at("?vrsta=pes&druzba=otroci");
    renderGrid(HOUSEHOLD);
    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));

    fireEvent.click(screen.getByRole("button", { name: "Skrij" }));

    expect(names()).toEqual(["dog-ana", "dog-bor"]);
    expect(divider()).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Pokaži jih" }),
    );
  });

  it("stays shown across a filter change that leaves a band, and not after a clear", () => {
    at("?vrsta=pes&druzba=otroci");
    renderGrid(HOUSEHOLD);
    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));

    // No match is female, so the band is all there is, and it stays.
    navigate("?vrsta=pes&druzba=otroci&spol=samica");
    expect(divider()).toBeTruthy();
    expect(names().sort()).toEqual(["dog-cene", "dog-ema"]);

    fireEvent.click(
      within(stickyRow()).getByRole("button", { name: "Počisti filtre" }),
    );
    expect(window.location.search).toBe("?vrsta=pes");
    expect(divider()).toBeNull();

    // Picking again offers the band again rather than drawing it unasked.
    navigate("?vrsta=pes&druzba=otroci");
    expect(divider()).toBeNull();
    expect(screen.getByRole("button", { name: "Pokaži jih" })).toBeTruthy();
  });

  it("closes when a change leaves no band, and stays closed after it", () => {
    at("?vrsta=pes&druzba=otroci");
    renderGrid(HOUSEHOLD);
    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));

    // Only the dogs that answered: nothing is hidden for want of an answer.
    navigate("?vrsta=pes&druzba=otroci&zavetisce=drugje");
    navigate("?vrsta=pes&druzba=otroci");
    expect(divider()).toBeNull();
    expect(screen.getByRole("button", { name: "Pokaži jih" })).toBeTruthy();
  });

  it("is stepped through by the dialog, after the matches", async () => {
    at("?vrsta=pes&druzba=otroci&razvrsti=ime");
    renderGrid(HOUSEHOLD);
    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));

    const card = screen.getByRole("article", { name: "dog-cene" });
    await act(async () => {
      fireEvent.click(card.querySelector('[data-slot="card-link"]')!);
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("dog-cene").length).toBeGreaterThan(0);

    // Back to the last match, and on through the band.
    expect(within(dialog).getAllByRole("button", { name: "Prejšnja žival" }).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Naslednja žival" })[0]);
    });
    expect(
      within(await screen.findByRole("dialog")).getAllByText("dog-dora").length,
    ).toBeGreaterThan(0);
  });
});

describe("how much of the band is drawn", () => {
  const fire = (callbacks: ((entries: { isIntersecting: boolean }[]) => void)[]) =>
    act(() => {
      for (const callback of callbacks) callback([{ isIntersecting: true }]);
    });

  it("carries on from the cards already drawn rather than starting the list again", () => {
    // Two columns: the steps spend the budget at 80 and the button draws the
    // rest of the matches, so the offer stands under a hundred of them.
    stubGridColumns(columnTracks(2));
    const { callbacks } = stubIntersectionObserver();
    const matches = Array.from({ length: 100 }, (_, n) =>
      animal(`match-${n}`, "dog", kids("yes")),
    );
    const silent = Array.from({ length: 12 }, (_, n) => animal(`silent-${n}`, "dog"));
    at("?vrsta=pes&druzba=otroci");
    renderGrid([...matches, ...silent]);
    fire(callbacks);
    fire(callbacks);
    fireEvent.click(screen.getByRole("button", { name: "Pokaži še 20" }));
    expect(screen.getAllByRole("article")).toHaveLength(100);

    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));

    expect(screen.getAllByRole("article")).toHaveLength(112);
    expect(screen.getByText("Konec seznama. 112 od 112 živali.")).toBeTruthy();
  });

  it("never takes cards back off the page with the step after it", () => {
    // Four columns: 24, 84 and 144 are drawn before the budget of 160, and
    // the band opened at 144 draws a first render's worth past the matches.
    stubGridColumns(columnTracks(4));
    const { callbacks } = stubIntersectionObserver();
    const matches = Array.from({ length: 140 }, (_, n) =>
      animal(`match-${n}`, "dog", kids("yes")),
    );
    const silent = Array.from({ length: 30 }, (_, n) => animal(`silent-${n}`, "dog"));
    at("?vrsta=pes&druzba=otroci");
    const { container } = renderGrid([...matches, ...silent]);
    fire(callbacks);
    fire(callbacks);
    expect(screen.getAllByRole("article")).toHaveLength(140);

    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih" }));
    expect(screen.getAllByRole("article")).toHaveLength(140 + INITIAL_CARDS);

    // Past the budget already, so the step settles where the grid is.
    fire(callbacks);
    expect(screen.getAllByRole("article")).toHaveLength(140 + INITIAL_CARDS);
    expect(container.querySelector("[data-grid-sentinel]")).toBeNull();
    expect(screen.getByRole("button", { name: "Pokaži še 6" })).toBeTruthy();
  });
});

describe("the empty state", () => {
  it("offers the band beside its own lines when nothing matches", () => {
    at("?vrsta=pes&druzba=otroci,macke");
    renderGrid([
      animal("dog-kids-no-cats", "dog", { goodWith: { kids: "yes", cats: "no" } }),
      animal("dog-kids", "dog", kids("yes")),
      animal("dog-cats", "dog", { goodWith: { cats: "yes" } }),
      animal("dog-silent", "dog"),
      animal("dog-no", "dog", kids("no")),
    ]);

    expect(screen.getByText("Ni zadetkov.")).toBeTruthy();
    // The reason line stays.
    expect(screen.getByText(/poznamo pri/)).toBeTruthy();
    const offer = screen.getByRole("button", { name: "Pokaži 3 pse brez podatka" });

    fireEvent.click(offer);

    expect(screen.queryByText("Ni zadetkov.")).toBeNull();
    expect(divider()?.textContent).toBe("Brez nekaterih izbranih podatkov");
    expect(names()).toEqual(expect.arrayContaining(["dog-kids", "dog-cats", "dog-silent"]));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(document.activeElement).toBe(
      screen.getAllByRole("article")[0].querySelector('[data-slot="card-link"]'),
    );
    // The toolbar still counts the matches, which are none.
    expect(screen.getAllByText("0 živali").length).toBeGreaterThan(0);

    // Hiding it puts the empty state back, with focus on its offer.
    fireEvent.click(screen.getByRole("button", { name: "Skrij" }));
    expect(screen.getByText("Ni zadetkov.")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Pokaži 3 pse brez podatka" }),
    );
  });
});

describe("the band's words", () => {
  it("declines the tab's noun with the count", () => {
    expect([1, 2, 3, 5, 101].map((n) => tabCountAt(n, "dog", "sl"))).toEqual([
      "1 psu",
      "2 psih",
      "3 psih",
      "5 psih",
      "101 psu",
    ]);
    expect([1, 2, 3, 5].map((n) => tabCountAt(n, "cat", "sl"))).toEqual([
      "1 mački",
      "2 mačkah",
      "3 mačkah",
      "5 mačkah",
    ]);
    expect([1, 2, 5].map((n) => tabCountAt(n, "all", "sl"))).toEqual([
      "1 živali",
      "2 živalih",
      "5 živalih",
    ]);
    expect([1, 2, 3, 5].map((n) => tabCountShown(n, "dog", "sl"))).toEqual([
      "1 psa",
      "2 psa",
      "3 pse",
      "5 psov",
    ]);
    expect([1, 2, 3, 5].map((n) => tabCountShown(n, "cat", "sl"))).toEqual([
      "1 mačko",
      "2 mački",
      "3 mačke",
      "5 mačk",
    ]);
    expect([1, 2, 3, 5].map((n) => tabCountShown(n, "other", "sl"))).toEqual([
      "1 drugo žival",
      "2 drugi živali",
      "3 druge živali",
      "5 drugih živali",
    ]);
    expect(tabCountAt(1, "dog", "en")).toBe("1 dog");
    expect(tabCountShown(3, "other", "en")).toBe("3 other animals");
  });

  it("names the animals by the pronoun their count and gender take", () => {
    expect([1, 2, 3, 101].map((n) => tabPronoun(n, "dog", "sl"))).toEqual([
      "ga",
      "ju",
      "jih",
      "jih",
    ]);
    expect(tabPronoun(1, "cat", "sl")).toBe("jo");
    expect(tabPronoun(1, "all", "sl")).toBe("jo");
    expect(tabPronoun(1, "cat", "en")).toBe("it");
    expect(tabPronoun(4, "cat", "en")).toBe("them");
  });

  it("offers one cat by its own words", () => {
    at("?vrsta=macka&lastnosti=brez-fiv");
    renderGrid([
      animal("cat-tested", "cat", { medical: { fiv: "negative" } }),
      animal("cat-untested", "cat"),
    ]);
    expect(screen.getByText("Pri 1 mački ni podatka o FIV.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pokaži jo" })).toBeTruthy();
  });

  it("speaks English on the English page", () => {
    at("?vrsta=pes&druzba=otroci");
    renderGrid(HOUSEHOLD, "en");
    expect(screen.getByText("No data on kids for 3 dogs.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(screen.getByRole("heading", { name: "No data on kids" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
  });
});
