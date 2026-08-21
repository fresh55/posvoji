// @vitest-environment jsdom
// jsdom lays nothing out, so scrollHeight is mocked rather than measured. The
// mock overrides every element alike, so it cannot reproduce the real bug
// (a div pinned to the block's own height by h-full, whose scrollHeight can
// then never report less than that height) — only jsdom's own layout engine
// could. What it does prove is that the arithmetic between "content this
// tall" and "block this tall" is not secretly biased to grow only, which is
// the symptom a regression here would reintroduce.

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import { calloutType, DEFAULT_PLATE_SCALE, MapCallout } from "./map-callout";

afterEach(() => cleanup());

let mockedScrollHeight = 0;

beforeEach(() => {
  mockedScrollHeight = 0;
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => mockedScrollHeight,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
});

function foreignObjectHeight(container: HTMLElement): number {
  return Number(
    container.querySelector("foreignObject")?.getAttribute("height"),
  );
}

describe("MapCallout height", () => {
  // The default scale is what every test below renders at, so the padding
  // and the floor are read off the same function the component itself
  // calls rather than copied as numbers that could drift from it.
  const type = calloutType(DEFAULT_PLATE_SCALE);
  // What the object carries beyond the measured type: the chip's own vertical
  // padding, and the margin the shadow needs outside the chip. A chip with
  // nothing under its title is padded like a tooltip and the rest like a card,
  // so which padding applies is part of the arithmetic.
  const padded = (content: number, dense = false) =>
    content + (dense ? type.padYTight : type.padY) * 2 + type.bleed * 2;

  it("grows the block to fit a tall one, then shrinks it back for a shorter one", () => {
    mockedScrollHeight = 100;
    const { container, rerender } = render(
      <svg>
        <MapCallout
          x={50}
          y={50}
          reach={5}
          title="A very long title that wraps several times over"
          metadata="two lines of metadata besides it"
        />
      </svg>,
    );

    expect(foreignObjectHeight(container)).toBeCloseTo(padded(100), 5);

    mockedScrollHeight = 50;
    rerender(
      <svg>
        <MapCallout x={50} y={50} reach={5} title="Short" metadata="" />
      </svg>,
    );

    // The bug this guards against measured a div bound to the block's own
    // height, so scrollHeight could only ever hold steady or climb. This
    // checks the number actually came back down, not merely that it moved.
    // Title alone now, so it is a tooltip and padded as one.
    expect(foreignObjectHeight(container)).toBeCloseTo(padded(50, true), 5);
    expect(foreignObjectHeight(container)).toBeLessThan(padded(100));
  });

  it("still floors at the block's own minimum once content is shorter than it", () => {
    mockedScrollHeight = 1;
    const { container } = render(
      <svg>
        <MapCallout x={50} y={50} reach={5} title="Hi" metadata="" />
      </svg>,
    );

    expect(foreignObjectHeight(container)).toBeCloseTo(
      padded(type.floor, true),
      5,
    );
  });

  it("pads a card more than a tooltip, and only vertically", () => {
    mockedScrollHeight = 40;
    const chipStyle = (props: { metadata: string }) =>
      render(
        <svg>
          <MapCallout x={50} y={50} reach={5} title="Zavetišče" {...props} />
        </svg>,
      ).container.querySelector<HTMLElement>("[data-callout-chip]")!.style;

    const card = chipStyle({ metadata: "63 živali" });
    const tooltip = chipStyle({ metadata: "" });

    // A name with a count under it is a small card and wants a card's room; a
    // name on its own is a tooltip and nine points of air over one word is a
    // plaque.
    expect(Number.parseFloat(card.paddingBlock)).toBeGreaterThan(
      Number.parseFloat(tooltip.paddingBlock),
    );
    // The left edge is the same on every chip the plate draws, whatever it is
    // carrying.
    expect(card.paddingInline).toBe(tooltip.paddingInline);
  });
});

function fontSizeOf(container: HTMLElement, selector: string): number {
  const node = container.querySelector<HTMLElement>(selector);
  return Number.parseFloat(node?.style.fontSize ?? "");
}

