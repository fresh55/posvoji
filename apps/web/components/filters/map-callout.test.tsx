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
import { MAP_HEIGHT } from "@/lib/geo";
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
  const pad = type.halo * 2;

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

    expect(foreignObjectHeight(container)).toBeCloseTo(100 + pad * 2, 5);

    mockedScrollHeight = 50;
    rerender(
      <svg>
        <MapCallout x={50} y={50} reach={5} title="Short" metadata="" />
      </svg>,
    );

    // The bug this guards against measured a div bound to the block's own
    // height, so scrollHeight could only ever hold steady or climb. This
    // checks the number actually came back down, not merely that it moved.
    expect(foreignObjectHeight(container)).toBeCloseTo(50 + pad * 2, 5);
    expect(foreignObjectHeight(container)).toBeLessThan(100 + pad * 2);
  });

  it("still floors at the block's own minimum once content is shorter than it", () => {
    mockedScrollHeight = 1;
    const { container } = render(
      <svg>
        <MapCallout x={50} y={50} reach={5} title="Hi" metadata="" />
      </svg>,
    );

    expect(foreignObjectHeight(container)).toBeCloseTo(type.floor + pad * 2, 5);
  });
});

function fontSizeOf(container: HTMLElement, selector: string): number {
  const node = container.querySelector<HTMLElement>(selector);
  return Number.parseFloat(node?.style.fontSize ?? "");
}

// The annotation is type on paper now: no border, no popover fill, no shadowed
// rectangle and no caret. The halo is what replaces the chrome, and it is what
// lets a name sit legibly straight on a dark region fill.
describe("MapCallout as an annotation", () => {
  function annotation() {
    return render(
      <svg>
        <MapCallout x={50} y={100} reach={5} title="Zavetišče" metadata="5" />
      </svg>,
    ).container;
  }

  it("draws no card behind the type", () => {
    const container = annotation();
    const html = container.innerHTML;

    expect(html).not.toContain("bg-popover");
    expect(html).not.toContain("border-border");
    expect(html).not.toContain("shadow-[");
    // The caret was the one path this component ever drew.
    expect(container.querySelector("path")).toBeNull();
  });

  it("haloes the type in the plate's own paper, off the theme's token", () => {
    const title = annotation().querySelector<HTMLElement>(
      "[data-callout-title]",
    );

    expect(title).not.toBeNull();
    expect(title!.style.textShadow).toContain("var(--background)");
    // Stacked passes, not one: a single shadow reads as a drop shadow, which
    // is a card's language.
    expect(title!.style.textShadow.split(",").length).toBeGreaterThan(2);
  });

  it("keeps the foreignObject, which is what wraps the text", () => {
    const container = annotation();

    expect(container.querySelector("foreignObject")).not.toBeNull();
    expect(container.innerHTML).toContain("break-words");
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
    expect(note!.style.textShadow).toContain("var(--background)");
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

  it("haloes the glyphs with a filter, which is all an icon can take", () => {
    const row = renderSpecies([
      { species: "dog", count: 41 },
    ]).querySelector<HTMLElement>("[data-callout-species]");

    expect(row!.style.filter).toContain("drop-shadow");
    expect(row!.style.filter).toContain("var(--background)");
  });

  it("draws no third line for an annotation that was given none", () => {
    expect(renderSpecies().querySelector("[data-callout-species]")).toBeNull();
    expect(
      renderSpecies([]).querySelector("[data-callout-species]"),
    ).toBeNull();
  });
});

// The annotation has no card, so it interleaves with any of the plate's own
// type it is drawn across. The map settles that by taking the losing name off
// the plate, and this is the half of it the annotation owes: saying where its
// own block of type ended up.
describe("MapCallout rectangle report", () => {
  const type = calloutType(DEFAULT_PLATE_SCALE);

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
      x: 50 + 5 + 4,
      y: 100 - type.floor / 2,
      width: type.width,
      height: type.floor,
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
      x: 120 + 5 + 4,
      y: 100 - type.floor / 2,
      width: type.width,
      height: type.floor,
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

  it("clamps both ends, so no plate can produce absurd type", () => {
    // Twenty pixels to the unit is a plate that exists nowhere, and the
    // honest division there would set the name under a pixel tall.
    expect(titleSize(20)).toBe(titleSize(10));
    expect(titleSize(0.2)).toBe(titleSize(0.5));
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
