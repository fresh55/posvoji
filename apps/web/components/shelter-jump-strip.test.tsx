// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { animalCount } from "@/lib/labels";
import { ShelterJumpStrip, type ShelterJumpChip } from "./shelter-jump-strip";

afterEach(cleanup);

// The hook behind fade-scroll-x needs no stub here. It measures on attach and
// then asks for a ResizeObserver, which jsdom does not have, and the hook
// returns a scroll-listener-only teardown in that case. filter-chips.test.tsx
// renders the same hook the same way.

// animalCount rather than the string written out, so the dual ladder in
// lib/labels.ts is the one this reads, the same as shelter-card.test.tsx.
const shelters: ShelterJumpChip[] = [
  { id: "first", city: "Celje", count: { value: 2, label: animalCount(2, "sl") } },
  { id: "second", city: "Koper", count: { value: 1, label: animalCount(1, "sl") } },
  { id: "third", city: "Maribor" },
];

function renderStrip(chips: ShelterJumpChip[] = shelters) {
  render(<ShelterJumpStrip chips={chips} label="Skok na zavetišče" />);
  return screen.getByRole("list", { name: "Skok na zavetišče" });
}

describe("the phone jump strip", () => {
  it("indexes the register in grid order, one chip per shelter", () => {
    const strip = renderStrip();
    const links = within(strip).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#zavetisce-first",
      "#zavetisce-second",
      "#zavetisce-third",
    ]);
  });

  it("goes away from sm, where the grid draws the towns itself", () => {
    expect(renderStrip().className.split(/\s+/)).toContain("sm:hidden");
  });

  it("scrolls sideways rather than wrapping", () => {
    // The whole point of the rework: seventeen chips in a wrapping block cost
    // two screens above the first card. A class assertion is what jsdom can
    // say here; the height is measured in a real browser.
    const classes = renderStrip().className.split(/\s+/);
    expect(classes).toContain("overflow-x-auto");
    expect(classes).toContain("fade-scroll-x");
    expect(classes).not.toContain("flex-wrap");
  });

  it("prints the bare count and says the noun to a screen reader", () => {
    // The row has no width for "2 živali" beside every town, so the paw and
    // the number carry it visually and the accessible name carries the noun.
    const strip = renderStrip();
    const celje = within(strip).getByRole("link", {
      name: `Celje, ${animalCount(2, "sl")}`,
    });
    expect(celje.textContent).toBe("Celje2");
    expect(celje.querySelector("svg")).not.toBeNull();
  });

  it("gives a shelter without a published list its town and nothing else", () => {
    // The zero test lives in shelters-atlas.tsx, which asks
    // lib/shelter-census.ts; what the strip has to hold is that a chip
    // arriving without a count draws no glyph, no accent and no label.
    const strip = renderStrip();
    const maribor = within(strip).getByRole("link", { name: "Maribor" });
    // No aria-label: the town is the text, and a label repeating it would
    // only be a second copy to keep in step.
    expect(maribor.getAttribute("aria-label")).toBeNull();
    expect(maribor.querySelector("svg")).toBeNull();
    expect(maribor.className).not.toContain("brand");
  });
});