// A tooltip chip and not a panel: the surface is the site's popover, drawn
// small, and the plate's older card chrome is not coming back with it.
describe("MapCallout as an annotation", () => {
  function annotation() {
    return render(
      <svg>
        <MapCallout x={50} y={100} reach={5} title="Zavetišče" metadata="5" />
      </svg>,
    ).container;
  }

  it("draws no caret and no chrome beyond the chip", () => {
    const container = annotation();

    // The caret was the one path this component ever drew, and it is not
    // coming back: the leader line already answers "which mark is this
    // about", and only when the frame has actually moved the chip off it.
    expect(container.querySelector("path")).toBeNull();
    // The surface is one element. A chip with a second box behind it is the
    // panel this stopped being.
    expect(container.querySelectorAll("[data-callout-chip]")).toHaveLength(1);
  });

  it("keeps the foreignObject, which is what wraps the text", () => {
    const container = annotation();

    expect(container.querySelector("foreignObject")).not.toBeNull();
    expect(container.innerHTML).toContain("break-words");
  });
});

// The annotation sits on a surface now. It was haloed type laid straight on
// the country, which put the contrast at the mercy of whatever region was
// underneath: over the darkest density greens the knockout had to be pushed
// until the names read as stickers. A popover chip makes the same question a
// matter of tokens, and the plate keeps its own quiet by staying small.
describe("MapCallout surface", () => {
  function chipped() {
    return render(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Zavetišče Ljubljana"
          metadata="63 živali"
          note="Zanje skrbi Zavetišče Nova Gorica"
          species={[{ species: "dog", count: 41 }]}
        />
      </svg>,
    ).container;
  }

  const chip = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("[data-callout-chip]")!;

  it("draws a real popover surface under the type", () => {
    const surface = chip(chipped());

    // The site's own popover tokens, so contrast is guaranteed in both themes
    // rather than argued about per region fill.
    expect(surface.className).toContain("bg-popover/95");
    expect(surface.className).toContain("text-popover-foreground");
    // The one corner every surface in the app carries, scaled to the plate.
    expect(surface.className).toContain("rounded-ui");
    expect(Number.parseFloat(surface.style.borderRadius)).toBeGreaterThan(0);
  });

  it("draws its edge as a spread ring, which is the only hairline available", () => {
    const surface = chip(chipped());

    // Never a border: this box is laid out in user units and scaled up by the
    // plate, and Chrome floors a fractional border-width to one whole unit
    // before that transform, which came out as a 2.6-pixel frame on a plate
    // drawn at 2.63. A box-shadow spread honours the fraction.
    expect(surface.style.borderWidth).toBe("");
    expect(surface.className).not.toContain("border-border");
    expect(surface.style.getPropertyValue("--callout-ring")).toMatch(
      /^0 0 0 [\d.]+px var\(--border\)$/,
    );
  });

  it("lifts on light and keeps the ring on dark, the way the coins do", () => {
    const surface = chip(chipped());

    expect(surface.className).toContain(
      "shadow-[var(--callout-ring),var(--callout-lift)]",
    );
    // Black on a near-black plate is mud, so dark drops the lift. The ring is
    // the chip's own edge and stays in both themes, off --border either way.
    expect(surface.className).toContain("dark:shadow-[var(--callout-ring)]");
    // The offsets are in plate units, so only this render knows them: the
    // utility reads them out of a variable set here.
    expect(surface.style.getPropertyValue("--callout-lift")).toMatch(
      /^0 [\d.]+px [\d.]+px rgb\(0 0 0 \/ [\d.]+\)$/,
    );
  });

  it("carries no halo on any line of the annotation", () => {
    const container = chipped();

    for (const selector of [
      "[data-callout-title]",
      "[data-callout-metadata]",
      "[data-callout-note]",
    ]) {
      expect(
        container.querySelector<HTMLElement>(selector)!.style.textShadow,
      ).toBe("");
    }
    // And none on the glyphs, which took theirs as a filter.
    expect(
      container.querySelector<HTMLElement>("[data-callout-species]")!.style
        .filter,
    ).toBe("");
  });

  it("takes only the width its words need, up to the reserved column", () => {
    const surface = chip(chipped());

    // A one-word region name is a chip, not a plaque. The column is still what
    // the plate lays out and reports against, so the cap is what keeps the
    // measured height honest: the type wraps at the column either way.
    expect(surface.className).toContain("w-fit");
    expect(surface.className).toContain("max-w-full");
  });

  it("keeps the object's margin wide enough for the shadow it has to hold", () => {
    const container = chipped();
    const surface = chip(container);
    const bleed = container.querySelector<HTMLElement>("foreignObject > div")!;
    const lift = surface.style.getPropertyValue("--callout-lift");
    const [, offset, blur] = lift.match(/([\d.]+)px ([\d.]+)px/) ?? [];

    // A foreignObject clips at its own box, so the wrapper's inset has to
    // cover everything the shadow puts outside the chip. Read off the DOM
    // rather than restated as a number here: this is the guard against a
    // heavier lift outgrowing the box that carries it. The tolerance is the
    // three decimals the offsets are written to in the variable, and nothing
    // more.
    expect(
      Number.parseFloat(bleed.style.padding) + 0.001,
    ).toBeGreaterThanOrEqual(Number(offset) + Number(blur));
  });
});

