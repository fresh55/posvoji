// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { domAnimation } from "motion/react";
import { useSyncExternalStore } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { LazyMotion } from "@/components/motion-scope";
import { groupOptions } from "@/lib/filters";
import { cn } from "@/lib/utils";
import {
  CountRoll,
  CountsRollWhile,
  FilterCardTail,
  FilterSelectionMark,
  countClass,
  countDirection,
  filterCardLayoutClass,
  filterCardVariants,
} from "./filter-card";
import { CollapsibleBody } from "./filter-section-header";
import { SexCards } from "./sex-cards";

afterEach(() => cleanup());

// These read the class list rather than a computed style because the bug they
// stand for was never in one class: the tile's surface and the row's were both
// in the output and the stylesheet picked between them. A row that carries no
// tile class at all cannot be beaten by the order Tailwind emits.
describe("the filter card's two surfaces", () => {
  for (const selected of [true, false]) {
    it(`keeps the tile's surface out of a ${
      selected ? "chosen" : "resting"
    } sidebar row`, () => {
      const className = filterCardVariants({ layout: "sidebar", selected });

      expect(className).not.toContain("shadow-xs");
      expect(className).not.toContain("border-border/80");
      expect(className).not.toContain("bg-background");
      expect(className).toContain("border-transparent");
      expect(className).toContain("shadow-none");
    });
  }

  it("fills a chosen sidebar row and leaves a resting one empty", () => {
    const chosen = filterCardVariants({ layout: "sidebar", selected: true });
    const resting = filterCardVariants({ layout: "sidebar", selected: false });

    expect(chosen).toContain("bg-brand");
    expect(chosen).not.toContain("bg-transparent");
    expect(resting).toContain("bg-transparent");
    expect(resting).not.toContain("bg-brand");
  });

  // A ToggleGroup item wears toggleVariants' own data-[state=on] accent, which
  // outranks a bare utility whatever order tailwind-merge leaves it in, so the
  // row has to answer it in the same selector.
  it("answers the toggle group's own chosen state in the sidebar", () => {
    const chosen = filterCardVariants({ layout: "sidebar", selected: true });

    expect(chosen).toContain("data-[state=on]:bg-brand");
    expect(chosen).toContain("data-[state=on]:border-transparent");
    expect(chosen).toContain("data-[state=on]:shadow-none");
  });

  // The tile's active:bg-muted/40 is a pseudo-class that outranks a bare
  // bg-brand for as long as Chrome holds :active after a tap: Velikost's green
  // started 260ms after the tap where Spol's started at 110ms. A chosen tile
  // answers :active itself, so the grey is gone from its class list.
  it("keeps a pressed tile green under the finger in the sheet", () => {
    const chosen = filterCardVariants({ layout: "sheet", selected: true });

    expect(chosen).toContain("active:bg-brand");
    expect(chosen).not.toContain("active:bg-muted/40");
  });

  it("keeps the tile a tile", () => {
    const tile = filterCardVariants({ layout: "sheet", selected: false });

    expect(tile).toContain("shadow-xs");
    expect(tile).toContain("border-border/80");
    expect(tile).toContain("bg-background");
    expect(tile).not.toContain("border-transparent");
  });

  // The weight is stated here because ToggleGroupItem hands the card
  // toggleVariants' font-medium, and half the sections are toggle group items
  // while half are plain buttons. Without this the same drawer printed its
  // labels at two weights.
  it("prints every card's label at one weight", () => {
    for (const layout of ["sidebar", "sheet"] as const) {
      for (const selected of [true, false]) {
        expect(filterCardVariants({ layout, selected })).toContain(
          "font-normal",
        );
      }
    }
  });

  // A tile is a bare button or a toggle item, so it inherits neither of these
  // from ui/button. Without them a tile computed touch-action: auto and
  // user-select: auto: two quick narrowings landed inside the double-tap
  // window and zoomed the page, and a rapid press on a label started a
  // selection over the sheet.
  it("answers a finger rather than a double tap", () => {
    for (const layout of ["sidebar", "sheet"] as const) {
      const card = filterCardVariants({ layout, selected: false });

      expect(card).toContain("touch-manipulation");
      expect(card).toContain("select-none");
    }
  });

  // The count was the one thing on a card that got less legible for being
  // chosen: the resting muted token on the brand fill measures 4.45:1 in light
  // mode, under the 4.5:1 an 11-12px number is held to.
  it("takes the count off the resting ink on a chosen card", () => {
    for (const layout of ["sidebar", "sheet"] as const) {
      const chosen = countClass(layout, true);

      expect(chosen).toContain("text-brand-foreground/");
      expect(chosen).not.toContain("text-muted-foreground");
      expect(countClass(layout, false)).toContain("text-muted-foreground");
    }
  });

  // Two facts about the size, in one place because they are one decision: the
  // count is a step under its label in each layout, and each layout keeps its
  // own size whether the card is chosen or not. 11px is the 224px rail's size
  // and not a phone's, where the count sat under the 12px label it belongs
  // to, and from xl the rail's labels are 14px and its counts 12px; a chosen
  // card is recoloured, not resized, which the sheet's tile got wrong for a
  // release because the class was hand-copied there.
  it("keeps each layout's count size in both states", () => {
    for (const checked of [true, false]) {
      const sheet = countClass("sheet", checked).split(" ");
      expect(sheet).toContain("text-xs");
      expect(sheet).not.toContain("text-2xs");
      expect(sheet.filter((name) => name.startsWith("xl:"))).toEqual([]);

      const sidebar = countClass("sidebar", checked).split(" ");
      expect(sidebar).toContain("text-2xs");
      expect(sidebar).toContain("xl:text-xs");
    }
  });

  // disabled:opacity-50 took the label to 2.08:1, which reads as a tile that
  // failed to paint. It stays in the base for the portal's choice cards, which
  // are disabled while a save is in flight, and the filters' own layout class
  // is what overrides it. Both classes survive the merge as one key, so the
  // later one has to be the filters'.
  it("keeps a dead option's label at full ink in both layouts", () => {
    for (const layout of ["sidebar", "sheet"] as const) {
      const card = filterCardVariants({
        layout,
        selected: false,
        className: cn("flex", filterCardLayoutClass(layout)),
      });

      expect(card).toContain("disabled:opacity-100");
      expect(card).not.toContain("disabled:opacity-50");
      expect(card).toContain("disabled:pointer-events-none");
    }
  });

  // The tiles in a row stretch to the tallest one, and centred content put a
  // tile whose label took two lines 7.5px above its neighbours. jsdom lays
  // nothing out, so the measurement is in filter-drawer-mobile.spec.ts and
  // this pins the class that holds it.
  it("starts every tile's content at the top", () => {
    const tile = filterCardLayoutClass("sheet").split(" ");

    expect(tile).toContain("justify-start");
    expect(tile).not.toContain("justify-center");
  });

  // The sidebar is lg-only and mouse-driven, and the panel had two sections
  // below its own fold at 1440x900.
  it("keeps a compact sidebar minimum while allowing labels to wrap", () => {
    const row = filterCardLayoutClass("sidebar");

    expect(row.split(" ")).toContain("min-h-10");
    expect(row.split(" ")).not.toContain("h-10");
  });
});

