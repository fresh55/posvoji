// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import { cn } from "@/lib/utils";
import {
  countClass,
  filterCardLayoutClass,
  filterCardVariants,
} from "./filter-card";
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
  // sheet prints a step above the sidebar, and each layout keeps its own size
  // whether the card is chosen or not. 11px is a 224px column's size and not a
  // phone's, where the count sat under the 12px label it belongs to; and a
  // chosen card is recoloured, not resized, which the sheet's tile got wrong
  // for a release because the class was hand-copied there.
  it("keeps each layout's count size in both states", () => {
    for (const checked of [true, false]) {
      expect(countClass("sheet", checked)).toContain("text-xs");
      expect(countClass("sheet", checked)).not.toContain("text-2xs");
      expect(countClass("sidebar", checked)).toContain("text-2xs");
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

  // The sidebar is lg-only and mouse-driven, and the panel had two sections
  // below its own fold at 1440x900.
  it("draws the sidebar row 40px tall", () => {
    const row = filterCardLayoutClass("sidebar");

    expect(row).toContain("h-10");
    expect(row).not.toContain("h-11");
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