// Three facts on a card have to read as three lines. At a two-point size step,
// one weight and 1.15 leading they read as one paragraph that changed its mind
// twice, which is what the screenshot of the old chip showed.
describe("MapCallout type hierarchy", () => {
  function lines() {
    const container = render(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Zavetišče Ljubljana"
          metadata="63 živali"
          note="Zanje skrbi Zavetišče Nova Gorica"
          species={[{ species: "dog", count: 41 }]}
        />
      </svg>,
    ).container;
    const at = (selector: string) =>
      container.querySelector<HTMLElement>(selector)!;
    return {
      title: at("[data-callout-title]"),
      metadata: at("[data-callout-metadata]"),
      note: at("[data-callout-note]"),
      species: at("[data-callout-species]"),
    };
  }

  it("leads with the title on size and on weight together", () => {
    const { title, metadata } = lines();

    expect(Number.parseFloat(title.style.fontSize)).toBeGreaterThan(
      Number.parseFloat(metadata.style.fontSize),
    );
    expect(title.className).toContain("font-semibold");
    // The answer under it is muted, so the two are a heading and a body and
    // not two greys a point apart.
    expect(metadata.className).toContain("text-muted-foreground");
  });

  it("sets the card at a card's leading", () => {
    const { title, metadata, note } = lines();

    for (const line of [title, metadata, note]) {
      expect(Number(line.style.lineHeight)).toBeGreaterThan(1.15);
    }
    // One leading across the card: a heading set looser than its own body is
    // two cards stacked.
    expect(metadata.style.lineHeight).toBe(title.style.lineHeight);
  });

  it("gives the species row more air than the lines of words above it", () => {
    const { metadata, note, species } = lines();
    const gap = (node: HTMLElement) => Number.parseFloat(node.style.marginTop);

    expect(gap(metadata)).toBeGreaterThan(0);
    // The two muted lines are the same kind of thing and are spaced alike.
    expect(gap(note)).toBeCloseTo(gap(metadata), 5);
    // The glyph row is a different kind of fact and has to be seen arriving.
    expect(gap(species)).toBeGreaterThan(gap(metadata));
  });
});

describe("MapCallout leader line", () => {
  function leader(y: number) {
    const { container } = render(
      <svg>
        <MapCallout x={50} y={y} reach={5} title="Ljubljana" metadata="5" />
      </svg>,
    );
    return container.querySelector("[data-map-leader]");
  }

  it("draws none while the label sits beside the thing it names", () => {
    // Mid-plate, with nothing to clamp against. An adjacent label needs no
    // line to say what it belongs to, and an atlas draws none.
    expect(leader(MAP_HEIGHT / 2)).toBeNull();
  });

  it("draws one once the frame has pushed the label off its mark", () => {
    // Hard against the top edge, where the block can no longer be centred on
    // the marker. Leaders exist for displaced labels and for no others.
    const line = leader(2);

    expect(line).not.toBeNull();
    expect(line!.getAttribute("stroke-width")).toBe("0.5");
    expect(line!.getAttribute("class")).toContain("stroke-foreground");
  });

  it("starts the line at the marker's edge, never at its centre", () => {
    const line = leader(2)!;
    const x1 = Number(line.getAttribute("x1"));
    const y1 = Number(line.getAttribute("y1"));

    // reach is 5, so the first inked point is five units out from (50, 2).
    expect(Math.hypot(x1 - 50, y1 - 2)).toBeCloseTo(5, 5);
  });
});