// Sex is one of the two sections built on a Radix ToggleGroup. Its own test
// for the tab stop lives here because the section has no test file of its own;
// age states the same thing in age-growth-control.test.tsx.
describe("the sex cards' keyboard model", () => {
  it("makes every option its own tab stop", () => {
    const { container } = render(
      <I18nProvider locale="sl">
        <SexCards
          options={groupOptions("sex", [], "sl")}
          counts={
            new Map([
              ["male", 3],
              ["female", 4],
            ])
          }
          selected={[]}
          onToggle={() => undefined}
        />
      </I18nProvider>,
    );

    const items = container.querySelectorAll<HTMLElement>(
      '[data-slot="toggle-group-item"]',
    );
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});

// Why the fill waits: FilterSelectionMark.
describe("the selection mark's fill", () => {
  const box = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("span[aria-hidden]");

  it("fills a ticked box when its tick arrives", () => {
    const { container } = render(
      <FilterSelectionMark checked appearDelay={0.42} />,
    );

    expect(box(container)?.style.transitionDelay).toBe("0.42s");
  });

  it("empties a box at once", () => {
    const { container } = render(
      <FilterSelectionMark checked={false} appearDelay={0.42} />,
    );

    expect(box(container)?.style.transitionDelay).toBe("");
  });

  it("fills at once where nothing is waited for", () => {
    const { container } = render(<FilterSelectionMark checked />);

    expect(box(container)?.style.transitionDelay).toBe("");
  });

  // The tick used to go transparent with the box as well as fading on its
  // own, so it was gone while the box still had most of its fill. With one
  // ink in both states, the tick's own fade is the only thing taking it out,
  // and that runs on the box's clock.
  it("keeps the mark's ink when it is unticked", () => {
    for (const shape of ["box", "dot"] as const) {
      const ink = (checked: boolean) => {
        const { container, unmount } = render(
          <FilterSelectionMark checked={checked} shape={shape} />,
        );
        const classes = (box(container)?.className ?? "")
          .split(" ")
          .filter((name) => name.startsWith("text-"));
        unmount();
        return classes;
      };

      expect(ink(false), shape).toEqual(ink(true));
      expect(ink(false), shape).not.toContain("text-transparent");
    }
  });

  // Under reduced motion the tick lands at once, and a box easing its colour
  // around it was ten frames of a solid box with nothing in it.
  it("drops the box's colour transition under reduced motion", () => {
    const { container } = render(<FilterSelectionMark checked />);

    expect(box(container)?.className).toContain(
      "motion-reduce:transition-none",
    );
  });
});

/** A count as a caller draws one: inside a LazyMotion it does not open. */
function Count({ value }: { value: number }) {
  return (
    <LazyMotion features={domAnimation}>
      <CountRoll value={value} />
    </LazyMotion>
  );
}

/** The numbers a count is drawing, in document order. */
function drawn(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("span")].filter(
    (span) => span.children.length === 0 && /^\d+$/.test(span.textContent),
  );
}

/** How far a number stands from its line, from the style Motion writes. */
function offset(number: HTMLElement): number {
  const match = /translateY\((-?[\d.]+)px\)/.exec(number.style.transform);
  return match ? Number(match[1]) : 0;
}

const subscribeToNothing = () => () => {};

describe("the count roll", () => {
  it.each([
    [0, 1, 1],
    [1, 0, -1],
    [9, 10, 1],
    [99, 100, 1],
    [100, 99, -1],
    [12, 12, 0],
  ] as const)("reads the direction from %i to %i", (previous, next, direction) => {
    expect(countDirection(previous, next)).toBe(direction);
  });

  it("draws the first number still", () => {
    const { container } = render(<Count value={12} />);

    const [number] = drawn(container);
    expect(drawn(container)).toHaveLength(1);
    expect(number.textContent).toBe("12");
    expect(offset(number)).toBe(0);
    expect(number.style.opacity).toBe("1");
  });

  it("brings a growing number in from below and a shrinking one from above", () => {
    const { container, rerender } = render(<Count value={12} />);

    rerender(<Count value={15} />);
    const grown = drawn(container).find((n) => n.textContent === "15");
    expect(offset(grown!)).toBe(6);
    expect(grown!.style.opacity).toBe("0");

    rerender(<Count value={9} />);
    const shrunk = drawn(container).find((n) => n.textContent === "9");
    expect(offset(shrunk!)).toBe(-6);
  });

  // The rows used to drop the new number in with nothing leaving, so for a
  // frame or two the count was blank.
  it("keeps the old number drawn while the new one arrives, then lets it go", async () => {
    const { container, rerender } = render(<Count value={12} />);

    rerender(<Count value={15} />);
    const [leaving, arriving] = drawn(container);
    expect(leaving.textContent).toBe("12");
    expect(leaving.style.opacity).toBe("1");
    expect(arriving.textContent).toBe("15");

    // It leaves upward, the way the new one is travelling, and is gone once
    // it has.
    await waitFor(() => expect(offset(leaving)).toBeLessThan(-1));
    await waitFor(() =>
      expect(drawn(container).map((n) => n.textContent)).toEqual(["15"]),
    );
  });

  // CollapsibleBody's AnimatePresence initial={false} is remembered by
  // everything below it, so a number that mounted to roll inside a section
  // open at the fold's first render was written straight to its resting
  // place and never moved.
  it("rolls inside a section that was open at the fold's first render", () => {
    const section = (value: number) => (
      <CollapsibleBody>
        <Count value={value} />
      </CollapsibleBody>
    );
    const { container, rerender } = render(section(12));

    rerender(section(15));

    const arriving = drawn(container).find((n) => n.textContent === "15");
    expect(offset(arriving!)).toBe(6);
    expect(arriving!.style.opacity).toBe("0");
  });

  // The sidebar is mounted at every width and drawn from lg only. Below it
  // its counts changed for nobody, and every change started a roll anyway.
  it("changes a count in place where its panel is not drawn", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    try {
      const panel = (value: number) => (
        <CountsRollWhile query="(min-width: 64rem)">
          <Count value={value} />
        </CountsRollWhile>
      );
      const { container, rerender } = render(panel(12));
      const [number] = drawn(container);

      rerender(panel(15));

      expect(drawn(container)).toEqual([number]);
      expect(number.textContent).toBe("15");
      expect(offset(number)).toBe(0);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: original,
      });
    }
  });

  // A shared link restores its filters in the render that ends hydration, so
  // every count changes there. Those are where the page starts, not
  // narrowings anyone made.
  it("lands a count restored during hydration without rolling it", async () => {
    function Restored() {
      const value = useSyncExternalStore(
        subscribeToNothing,
        () => 15,
        () => 12,
      );
      return <Count value={value} />;
    }
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Restored />);
    const recovered: unknown[] = [];

    const root = hydrateRoot(container, <Restored />, {
      onRecoverableError: (error) => recovered.push(error),
    });
    await act(async () => undefined);

    expect(recovered).toEqual([]);
    const numbers = drawn(container);
    expect(numbers.map((n) => n.textContent)).toEqual(["15"]);
    expect(offset(numbers[0])).toBe(0);
    await act(async () => root.unmount());
  });
});

