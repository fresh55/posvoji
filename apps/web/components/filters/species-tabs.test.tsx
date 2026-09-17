// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cat, Dog, Rabbit } from "lucide-react";
import { I18nProvider } from "@/components/i18n-provider";
import { fakeStripLayout } from "@/test/strip-layout";
import { SpeciesTabs } from "./species-tabs";

afterEach(() => cleanup());

// No filters on in this harness, so the roster and the tally are the same
// numbers; the one test that needs them apart says so.
const TALLY = { all: 4, dog: 1, cat: 1, other: 2 };

type TabsProps = Partial<ComponentProps<typeof SpeciesTabs>>;

function tree(overrides: TabsProps = {}) {
  return (
    <I18nProvider locale="en">
      <SpeciesTabs
        value="all"
        onChange={vi.fn()}
        counts={TALLY}
        roster={TALLY}
        {...overrides}
      />
    </I18nProvider>
  );
}

function renderTabs(overrides: TabsProps = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  const result = render(tree({ ...overrides, onChange }));
  return { ...result, onChange };
}

function tab(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}`) });
}

/** Every outline a subtree draws, in the order it draws them. */
function pathData(root: Element) {
  return Array.from(root.querySelectorAll("path")).map((path) =>
    path.getAttribute("d"),
  );
}

// The row's fake layout, shared with the active filters row (test/strip-layout.ts).
// Tabs are TAB_W wide in row order and the row shows BOX_W of them.
const TAB_W = 100;
const BOX_W = 220;

const fakeLayout = () =>
  fakeStripLayout({ itemSelector: "button", itemWidth: TAB_W, boxWidth: BOX_W });

/** The scroll box the tabs live in. */
function row() {
  return tab("All").parentElement as HTMLElement;
}

// The label the tab carries in English, and the lucide icon its drawing is
// copied from. "Other" wears the rabbit; see SPECIES_GLYPHS.
const SPECIES = [
  { name: "Dogs", Icon: Dog },
  { name: "Cats", Icon: Cat },
  { name: "Other", Icon: Rabbit },
] as const;

describe("SpeciesTabs", () => {
  it("renders the way back and every species the dataset holds, each with its count", () => {
    renderTabs({ value: "cat" });

    for (const [name, count] of [
      ["All", 4],
      ["Dogs", 1],
      ["Cats", 1],
      ["Other", 2],
    ] as const) {
      expect(tab(name).textContent).toContain(String(count));
    }

    expect(tab("Cats").getAttribute("aria-pressed")).toBe("true");
    for (const name of ["All", "Dogs", "Other"]) {
      expect(tab(name).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("reports the pressed tab, including the one that was already pressed", () => {
    const { onChange } = renderTabs({ value: "dog" });

    fireEvent.click(tab("Cats"));
    expect(onChange).toHaveBeenCalledWith("cat");

    // Pressing the pressed tab is not a no-op here: the tabs are controlled,
    // and the caller is the one that decides there is nothing to do.
    fireEvent.click(tab("Dogs"));
    expect(onChange).toHaveBeenLastCalledWith("dog");
  });

  it("drops a species the dataset does not hold", () => {
    renderTabs({ roster: { all: 2, dog: 1, cat: 1, other: 0 } });

    expect(screen.queryByRole("button", { name: /^Other/ })).toBeNull();
    expect(tab("Dogs")).toBeTruthy();
  });

  it("keeps every tab, disabled, when there is no dataset at all", () => {
    renderTabs({
      disabled: true,
      counts: { all: 0, dog: 0, cat: 0, other: 0 },
      roster: { all: 0, dog: 0, cat: 0, other: 0 },
    });

    for (const name of ["All", "Dogs", "Cats", "Other"]) {
      // No counts are drawn while disabled, so the name is the label alone.
      const button = screen.getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(true);
    }
    // The fill dims with the tabs it stands under.
    expect(
      document.querySelector('[data-slot="species-fill"]')?.className,
    ).toContain("opacity-50");
  });

  it("hands the pressed tab's background to the one fill in the row", () => {
    renderTabs({ value: "cat" });

    const active = tab("Cats");
    const row = active.parentElement as HTMLElement;
    expect(row.querySelectorAll('[data-slot="species-fill"]').length).toBe(1);

    // The tab keeps the light label and gives up the dark ground, which is
    // the fill's job from hydration on.
    expect(active.className).toContain("text-background");
    expect(active.className).not.toContain("bg-foreground");

    const inactive = tab("Dogs");
    expect(inactive.className).not.toContain("text-background");
    expect(inactive.className).not.toContain("bg-foreground");
  });

  it("draws each species with the paths its lucide icon is drawn from", () => {
    // The paths are copied into animal-glyph-paths.ts so they can be inked
    // in. A lucide upgrade that redraws an animal has to fail here rather
    // than leave the tabs drawing last year's icon, and because the "dobro z"
    // cards read the dog and the cat from that same module, this guards their
    // drawing too.
    const lucide = render(
      <div>
        {SPECIES.map(({ name, Icon }) => (
          <span key={name} data-icon={name}>
            <Icon />
          </span>
        ))}
      </div>,
    );
    const drawn = new Map(
      SPECIES.map(({ name }) => [
        name,
        pathData(
          lucide.container.querySelector(`[data-icon="${name}"]`) as Element,
        ),
      ]),
    );
    cleanup();

    renderTabs();

    for (const { name } of SPECIES) {
      expect(drawn.get(name)?.length).toBeGreaterThan(0);
      expect(pathData(tab(name))).toEqual(drawn.get(name));
    }
    // The way back is a word, not an animal.
    expect(pathData(tab("All"))).toEqual([]);
  });

  it("keeps the label the first span in every tab", () => {
    // The glyph is the svg itself and the fill lives in the row, so nothing
    // is drawn in a span ahead of the label. Other tests read the label off
    // a tab by asking for its first one.
    renderTabs({ value: "dog" });

    for (const name of ["All", "Dogs", "Cats", "Other"]) {
      const label = tab(name).querySelector("span");
      expect(label?.textContent).toBe(name);
      expect(label?.className).toContain("truncate");
    }
  });

  it("steps the whole tab down at the narrowest phones rather than dropping a part of it", () => {
    // At 320 the strip measured 360px inside 288 and "Ostale" was 18px of the
    // rabbit under the mask fade: no name, no count, nothing saying it could
    // be scrolled to. Every part goes down one step instead, which buys back
    // 84px and leaves the four tabs 276px inside 288. Dropping the count from
    // the inactive tabs was the other candidate and was rejected: the fill
    // travels on boxes measured from these buttons, so a count arriving on
    // press moves every one of them while the fill is sliding.
    renderTabs({ value: "all" });

    expect(row().className).toContain("max-[384px]:gap-0.5");

    const dogs = tab("Dogs");
    expect(dogs.className).toContain("max-[384px]:px-1");
    expect(dogs.className).toContain("max-[384px]:gap-0.5");
    expect(dogs.className).toContain("max-[384px]:text-xs");
    expect(dogs.querySelector("svg")?.getAttribute("class")).toContain(
      "max-[384px]:size-3.5",
    );

    // Every tab still carries its count at every width.
    const count = dogs.querySelector("span:last-child");
    expect(count?.textContent).toBe("1");
    expect(count?.className).toContain("max-[384px]:text-2xs");
  });

  it("restarts the glyph of the species that was pressed, drawing the same animal", () => {
    renderTabs({ value: "all" });

    const dogs = tab("Dogs");
    const before = dogs.querySelector("svg");
    const drawnBefore = pathData(dogs);
    const catGlyphBefore = tab("Cats").querySelector("svg");

    fireEvent.click(dogs);

    // A beat is a remount, which is what lets the outline ink in again from
    // nothing. The animal it inks in is the same one.
    expect(dogs.querySelector("svg")).not.toBe(before);
    expect(pathData(dogs)).toEqual(drawnBefore);
    // And it is the pressed tab alone that moves: the cat keeps the very
    // glyph it had, not merely one that looks like it.
    expect(tab("Cats").querySelector("svg")).toBe(catGlyphBefore);
  });

  it("does not beat for Vse, which has no animal to move", () => {
    renderTabs({ value: "dog" });

    const all = tab("All");
    const dogGlyph = tab("Dogs").querySelector("svg");

    fireEvent.click(all);

    expect(all.querySelector("svg")).toBeNull();
    expect(tab("Dogs").querySelector("svg")).toBe(dogGlyph);
  });

  it("does not beat when the pressed tab is the one already pressed", () => {
    renderTabs({ value: "cat" });

    const cats = tab("Cats");
    const before = cats.querySelector("svg");

    fireEvent.click(cats);

    expect(cats.querySelector("svg")).toBe(before);
  });

  it("never hands a tab to scrollIntoView, on mount or on a later selection", () => {
    // The row used to come into view through scrollIntoView, and Chrome moves
    // its sequential focus navigation starting point to whatever element is
    // passed to it. That put the first Tab press of every page load on a
    // species tab, past the skip link, the header, the language switch and
    // every control above the row. jsdom implements no scrollIntoView at all,
    // so this is an assignment rather than a spy over an existing one.
    const scrollIntoView = vi.fn();
    const original = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    const layout = fakeLayout();

    try {
      const { rerender } = renderTabs({ value: "other" });
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(tree({ value: "dog" }));
      expect(scrollIntoView).not.toHaveBeenCalled();

      // And it is not that nothing happened: the row did come into view, by
      // the other road.
      expect(layout.writes.length).toBeGreaterThan(0);
    } finally {
      layout.restore();
      if (original) {
        Object.defineProperty(Element.prototype, "scrollIntoView", original);
      } else {
        delete (Element.prototype as unknown as Record<string, unknown>)
          .scrollIntoView;
      }
    }
  });

  it("scrolls the row to a deep-linked tab that mounts out of view, by the nearest edge", () => {
    // Tabs at 0, 100, 200 and 300, and the row shows 220 of them from 0, so
    // Ostale is off the right end on arrival.
    const layout = fakeLayout();

    try {
      renderTabs({ value: "other" });

      // 180 and not 300: the nearest edge, which is what inline "nearest"
      // used to buy. Scrolling to the tab's left edge would push the three
      // tabs before it further out of the row than they have to be.
      expect(layout.writes).toEqual([180]);
      expect(layout.at(row())).toBe(180);
    } finally {
      layout.restore();
    }
  });

  it("leaves the row where it is when the pressed tab is already in view", () => {
    const layout = fakeLayout();

    try {
      // Psi covers 100 to 200, inside the visible 0 to 220.
      const { rerender } = renderTabs({ value: "dog" });
      expect(layout.writes).toEqual([]);

      // Vse is in view too, so a selection that changes nothing about what can
      // be seen scrolls nothing either.
      rerender(tree({ value: "all" }));
      expect(layout.writes).toEqual([]);
    } finally {
      layout.restore();
    }
  });

  it("brings a later selection back into view from either side", () => {
    const layout = fakeLayout();

    try {
      const { rerender } = renderTabs({ value: "all" });
      expect(layout.writes).toEqual([]);

      // A selection that lands off the right end.
      rerender(tree({ value: "other" }));
      expect(layout.writes).toEqual([180]);

      // And one off the left end, from a row scrolled past it: Psi covers 100
      // to 200 and the row is showing 300 to 520, so it is its left edge that
      // is nearest.
      layout.seed(row(), 300);
      rerender(tree({ value: "dog" }));
      expect(layout.writes).toEqual([180, 100]);
    } finally {
      layout.restore();
    }
  });
});
