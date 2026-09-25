// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  EMPTY_FILTERS,
  goodWithOptions,
  type GoodWithKey,
  type Unanswered,
} from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import {
  installFilterFoldSeams,
  openFilterSection,
} from "@/test/filter-folds";
import { pointerAway, pointerOnto } from "@/test/pointer";
import { FilterGroupList } from "./filter-groups";
import { GoodWithCards } from "./good-with-cards";

installFilterFoldSeams();

const options = goodWithOptions("sl");
const counts = new Map(options.map(({ key }) => [key, 2]));

function renderCards(
  overrides: {
    counts?: Map<string, number>;
    selected?: GoodWithKey[];
    resultCount?: number;
    total?: number;
    locale?: Locale;
    options?: ReturnType<typeof goodWithOptions>;
    layout?: "sidebar" | "sheet";
    onToggle?: (key: GoodWithKey) => void;
    onToggleMany?: (keys: GoodWithKey[]) => void;
    unanswered?: Record<GoodWithKey, Unanswered>;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  const locale = overrides.locale ?? "sl";
  const view = render(
    <I18nProvider locale={locale}>
      <GoodWithCards
        options={overrides.options ?? goodWithOptions(locale)}
        counts={overrides.counts ?? counts}
        selected={overrides.selected ?? []}
        resultCount={overrides.resultCount ?? 70}
        total={overrides.total ?? 489}
        onToggle={onToggle}
        onToggleMany={onToggleMany}
        layout={overrides.layout}
        unanswered={overrides.unanswered}
      />
    </I18nProvider>,
  );
  return { onToggle, onToggleMany, container: view.container };
}

// A render that actually toggles, for the tests below that click a card and
// then look at what a later render did to it: renderCards's default vi.fn()
// never feeds a pick back in as a prop, so `selected` would never change.
function renderStateful() {
  function StatefulCards() {
    const [selected, setSelected] = useState<GoodWithKey[]>([]);
    return (
      <I18nProvider locale="sl">
        <GoodWithCards
          options={options}
          counts={counts}
          selected={selected}
          resultCount={70}
          total={489}
          onToggle={(key) =>
            setSelected((current) =>
              current.includes(key)
                ? current.filter((entry) => entry !== key)
                : [...current, key],
            )
          }
          onToggleMany={() => undefined}
        />
      </I18nProvider>
    );
  }
  render(<StatefulCards />);
}

// The three columns are for the three facets the section can hold. A dataset
// that answers only two of them left the third of the row empty, which the
// drawer's other sections never do because they count their own options.
describe("GoodWithCards sheet columns", () => {
  function columns(options: ReturnType<typeof goodWithOptions>): string {
    const { container } = renderCards({ options, layout: "sheet" });
    const grid = container.querySelector<HTMLElement>("div.grid");
    return grid?.className ?? "";
  }

  it("gives the grid as many columns as there are answers", () => {
    const all = goodWithOptions("sl");

    expect(columns(all)).toContain("grid-cols-3");
    expect(columns(all.slice(0, 2))).toContain("grid-cols-2");
    expect(columns(all.slice(0, 1))).toContain("grid-cols-1");
  });
});

describe("GoodWithCards", () => {
  it("asks about the household rather than naming species", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Doma imam" })).toBeTruthy();
    expect(screen.getByText("Označi, kdo že živi pri tebi.")).toBeTruthy();
  });

  // Per question, because each has its own answers: on the live dataset 12
  // animals had any answer about children and 190 about cats, and one count
  // for the section would have described neither.
  it("says beside each question how many animals it has no answer from", () => {
    renderCards({
      unanswered: {
        kids: { asked: 124, unanswered: 121 },
        dogs: { asked: 124, unanswered: 102 },
        cats: { asked: 124, unanswered: 5 },
      },
    });
    const kids = screen.getByRole("button", { name: /^Otroke, / });
    // A no-break space between the two words and a plain one after the
    // colon, so a tile a third of a phone wide breaks at the colon and never
    // leaves "Brez" alone on its line.
    expect(kids.textContent).toContain("Brez\u00a0podatka: 121");
    expect(
      document.getElementById(kids.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Brez\u00a0podatka: 121");
    expect(
      screen.getByRole("button", { name: /^Psa, / }).textContent,
    ).toContain("Brez\u00a0podatka: 102");
    // Five of 124 is under the tenth the panel bothers saying.
    const cats = screen.getByRole("button", { name: /^Mačko, / });
    expect(cats.textContent).not.toContain("Brez\u00a0podatka");
    expect(cats.getAttribute("aria-describedby")).toBeNull();
    // What a pick does with them, said once under the rows before any pick.
    expect(
      screen.getByText(
        "Izbira pokaže le živali, za katere je zavetišče odgovorilo.",
      ),
    ).toBeTruthy();
  });

  // /?zavetisce=zonzani: the shelter answered none of the three for any of its
  // 23 animals, so every row reads 0 and there is no pick to explain.
  it("says the shelter answered for none of them when no row has an answer", () => {
    renderCards({
      counts: new Map([["kids", 0], ["dogs", 0], ["cats", 0]]),
      unanswered: {
        kids: { asked: 23, unanswered: 23 },
        dogs: { asked: 23, unanswered: 23 },
        cats: { asked: 23, unanswered: 23 },
      },
    });
    expect(
      screen.getByText("Za nobeno od teh živali zavetišče ni odgovorilo."),
    ).toBeTruthy();
    expect(screen.queryByText(/^Izbira pokaže/)).toBeNull();
  });

  // One row with no answer and one a visitor can still pick: the sentence is
  // about the one that can be picked, and it is true.
  it("keeps the pick sentence while a pickable row leaves animals out", () => {
    renderCards({
      counts: new Map([["kids", 0], ["dogs", 3], ["cats", 9]]),
      unanswered: {
        kids: { asked: 23, unanswered: 23 },
        dogs: { asked: 23, unanswered: 20 },
        cats: { asked: 23, unanswered: 1 },
      },
    });
    expect(
      screen.getByText(
        "Izbira pokaže le živali, za katere je zavetišče odgovorilo.",
      ),
    ).toBeTruthy();
  });

  // On a tile the line went between the label and the count, and at a third
  // of a phone it wrapped, so a tile read "Otroke, Brez podatka:, 121, 2":
  // two bare numbers one above the other.
  it("puts the count before the line on a phone tile", () => {
    renderCards({
      layout: "sheet",
      counts: new Map([["kids", 7], ["dogs", 9], ["cats", 8]]),
      unanswered: {
        kids: { asked: 124, unanswered: 121 },
        dogs: { asked: 124, unanswered: 102 },
        cats: { asked: 124, unanswered: 5 },
      },
    });
    expect(
      screen.getByRole("button", { name: /^Otroke, / }).textContent,
    ).toBe("Otroke7Brez\u00a0podatka: 121");
  });

  it("hands that sentence to the outcome once something is picked", () => {
    renderCards({
      selected: ["kids"],
      unanswered: {
        kids: { asked: 124, unanswered: 121 },
        dogs: { asked: 2, unanswered: 1 },
        cats: { asked: 2, unanswered: 1 },
      },
    });
    expect(
      screen.queryByText(
        "Izbira pokaže le živali, za katere je zavetišče odgovorilo.",
      ),
    ).toBeNull();
    expect(
      screen.getByText(/Živali brez podatka so skrite\.$/),
    ).toBeTruthy();
  });

  it("labels the cards so they cannot be read as the species tabs", () => {
    renderCards();

    expect(options.map(({ label }) => label)).toEqual([
      "Otroke",
      "Psa",
      "Mačko",
    ]);
    expect(goodWithOptions("en").map(({ label }) => label)).toEqual([
      "Kids",
      "A dog",
      "A cat",
    ]);
  });

  it("renders one card per facet with its label, count and aria-label", () => {
    renderCards();

    for (const { key, label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      expect(button.textContent).toContain(label);
      expect(button.textContent).toContain(String(counts.get(key)));
    }
  });

  it("reflects selection through aria-pressed", () => {
    renderCards({ selected: ["dogs"] });

    const cards = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    expect(cards.map((card) => card.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("calls onToggle with the facet key", () => {
    const { onToggle } = renderCards();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[0].label}, `) }),
    );
    expect(onToggle).toHaveBeenCalledWith("kids");
  });

  it("locks out a facet no animal can answer, but never an active one", () => {
    renderCards({
      counts: new Map([
        ["kids", 0],
        ["dogs", 0],
        ["cats", 2],
      ]),
      selected: ["dogs"],
    });

    const button = (label: string) =>
      screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      }) as HTMLButtonElement;
    expect(button(options[0].label).disabled).toBe(true);
    expect(button(options[1].label).disabled).toBe(false);
    expect(button(options[2].label).disabled).toBe(false);
  });

  it("draws each facet as its own glyph, in parts the gesture can move", () => {
    renderCards();

    // One glyph per card, and each one made of the parts its gesture needs:
    // the child's head, two eyes and a mouth; the dog's body, crown, two ears,
    // two eyes and a nose; the cat's head, two eyes and a nose.
    const partCounts: Record<GoodWithKey, number> = {
      kids: 4,
      dogs: 7,
      cats: 4,
    };

    for (const { key } of options) {
      const glyph = document.querySelector(`svg[data-good-with-glyph="${key}"]`);
      expect(glyph).not.toBeNull();
      expect(glyph?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(glyph?.querySelectorAll("path")).toHaveLength(partCounts[key]);
    }
  });

  it("clears the whole section from its reset", () => {
    const { onToggleMany } = renderCards({ selected: ["kids", "cats"] });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi, kdo živi pri tebi" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["kids", "cats"]);
  });
});

describe("the outcome sentence", () => {
  const sentence = () =>
    document.querySelector("[aria-live='polite']")?.textContent ?? "";

  it("says nothing while nothing is selected", () => {
    renderCards();

    expect(sentence()).toBe("");
    expect(
      screen.queryByText(/Prikazane so živali/),
    ).toBeNull();
  });

  it("announces itself politely", () => {
    renderCards({ selected: ["kids"] });

    const live = screen.getByText(/^Prikazane so živali/);
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("carries the preposition of whichever facet comes first", () => {
    renderCards({ selected: ["kids"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z\u00a0otroki: 70 od 489. Živali brez podatka so skrite.",
    );
    cleanup();

    renderCards({ selected: ["dogs"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo s\u00a0psi: 70 od 489. Živali brez podatka so skrite.",
    );
    cleanup();

    renderCards({ selected: ["cats"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z\u00a0mačkami: 70 od 489. Živali brez podatka so skrite.",
    );
  });

  it("joins two and three facets in the fixed card order", () => {
    renderCards({ selected: ["dogs", "kids"], resultCount: 24 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z\u00a0otroki in psi: 24 od 489. Živali brez podatka so skrite.",
    );
    cleanup();

    renderCards({ selected: ["cats", "dogs", "kids"], resultCount: 12 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z\u00a0otroki, psi in mačkami: 12 od 489. Živali brez podatka so skrite.",
    );
  });

  it("reads the same way in English", () => {
    renderCards({ locale: "en", selected: ["kids"], resultCount: 70 });
    expect(sentence()).toBe("Showing animals that get on with kids: 70 of 489. Animals with no answer stay hidden.");
    cleanup();

    renderCards({ locale: "en", selected: ["kids", "dogs"], resultCount: 24 });
    expect(sentence()).toBe(
      "Showing animals that get on with kids and dogs: 24 of 489. Animals with no answer stay hidden.",
    );
    cleanup();

    renderCards({
      locale: "en",
      selected: ["kids", "dogs", "cats"],
      resultCount: 12,
    });
    expect(sentence()).toBe(
      "Showing animals that get on with kids, dogs and cats: 12 of 489. Animals with no answer stay hidden.",
    );
  });
});

describe("interrupted gestures", () => {
  // The glyph used to remount on the key that switched it between "celebrate"
  // and "rest", which threw away the live value Motion was mid-animation on
  // and painted the rest pose in one frame instead of easing to it. Kept
  // mounted, the same svg element carries the gesture through the interrupt.
  it("keeps the same glyph element when another facet's pick interrupts its gesture", () => {
    renderStateful();

    fireEvent.click(screen.getByRole("button", { name: /^Otroke, / }));
    const before = document.querySelector('svg[data-good-with-glyph="kids"]');
    expect(before).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Psa, / }));
    const after = document.querySelector('svg[data-good-with-glyph="kids"]');
    expect(after).toBe(before);
  });
});

describe("hover preview", () => {
  it("previews the gesture for a real mouse and not for a touch", () => {
    renderCards();
    const dogs = screen.getByRole("button", { name: /^Psa, / });

    pointerOnto(dogs, "touch");
    expect(dogs.querySelector("svg[data-good-with-glyph]")?.getAttribute("data-preview")).toBeNull();

    pointerOnto(dogs, "mouse");
    expect(dogs.querySelector("svg[data-good-with-glyph]")?.getAttribute("data-preview")).toBe("true");
  });

  it("does not preview a card that is already picked", () => {
    renderCards({ selected: ["dogs"] });
    const dogs = screen.getByRole("button", { name: /^Psa, / });

    pointerOnto(dogs, "mouse");
    expect(dogs.querySelector("svg[data-good-with-glyph]")?.getAttribute("data-preview")).toBeNull();
  });

  // settledValue is the guard: without it, unticking a card the mouse never
  // left showed the hover preview on top of the leave, the same bug found on
  // Energija.
  it("settles after a click so an untick under the pointer does not replay it", async () => {
    renderStateful();
    const dogs = screen.getByRole("button", { name: /^Psa, / });

    pointerOnto(dogs, "mouse");
    expect(dogs.querySelector("svg[data-good-with-glyph]")?.getAttribute("data-preview")).toBe("true");

    fireEvent.click(dogs);
    expect(dogs.querySelector("svg[data-good-with-glyph]")?.getAttribute("data-preview")).toBeNull();

    fireEvent.click(dogs);
    expect(dogs.querySelector("svg[data-good-with-glyph]")?.getAttribute("data-preview")).toBeNull();

    await pointerAway(dogs);
    pointerOnto(dogs, "mouse");
    expect(dogs.querySelector("svg[data-good-with-glyph]")?.getAttribute("data-preview")).toBe("true");
  });
});

describe("the dead posture", () => {
  it("closes a dead option's eyes and dims it, rather than leaving it upright", () => {
    renderCards({ counts: new Map([["kids", 0], ["dogs", 2], ["cats", 2]]) });

    const dead = screen.getByRole("button", { name: /^Otroke, / });
    const svg = dead.querySelector("svg[data-good-with-glyph]");
    expect(svg?.getAttribute("class")).toContain("opacity-60");
    const eyes = [...(svg?.querySelectorAll("path") ?? [])];
    expect(eyes.some((eye) => eye.getAttribute("class")?.includes("scale-y-[0.08]"))).toBe(true);
  });

  it("leaves a live option's face alone", () => {
    renderCards({ counts: new Map([["kids", 0], ["dogs", 2], ["cats", 2]]) });

    const live = screen.getByRole("button", { name: /^Psa, / });
    const svg = live.querySelector("svg[data-good-with-glyph]");
    expect(svg?.getAttribute("class")).not.toContain("opacity-60");
    const eyes = [...(svg?.querySelectorAll("path") ?? [])];
    expect(eyes.some((eye) => eye.getAttribute("class")?.includes("scale-y-[0.08]"))).toBe(false);
  });
});

describe("the unanswered line after a pick", () => {
  // The line said what a pick would hide, so once a row is picked it has
  // nothing left to warn about. Left on, it kept recomputing against the
  // narrower result and changed a number the visitor never touched.
  it("keeps the line on unpicked rows only", () => {
    renderCards({
      selected: ["kids"],
      unanswered: {
        kids: { asked: 491, unanswered: 479 },
        dogs: { asked: 491, unanswered: 15 },
        cats: { asked: 491, unanswered: 15 },
      },
    });

    const kids = screen.getByRole("button", { name: /^Otroke, / });
    expect(kids.textContent).not.toContain("Brez\u00a0podatka");
    expect(kids.getAttribute("aria-describedby")).toBeNull();
  });
});

describe("FilterGroupList", () => {
  function renderList(goodWith?: Parameters<typeof FilterGroupList>[0]["goodWith"]) {
    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={{
            sex: new Map(),
            age: new Map(),
            size: new Map(),
            energy: new Map(),
            coatColor: new Map(),
            coatLength: new Map(),
            waiting: new Map(),
            shelter: new Map(),
          }}
          toggles={[]}
          toggleTally={new Map()}
          goodWith={goodWith}
          onToggle={() => undefined}
          onToggleMany={() => undefined}
          onToggleProperty={() => undefined}
          onToggleManyProperties={() => undefined}
        />
      </I18nProvider>,
    );
  }

  it("leaves the section out while no facet has data", () => {
    renderList(undefined);
    expect(screen.queryByRole("heading", { name: "Doma imam" })).toBeNull();
  });

  it("shows only the facets that can narrow anything", () => {
    renderList({
      options: options.filter(({ key }) => key === "kids"),
      counts: new Map([["kids", 4]]),
      resultCount: 4,
      total: 20,
      onToggle: () => undefined,
      onToggleMany: () => undefined,
    });

    expect(screen.getByRole("heading", { name: "Doma imam" })).toBeTruthy();
    openFilterSection("Doma imam");
    expect(
      screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed")),
    ).toHaveLength(1);
  });
});
