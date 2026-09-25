// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  EMPTY_FILTERS,
  facetCounts,
  groupOptions,
  type SpeciesFilter,
} from "@/lib/filters";
import {
  installFilterFoldSeams,
  openFilterSection,
} from "@/test/filter-folds";
import { pointer, pointerAway, pointerOff, pointerOnto } from "@/test/pointer";
import {
  CoatColorCards,
  CoatLengthCards,
  CoatLengthMark,
  earBeat,
} from "./coat-cards";
import type { FilterCardLayout } from "./filter-card";
import { FilterGroupList } from "./filter-groups";

installFilterFoldSeams();

const options = groupOptions("coatColor", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 2]));

function renderColours({
  layout,
  species = "all",
  selected = [],
  longCoat = false,
}: {
  layout: FilterCardLayout;
  species?: SpeciesFilter;
  selected?: string[];
  longCoat?: boolean;
}) {
  render(
    <I18nProvider locale="sl">
      <CoatColorCards
        options={options}
        counts={counts}
        selected={selected}
        onToggle={vi.fn()}
        onToggleMany={vi.fn()}
        layout={layout}
        species={species}
        longCoat={longCoat}
      />
    </I18nProvider>,
  );
}

const button = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label},`) });

const swatchOf = (label: string) =>
  button(label).querySelector("svg[data-swatch]") as SVGSVGElement;

const earsOf = (label: string) =>
  swatchOf(label).querySelector("[data-ears]")?.getAttribute("data-ears") ??
  null;

describe.each(["sidebar", "sheet"] as const)("colour swatches in the %s", (layout) => {
  it.each([
    ["all", "cat"],
    ["cat", "cat"],
    ["dog", "dog"],
    // Ostale's ears are a rabbit's, keyed by the tab like its glyph.
    ["other", "other"],
  ] as const)("a colour picked on the %s tab grows the %s ears", (species, ears) => {
    renderColours({ layout, species, selected: ["black"] });

    expect(earsOf("Črna")).toBe(ears);
  });

  it("gives the dog a nose and the cat none", () => {
    // A round head with floppy ears printed as a helmet until it had a nose;
    // the cat's pointed ears make a face without one.
    renderColours({ layout, species: "dog", selected: ["black"] });
    expect(swatchOf("Črna").querySelector("[data-nose]")).not.toBeNull();
    cleanup();

    renderColours({ layout, species: "cat", selected: ["black"] });
    expect(swatchOf("Črna").querySelector("[data-nose]")).toBeNull();
  });

  it("grows a long coat on a picked colour only while Dolga is picked", () => {
    renderColours({ layout, species: "dog", selected: ["black"], longCoat: true });
    const ears = () => swatchOf("Črna").querySelector("[data-ears]");
    expect(ears()?.hasAttribute("data-long-coat")).toBe(true);
    cleanup();

    renderColours({ layout, species: "dog", selected: ["black"] });
    expect(ears()?.hasAttribute("data-long-coat")).toBe(false);
  });

  it("draws a colour nobody has picked as a plain disc", () => {
    renderColours({ layout, selected: ["black"] });

    expect(earsOf("Rjava")).toBeNull();
    // Everything it draws shares the disc's radius. The sheet's tile used to
    // rest as a small dot inside a ring of its own, which is how a selected
    // radio button looks, on every tile nobody had picked.
    const radii = new Set(
      [...swatchOf("Rjava").querySelectorAll("circle")].map((circle) =>
        circle.getAttribute("r"),
      ),
    );
    expect([...radii]).toEqual(["9.5"]);
  });

  it("shows the tips of the ears to a mouse and not to a finger", () => {
    renderColours({ layout });

    pointerOnto(button("Rjava"), "touch");
    expect(earsOf("Rjava")).toBeNull();

    pointerOnto(button("Rjava"), "mouse");
    expect(earsOf("Rjava")).toBe("cat");
  });

  it("keeps the ear tips down after a press until the pointer leaves", async () => {
    // Unpicking a colour with the mouse still on it dropped the ears only as
    // far as the hover's peek, which read as a pick that had not come off.
    renderColours({ layout });

    pointerOnto(button("Rjava"), "mouse");
    expect(earsOf("Rjava")).toBe("cat");

    fireEvent.click(button("Rjava"));
    // The ears tuck away before they leave the document.
    await waitFor(() => expect(earsOf("Rjava")).toBeNull());

    await pointerAway(button("Rjava"));
    pointerOnto(button("Rjava"), "mouse");
    expect(earsOf("Rjava")).toBe("cat");
  });
});

describe("the animal a colour becomes", () => {
  function StatefulColours({ species }: { species: SpeciesFilter }) {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <I18nProvider locale="sl">
        <CoatColorCards
          options={options}
          counts={counts}
          selected={selected}
          onToggle={(value) =>
            setSelected((current) =>
              current.includes(value)
                ? current.filter((entry) => entry !== value)
                : [...current, value],
            )
          }
          onToggleMany={vi.fn()}
          layout="sidebar"
          species={species}
          longCoat={false}
        />
      </I18nProvider>
    );
  }

  // The dog's ears came up from -80 degrees, overshot 21 degrees outward and
  // grew past 1.18 of their size on the way, and in the palette they arrived
  // as wings 64px across, reaching 7px past the swatch's cell.
  it("brings the dog's ears up through a short swing that does not grow past size", async () => {
    render(<StatefulColours species="dog" />);
    const turns: number[] = [];
    const sizes: number[] = [];
    const observer = new MutationObserver((records) => {
      for (const { target } of records) {
        const pose = (target as Element).closest("[data-ears] g[transform] > g");
        if (pose !== target) continue;
        const { transform } = (target as SVGElement).style;
        turns.push(Number(/rotate\((-?[\d.]+)deg\)/.exec(transform)?.[1] ?? 0));
        sizes.push(Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? 1));
      }
    });
    observer.observe(swatchOf("Črna"), {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true,
    });

    fireEvent.click(button("Črna"));
    await new Promise((resolve) => setTimeout(resolve, 700));
    observer.disconnect();

    expect(turns.length).toBeGreaterThan(5);
    expect(Math.min(...turns)).toBeGreaterThan(-50);
    expect(Math.max(...turns)).toBeLessThan(15);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1.005);
  });

  // Three thin tufts per cheek, drawn behind the head, read as whiskers. The
  // ruff is the head's own outline now, so it is drawn over the hairline that
  // closes the disc and only its outer edge is inked.
  it("draws a long-haired cat's ruff over the edge of its head", () => {
    renderColours({ layout: "sidebar", species: "cat", selected: ["black"], longCoat: true });

    const swatch = swatchOf("Črna");
    const ruff = swatch.querySelector("[data-ruff]") as SVGGElement;
    const hairline = [...swatch.querySelectorAll("circle")].find(
      (circle) => circle.getAttribute("fill") === "none" && !circle.closest("[data-ruff]"),
    ) as SVGCircleElement;
    expect(ruff).not.toBeNull();
    expect(hairline.compareDocumentPosition(ruff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const [fill, edge] = [...ruff.querySelectorAll("path")];
    expect(fill.getAttribute("stroke")).toBeNull();
    expect(edge.getAttribute("fill")).toBe("none");
  });

  it("feathers a long-haired dog's ears below their ends", () => {
    renderColours({ layout: "sidebar", species: "dog", selected: ["black"], longCoat: true });

    // The fringe hangs in the ear's own group, under the ear it grows from.
    const [fringe, ear] = [
      ...swatchOf("Črna").querySelectorAll("[data-ears] g[transform] > g > g path"),
    ];
    const lowest = (path: Element) =>
      Math.max(
        ...(path.getAttribute("d") ?? "")
          .match(/-?[\d.]+/g)!
          .map(Number)
          .filter((_, index) => index % 2 === 1),
      );
    expect(lowest(fringe)).toBeGreaterThan(lowest(ear) + 2);
  });

  // The nose sits on the split, and on Črno-bela its dark half vanished into
  // the black half of the face.
  it("gives a dog's nose a light edge on a two-toned coat only", () => {
    renderColours({ layout: "sidebar", species: "dog", selected: ["black", "black-white"] });

    const nose = (label: string) => swatchOf(label).querySelector("[data-nose]") as SVGPathElement;
    expect(nose("Črno-bela").getAttribute("stroke")).not.toBeNull();
    expect(nose("Črno-bela").getAttribute("paint-order")).toBe("stroke");
    expect(nose("Črna").getAttribute("stroke")).toBeNull();
  });
});

describe("a colour no animal has", () => {
  // The body the swatch is drawn on, which carries its resting size.
  const bodyScale = (label: string) => {
    const body = swatchOf(label).querySelector("g > g") as SVGGElement;
    return Number(/scale\(([\d.]+)\)/.exec(body.style.transform)?.[1] ?? 1);
  };

  function renderWithDead(layout: FilterCardLayout, dead: readonly string[]) {
    render(
      <I18nProvider locale="sl">
        <CoatColorCards
          options={options}
          counts={new Map(options.map(({ value }) => [value, dead.includes(value) ? 0 : 2]))}
          selected={[]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          layout={layout}
          species="all"
          longCoat={false}
        />
      </I18nProvider>,
    );
  }

  // The palette used to be handed only the live colours, and the rest closed
  // up behind a dead one, splitting the solid and two-toned pairs across
  // rows. It now keeps every colour in its cell.
  it("keeps its cell in the palette, in order", () => {
    renderWithDead("sidebar", ["brown", "orange"]);

    const cells = screen
      .getAllByRole("button")
      .filter((cell) => cell.hasAttribute("aria-pressed"))
      .map((cell) => cell.getAttribute("aria-label")?.split(",")[0]);
    expect(cells).toEqual(options.map(({ label }) => label));
  });

  it.each(["sidebar", "sheet"] as const)(
    "is disabled, reads 0 and draws small without ears in the %s",
    (layout) => {
      renderWithDead(layout, ["brown"]);

      const dead = button("Rjava") as HTMLButtonElement;
      expect(dead.disabled).toBe(true);
      expect(dead.textContent).toContain("0");
      expect(bodyScale("Rjava")).toBeLessThan(0.7);
      expect(bodyScale("Črna")).toBe(1);

      // Disabled, so neither the keyboard nor a click reaches it; a pointer
      // already resting on it when it died must not bring its ears out.
      pointerOnto(dead, "mouse");
      expect(earsOf("Rjava")).toBeNull();
    },
  );
});

describe("the coat length glyph", () => {
  const lengths = groupOptions("coatLength", [], "sl");

  function renderLengths() {
    render(
      <I18nProvider locale="sl">
        <CoatLengthCards
          options={lengths}
          counts={new Map(lengths.map(({ value }) => [value, 2]))}
          selected={[]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          layout="sidebar"
        />
      </I18nProvider>,
    );
  }

  const glyphOf = (label: string) =>
    button(label).querySelector("svg[data-coat-glyph]") as SVGSVGElement;

  // The group the coat leans and flattens on: the one the strands hang in.
  const coatGroup = (label: string) =>
    glyphOf(label).querySelector("g.text-muted-foreground")
      ?.parentElement as unknown as SVGGElement;

  // Each strand is one cubic written root first: M root C c1 c2 tip.
  const strands = (label: string) =>
    [...glyphOf(label).querySelectorAll("g.text-muted-foreground path")].map(
      (path) => {
        const n = (path.getAttribute("d") ?? "").match(/-?[\d.]+/g)!.map(Number);
        return { root: { x: n[0], y: n[1] }, tip: { x: n[6], y: n[7] } };
      },
    );

  const fallOf = (label: string) =>
    Math.max(...strands(label).map(({ root, tip }) => tip.y - root.y));

  // How far the lowest tip hangs below the highest root, which is the line
  // the coat flattens toward.
  const depthOf = (label: string) => {
    const top = Math.min(...strands(label).map(({ root }) => root.y));
    return Math.max(...strands(label).map(({ tip }) => tip.y - top));
  };

  const skew = (label: string) =>
    Number(/skewX\((-?[\d.]+)deg\)/.exec(coatGroup(label).style.transform)?.[1] ?? 0);
  const flatten = (label: string) =>
    Number(/scaleY\(([\d.]+)\)/.exec(coatGroup(label).style.transform)?.[1] ?? 1);

  it("hangs each longer coat further, inside the box it is drawn in", () => {
    renderLengths();
    const stroke = Number(glyphOf("Kratka").getAttribute("stroke-width"));

    for (const label of ["Kratka", "Srednja", "Dolga"]) {
      for (const { root, tip } of strands(label)) {
        for (const { x, y } of [root, tip]) {
          expect(x - stroke / 2).toBeGreaterThanOrEqual(0);
          expect(x + stroke / 2).toBeLessThanOrEqual(24);
          expect(y - stroke / 2).toBeGreaterThanOrEqual(0);
          expect(y + stroke / 2).toBeLessThanOrEqual(24);
        }
      }
    }
    // The fall is the one thing the answers differ in, so the column reads
    // as a ramp: Kratka was a 4px strip of lashes before the coat was given
    // the box.
    expect(fallOf("Kratka")).toBeGreaterThan(5);
    expect(fallOf("Srednja")).toBeGreaterThan(fallOf("Kratka") + 3);
    expect(fallOf("Dolga")).toBeGreaterThan(fallOf("Srednja") + 3);
  });

  it("leans the longer coats toward a mouse and holds Kratka still", async () => {
    renderLengths();

    pointerOnto(button("Dolga"), "mouse");
    await waitFor(() => expect(skew("Dolga")).toBeLessThan(-5));
    pointerOff(button("Dolga"));

    pointerOnto(button("Srednja"), "mouse");
    await waitFor(() => expect(skew("Srednja")).toBeLessThan(-3));
    pointerOff(button("Srednja"));

    // 3.5 degrees moved Kratka's tips 0.3px at 24px, so it has no lean.
    pointerOnto(button("Kratka"), "mouse");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(skew("Kratka")).toBe(0);
  });

  it("drops every coat's tips more than a pixel under a press", async () => {
    renderLengths();

    // The glyph is drawn at 24px, one unit to the pixel. The press is the one
    // gesture a phone gets, and Kratka's used to drop its tips 0.4px.
    for (const label of ["Kratka", "Srednja", "Dolga"]) {
      pointer(button(label), "pointerdown", { x: 0, y: 0 });
      await waitFor(() => expect(flatten(label)).toBeLessThan(1));
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(depthOf(label) * (1 - flatten(label))).toBeGreaterThan(1);
      pointer(button(label), "pointerup", { x: 0, y: 0 });
    }
  });

  // A chip or a fact pill draws the coat alone beside a line of text, where
  // the list's shared datum would leave a short coat sitting high.
  it("centres the chip mark on its own drawing", () => {
    for (const value of ["short", "medium", "long", "hairless"]) {
      const { container } = render(<CoatLengthMark value={value} />);
      const group = container.querySelector("svg > g") as SVGGElement;
      const lift = Number(/translate\(0 (-?[\d.]+)\)/.exec(group.getAttribute("transform") ?? "")?.[1]);
      const [arc, ...hairs] = [...group.querySelectorAll("path")].map((path) =>
        (path.getAttribute("d") ?? "").match(/-?[\d.]+/g)!.map(Number),
      );
      // M x y Q cx cy x y: a symmetric arc peaks halfway to its control.
      const top = (arc[1] + arc[3]) / 2;
      const bottom = Math.max(arc[1], ...hairs.map((n) => n[7]));
      expect((top + bottom) / 2 + lift).toBeCloseTo(12, 1);
      cleanup();
    }
  });

  it("stirs no other coat when a length is picked", async () => {
    renderLengths();
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const { target } of records) {
        seen.push((target as SVGElement).style.transform);
      }
    });
    observer.observe(glyphOf("Dolga"), {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true,
    });

    fireEvent.click(button("Kratka"));
    await new Promise((resolve) => setTimeout(resolve, 700));
    observer.disconnect();
    expect(seen.filter((transform) => transform.includes("skew"))).toEqual([]);
  });
});

describe("earBeat", () => {
  // Why: NOTICE_SETTLE in coat-cards.tsx.
  it.each([
    ["cat", -16],
    ["dog", -9],
    ["other", -16],
  ] as const)(
    "turns a %s's ear from wherever it is, the wait inside the track",
    (kind, turn) => {
      for (const side of ["left", "right"] as const) {
        expect(earBeat(kind, side, side, 0.26).animate).toEqual({
          rotate: [null, 0, 0, turn, 0],
        });
      }
    },
  );
});

describe("the colour filter in the list", () => {
  it("takes the species tab and the long coat from the filters", () => {
    const listCounts = facetCounts([], EMPTY_FILTERS, new Date("2026-09-23"));
    listCounts.coatColor.set("black", 2);
    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          layout="sheet"
          filters={{
            ...EMPTY_FILTERS,
            species: "dog",
            coatColor: ["black"],
            coatLength: ["long"],
          }}
          groups={[{ group: "coatColor", options }]}
          counts={listCounts}
          toggles={[]}
          toggleTally={new Map()}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          onToggleProperty={vi.fn()}
          onToggleManyProperties={vi.fn()}
        />
      </I18nProvider>,
    );
    openFilterSection("Videz");

    expect(earsOf("Črna")).toBe("dog");
    expect(
      swatchOf("Črna").querySelector("[data-ears]")?.hasAttribute("data-long-coat"),
    ).toBe(true);
  });
});
