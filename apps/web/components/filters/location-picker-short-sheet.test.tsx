// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleValues } from "@/lib/filters";
import { I18nProvider } from "@/components/i18n-provider";
import { LocationPicker } from "./location-picker";

// The sheet on a screen with no height to spare. jsdom has no layout: it
// resolves no dvh, runs no media query and clips nothing, so nothing here can
// say that the confirm button is on screen at 844x390. That takes a browser.
// What a test can hold is the shape the fix is made of, and the shape is what
// broke: a column whose overflow had nowhere to go, and a height the stage's
// inset and the sheet both have to agree on. Both are readable off the tree.

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => cleanup());

const options = [
  { value: "sever", label: "Zavetišče Sever", city: "Maribor" },
  { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
];

const counts = new Map([
  ["sever", 4],
  ["jug", 7],
]);

async function openPicker() {
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    const toggleMany = (values: string[]) =>
      setSelected((current) => toggleValues(current, values));
    return (
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={selected}
          onToggle={(value) => toggleMany([value])}
          onToggleMany={toggleMany}
          resultCount={11}
        />
      </I18nProvider>
    );
  }
  render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  await screen.findByRole("dialog");
}

const dialog = () => screen.getByRole("dialog");
/** The box both the map stage and the sheet are positioned against, and where
 *  the height they share is declared. */
const ground = () =>
  dialog().querySelector<HTMLElement>("[data-picker-stage]")!;
const stage = () => dialog().querySelector<HTMLElement>("[data-map-stage]")!;
const panel = () =>
  dialog().querySelector<HTMLElement>("[data-picker-panel]")!;

/** Every `[--name:…]` declaration on an element, keyed by whatever variants
 *  stand in front of it. The reserve is declared once for the ordinary case
 *  and once for a viewport too short to spend it, and which viewport gets
 *  which is the part worth asserting. */
function declarations(element: Element, name: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const token of element.className.split(/\s+/)) {
    const at = token.lastIndexOf(`[${name}:`);
    if (at === -1) continue;
    found.set(token.slice(0, at), token.slice(at + name.length + 2, -1));
  }
  return found;
}

/** The column under the tab row: the search box, the list, the note and the
 *  footer, which is everything that has to be reachable. */
function column(): HTMLElement {
  return screen
    .getByLabelText("Kraj, pošta ali zavetišče")
    .closest<HTMLElement>("[data-picker-panel] > div")!;
}

describe("LocationPicker sheet on a short viewport", () => {
  it("declares the height the stage's inset and the sheet share exactly once", async () => {
    await openPicker();

    // Tailwind reads class names out of the source text, so the expression
    // cannot be a JS constant the two elements import. It used to be written
    // out four times, once per element and once more per viewport, and every
    // extra writing was another chance for the two sides to drift; a drift
    // draws the map under the sheet or leaves bare paper above it. One custom
    // property on the box both of them are positioned against is what removed
    // the copies, and the percentage survives the move because var()
    // substitutes tokens: the 100% is resolved by the property it lands in, on
    // an element whose containing block is this same box.
    const heights = declarations(ground(), "--sheet-h");
    expect([...heights.keys()]).toEqual([""]);
    expect(heights.get("")).toBe(
      "min(max(55dvh,27.5rem),calc(100%_-_var(--sheet-reserve)))",
    );

    // And both sides read it rather than restating it.
    expect(stage().className).toContain("bottom-(--sheet-h)");
    expect(panel().className).toContain("h-(--sheet-h)");
    expect(stage().className).not.toContain("bottom-[min(");
    expect(panel().className).not.toContain("h-[min(");
  });

  it("hands part of the map reserve back when the viewport is too short to seat the sheet", async () => {
    await openPicker();

    const reserves = declarations(ground(), "--sheet-reserve");
    const [shortVariant, shortReserve] = [...reserves.entries()].find(
      ([variant]) => variant.includes("short:"),
    )!;

    // The ordinary reserve is what a whole plate needs at this dialog's width
    // plus what the caption under it costs, capped at half the stage so the
    // map cannot bid for a screen the list also has to live on. It used to be
    // a flat 9rem, which paid for the caption alone and left the plate 69px
    // on a 320x568 screen.
    expect(reserves.get("")).toBe("min(calc(var(--plate-h)_+_4rem),50%)");
    expect(declarations(ground(), "--plate-h").get("")).toBe(
      "calc(0.65625*var(--picker-w))",
    );

    // On a viewport short and wide enough that no split is worth having, the
    // reserve is a flat 6rem: there the sheet lands folded and the map has
    // the stage, so this is only what a visitor who raises the sheet anyway
    // is charged, which is the caption and nothing else.
    expect(shortReserve).toBe("6rem");
    // Only where the sheet is the dock. From lg up the panel is a card at the
    // side of the stage with a height of its own, and a shorter reserve there
    // would be answering a question nobody asked.
    expect(shortVariant).toContain("max-lg:");
    // And only where the caption is not wrapping into the room being taken:
    // below sm the credit takes more lines, and the CC BY paragraph going
    // behind the sheet is not a trade this layout may make.
    expect(shortVariant).toContain("sm:");
  });

  it("gives the column holding the list and the footer a scroll of its own", async () => {
    await openPicker();

    // The list is still the one child that gives way, and it still may only
    // give way so far below lg. The column's scroll is what catches whatever
    // is left over once the list has given everything it has, which on a
    // landscape phone is most of the chrome.
    const list = column().querySelector<HTMLElement>(".fade-scroll")!;
    expect(list.className).toContain("min-h-0");
    expect(list.className).toContain("flex-1");
    expect(list.className).toContain("max-lg:min-h-20");

    expect(column().className).toContain("overflow-y-auto");
    expect(column().className).not.toContain("overflow-hidden");
  });

  it("puts the list and the way out inside that scroll, and the fold outside it", async () => {
    await openPicker();

    // What must be reachable: the rows, and the button that closes the dialog
    // on the count behind it. Both are in the scroller, so on a screen that
    // cannot seat them they are scrolled to rather than clipped away.
    const pill = screen.getByRole("button", { name: "Pokaži 11 živali" });
    expect(column().contains(pill)).toBe(true);
    expect(column().querySelector("[data-shelter-row='jug']")).not.toBeNull();

    // And the way out is pinned to the foot of that scroll rather than
    // riding it. The column only scrolls once the chrome above has taken
    // more than the sheet can seat, and at 320x568 it takes about 25px more:
    // in flow that put the pill half under the sheet's bottom edge the
    // moment the picker opened, so the way out had to be scrolled to before
    // it could be read. Sticky keeps it where it already was in the DOM and
    // in the order, and does nothing at all on a viewport with room for the
    // whole column.
    const footer = pill.parentElement!;
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("bottom-0");
    // Rows scroll under it, so it carries an opaque ground of its own.
    expect(footer.className).toContain("bg-background");

    // What must not move: the peek bar folds the sheet and the tab row
    // switches the question, and neither is any use scrolled off the top of
    // the thing it controls. Both are siblings of the column, not children.
    const peek = panel().querySelector<HTMLElement>("[data-picker-peek]")!;
    const collapse = panel().querySelector<HTMLElement>(
      "[data-picker-collapse]",
    )!;
    expect(column().contains(peek)).toBe(false);
    expect(column().contains(collapse)).toBe(false);
  });
});