// The second metadata line. An empty region says there are no shelters in it
// and then says who answers for it anyway, which is two statements and so two
// lines.
describe("MapCallout note line", () => {
  function renderNote(note?: string) {
    return render(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Goriška"
          metadata="Ni zavetišč v tej regiji"
          note={note}
        />
      </svg>,
    ).container;
  }

  it("sets it under the metadata, in the same register", () => {
    const container = renderNote("Zanje skrbi Zavetišče Nova Gorica");
    const note = container.querySelector<HTMLElement>("[data-callout-note]");
    const metadata = container.querySelector<HTMLElement>(
      "[data-callout-metadata]",
    );

    expect(note).not.toBeNull();
    expect(note!.textContent).toBe("Zanje skrbi Zavetišče Nova Gorica");
    // Its own line and not a longer first one, at the same size as the line it
    // follows, so the two read as one answer in two parts.
    expect(note!.style.fontSize).toBe(metadata!.style.fontSize);
    // Document order: the fact first, then who to call about it.
    expect(
      metadata!.compareDocumentPosition(note!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws no second line for an annotation that was given none", () => {
    expect(renderNote().querySelector("[data-callout-note]")).toBeNull();
    expect(renderNote("").querySelector("[data-callout-note]")).toBeNull();
  });
});

describe("MapCallout species line", () => {
  function renderSpecies(
    species?: { species: "dog" | "cat"; count: number }[],
  ) {
    return render(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Zavetišče Ljubljana"
          metadata="63 živali"
          species={species}
        />
      </svg>,
    ).container;
  }

  it("says who lives there, one glyph and one count per species", () => {
    const container = renderSpecies([
      { species: "dog", count: 41 },
      { species: "cat", count: 22 },
    ]);
    const row = container.querySelector("[data-callout-species]");

    expect(row).not.toBeNull();
    expect(row!.textContent).toBe("4122");
    // The site's own species icons, the ones the tabs and the fact chips set.
    expect(container.querySelector(".lucide-dog")).not.toBeNull();
    expect(container.querySelector(".lucide-cat")).not.toBeNull();
    expect(
      container.querySelectorAll("[data-callout-species-entry]"),
    ).toHaveLength(2);
  });

  it("leaves the glyphs bare, because the chip is their ground now", () => {
    const row = renderSpecies([
      { species: "dog", count: 41 },
    ]).querySelector<HTMLElement>("[data-callout-species]");

    // They used to carry a drop-shadow knockout of their own, which is what an
    // icon takes instead of a text-shadow. On a surface there is nothing to
    // knock out.
    expect(row!.style.filter).toBe("");
    expect(row!.className).toContain("text-muted-foreground");
  });

  it("draws no third line for an annotation that was given none", () => {
    expect(renderSpecies().querySelector("[data-callout-species]")).toBeNull();
    expect(
      renderSpecies([]).querySelector("[data-callout-species]"),
    ).toBeNull();
  });
});

// The chip is opaque, so anything of the plate's own type underneath it is
// simply gone rather than interleaved with. The map settles that by taking the
// covered name off the plate, and this is the half of it the annotation owes:
// saying where its chip ended up, padding and all.
describe("MapCallout rectangle report", () => {
  const type = calloutType(DEFAULT_PLATE_SCALE);
  // The reported box is the chip, not the type inside it: the measured content
  // at its floor, plus the padding above and below it.
  const boxHeight = type.floor + type.padY * 2;

  function renderReporting(
    onRect: (key: string, rect: unknown) => void,
    x = 50,
  ) {
    return render(
      <svg>
        <MapCallout
          x={x}
          y={100}
          reach={5}
          title="Zavetišče Horjul"
          metadata="12 živali"
          rectKey="town"
          onRect={onRect}
        />
      </svg>,
    );
  }

  it("reports the block's own place and size, in the map's units", () => {
    const onRect = vi.fn();
    renderReporting(onRect);

    // The block sits a gap off the marker's edge and centred on it: the same
    // arithmetic the component lays the foreignObject out with, read back from
    // the outside.
    expect(onRect).toHaveBeenLastCalledWith("town", {
      x: 50 + 5 + type.labelGap,
      y: 100 - boxHeight / 2,
      width: type.width,
      height: boxHeight,
    });
  });

  it("reports again when the annotation moves, and not when it holds still", () => {
    const onRect = vi.fn();
    const { rerender } = renderReporting(onRect);
    onRect.mockClear();

    rerender(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Zavetišče Horjul"
          metadata="12 živali"
          rectKey="town"
          onRect={onRect}
        />
      </svg>,
    );

    // Nothing about the block changed, so nothing is said. The map keeps state
    // off these reports, and a report per render would be a render per render.
    expect(onRect).not.toHaveBeenCalled();

    rerender(
      <svg>
        <MapCallout
          x={120}
          y={100}
          reach={5}
          title="Zavetišče Horjul"
          metadata="12 živali"
          rectKey="town"
          onRect={onRect}
        />
      </svg>,
    );

    expect(onRect).toHaveBeenLastCalledWith("town", {
      x: 120 + 5 + type.labelGap,
      y: 100 - boxHeight / 2,
      width: type.width,
      height: boxHeight,
    });
  });

  it("takes the rectangle back when the annotation goes", () => {
    const onRect = vi.fn();
    const { unmount } = renderReporting(onRect);
    unmount();

    expect(onRect).toHaveBeenLastCalledWith("town", null);
  });

  it("says nothing at all to a map that did not ask", () => {
    // Every other annotation on the plate renders without this prop, and the
    // effect has to stay a no-op for them rather than a throw.
    expect(() =>
      render(
        <svg>
          <MapCallout x={50} y={100} reach={5} title="Celje" metadata="2" />
        </svg>,
      ),
    ).not.toThrow();
  });
});

// The type is written in the pixels it is read at and divided by the plate's
// scale, so one name comes out one size on a tablet plate and on a desktop
// one. Set in user units it swung by half between the two.
describe("MapCallout type scale", () => {
  function titleSize(scale: number): number {
    const { container } = render(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Ljubljana"
          metadata="5"
          scale={scale}
        />
      </svg>,
    );
    return fontSizeOf(container, "[data-callout-title]");
  }

  it("shrinks the type in user units as the plate is drawn larger", () => {
    const small = titleSize(2.2);
    const large = titleSize(3.2);

    expect(large).toBeLessThan(small);
    // Which is the whole point of the division: the rendered size holds.
    expect(small * 2.2).toBeCloseTo(large * 3.2, 5);
  });

  it("clamps the large-plate end, so no plate can produce absurd type", () => {
    // Twenty pixels to the unit is a plate that exists nowhere, and the
    // honest division there would set the name under a pixel tall.
    expect(titleSize(20)).toBe(titleSize(10));
  });

  // The other end is not a clamp in user units any more. It was, and on a
  // phone plate (about 1.12 pixels to the unit) it set the title out at eight
  // rendered pixels, which is the one thing this file exists to prevent.
  it("never sets the title under eleven rendered pixels, whatever the plate", () => {
    for (const scale of [0.5, 1.12, 1.6, 2.2, 4.4]) {
      expect(titleSize(scale) * scale).toBeGreaterThanOrEqual(11 - 1e-9);
    }
  });

  it("keeps the block of type off most of the country", () => {
    // What the type floor above costs on a small plate: the column would grow
    // to two thirds of the map, so it is capped instead.
    for (const scale of [0.5, 1.12, 2.2, 4.4]) {
      expect(calloutType(scale).width).toBeLessThanOrEqual(MAP_WIDTH * 0.55);
    }
  });

  it("holds the chip's own geometry to one rendered size, like the type", () => {
    const chipAt = (scale: number) => {
      const { container } = render(
        <svg>
          <MapCallout
            x={50}
            y={100}
            reach={5}
            title="Ljubljana"
            metadata="5 živali"
            scale={scale}
          />
        </svg>,
      );
      const chip = container.querySelector<HTMLElement>("[data-callout-chip]")!;
      return {
        radius: Number.parseFloat(chip.style.borderRadius),
        padX: Number.parseFloat(chip.style.paddingInline),
        padY: Number.parseFloat(chip.style.paddingBlock),
      };
    };

    const small = chipAt(2.2);
    const large = chipAt(3.2);

    // Corners, padding and border all divide by the plate's scale the way the
    // type does, so a chip is the same object at every plate size. Written in
    // user units they would have grown with the plate: a corner tuned on a
    // tablet reads as square on a wide desktop.
    expect(small.radius * 2.2).toBeCloseTo(large.radius * 3.2, 5);
    expect(small.padX * 2.2).toBeCloseTo(large.padX * 3.2, 5);
    expect(small.padY * 2.2).toBeCloseTo(large.padY * 3.2, 5);
  });

  it("keeps the metadata a step under the title at every scale", () => {
    for (const scale of [1, 2.2, 4.4]) {
      const { container } = render(
        <svg>
          <MapCallout
            x={50}
            y={100}
            reach={5}
            title="Ljubljana"
            metadata="5 živali"
            scale={scale}
          />
        </svg>,
      );

      expect(fontSizeOf(container, "[data-callout-metadata]")).toBeLessThan(
        fontSizeOf(container, "[data-callout-title]"),
      );
    }
  });
});