describe("the card's tail", () => {
  // Zdravje and Doma imam describe a row only while enough of its animals
  // have no answer, so the other filters make the line come and go. The count
  // was put in a new parent each time, which remounted it without a roll.
  it("keeps the count's element when a row's description comes and goes", () => {
    const tail = (description?: string) => (
      <FilterCardTail
        layout="sidebar"
        label="Otroke"
        checked={false}
        description={description}
        renderCount={(className) => (
          <span data-count className={className}>
            3
          </span>
        )}
      />
    );
    const { container, rerender } = render(tail());
    const count = container.querySelector("[data-count]");

    rerender(tail("Brez podatka: 12"));
    expect(container.querySelector("[data-count]")).toBe(count);

    rerender(tail());
    expect(container.querySelector("[data-count]")).toBe(count);
  });

  function tailOf(
    layout: "sidebar" | "sheet",
    checked: boolean,
    description?: string,
  ) {
    const { container } = render(
      <FilterCardTail
        layout={layout}
        label="Otroke"
        checked={checked}
        description={description}
        renderCount={(className) => (
          <span data-count className={className}>
            3
          </span>
        )}
      />,
    );
    const label = [...container.querySelectorAll("span")].find(
      (span) => span.textContent === "Otroke",
    );
    const said = [...container.querySelectorAll("span")].find(
      (span) => span.textContent === description,
    );
    return {
      label: [...(label?.classList ?? [])],
      description: [...(said?.classList ?? [])],
      count: [...(container.querySelector("[data-count]")?.classList ?? [])],
    };
  }

  // The classes and not a computed size: jsdom evaluates no media query. From
  // xl the rail is a card column (lib/card-grid.ts) and its labels step up to
  // the 14px of the card facts beside it; at lg it is 224px and keeps 12px.
  it("sets a sidebar label at 12px in the 224px rail and 14px from xl", () => {
    for (const checked of [true, false]) {
      const { label } = tailOf("sidebar", checked);
      expect(label).toContain("text-xs");
      expect(label).toContain("xl:text-sm");
    }
  });

  // The label rests in the foreground now, a step darker than the grey its
  // count keeps, so a row reads label first. Chosen, it takes the fill's ink
  // from the row, and a dead row steps back to the grey.
  it("rests a sidebar label in the foreground and leaves the chosen ink to the row", () => {
    const rest = tailOf("sidebar", false);
    expect(rest.label).toContain("text-foreground");
    expect(rest.label).toContain("group-disabled:text-muted-foreground");
    expect(rest.count).toContain("text-muted-foreground");
    cleanup();

    const chosen = tailOf("sidebar", true);
    expect(chosen.label).toContain("font-medium");
    expect(chosen.label.filter((name) => /^text-(foreground|muted)/.test(name))).toEqual([]);
  });

  it("keeps a row's description one step under its label", () => {
    const { description } = tailOf("sidebar", false, "Plahe ali občutljive živali");
    expect(description).toContain("text-2xs");
    expect(description).toContain("xl:text-xs");
  });

  // The phone sheet does not change: its label is 12px and in the tile's own
  // grey, and nothing in it steps at xl, where the sheet is never drawn.
  it("leaves the sheet's tile type as it was", () => {
    const { label, count } = tailOf("sheet", false);
    expect(label).toContain("text-xs");
    expect(label).not.toContain("text-foreground");
    expect([...label, ...count].filter((name) => name.startsWith("xl:"))).toEqual([]);
  });
});
