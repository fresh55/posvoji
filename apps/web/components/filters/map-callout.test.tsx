// @vitest-environment jsdom
// jsdom lays nothing out, so the chip's size is mocked rather than measured.
// The mock overrides every element alike, which is enough to prove the
// arithmetic between "a chip this big" and "a box this big on the plate", and
// that it follows the chip down as well as up.

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPECIES_GLYPHS } from "@/components/filters/species-glyph";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import {
  calloutType,
  DEFAULT_PLATE_SCALE,
  MapCallout,
  speciesByTab,
} from "./map-callout";
import type { CalloutRect } from "./map-callout-layout";

afterEach(() => cleanup());

let mockedWidth = 0;
let mockedHeight = 0;

beforeEach(() => {
  mockedWidth = 0;
  mockedHeight = 0;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => mockedWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => mockedHeight,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

const chipOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-callout-chip]")!;

/** The x and y scale of the group that sets the card on the plate. */
function cardScale(container: HTMLElement): number {
  const transform =
    container.querySelector("foreignObject")?.parentElement?.getAttribute("transform") ?? "";
  return Number(transform.match(/scale\(([\d.]+)\)/)?.[1]);
}

describe("MapCallout size", () => {
  const type = calloutType(DEFAULT_PLATE_SCALE);

  function reported(onRect: ReturnType<typeof vi.fn>): CalloutRect {
    return onRect.mock.calls.at(-1)![1] as CalloutRect;
  }

  it("is placed by the size its chip is drawn at, and follows it both ways", () => {
    mockedWidth = 120;
    mockedHeight = 90;
    const onRect = vi.fn();
    const props = { x: 50, y: 100, reach: 5, rectKey: "town", onRect };
    const { container, rerender } = render(
      <svg>
        <MapCallout {...props} title="A very long title that wraps" metadata="two lines" />
      </svg>,
    );

    expect(reported(onRect).width).toBeCloseTo(120 * type.unit, 5);
    expect(reported(onRect).height).toBeCloseTo(90 * type.unit, 5);
    // The object holds the chip and the shadow round it, in the card's pixels.
    expect(Number(container.querySelector("foreignObject")?.getAttribute("height"))).toBe(90 + 20);

    mockedWidth = 60;
    mockedHeight = 40;
    rerender(
      <svg>
        <MapCallout {...props} title="Short" />
      </svg>,
    );

    // A report that only ever grew would be the bug this guards against.
    expect(reported(onRect).width).toBeCloseTo(60 * type.unit, 5);
    expect(reported(onRect).height).toBeCloseTo(40 * type.unit, 5);
  });

  it("stands in the column and a floor for a chip nothing has laid out", () => {
    const onRect = vi.fn();
    render(
      <svg>
        <MapCallout x={50} y={100} reach={5} title="Hi" rectKey="town" onRect={onRect} />
      </svg>,
    );

    expect(reported(onRect).width).toBeCloseTo(type.width, 5);
    expect(reported(onRect).height).toBeCloseTo(type.floor, 5);
  });

  it("pads a card more than a tooltip, and only vertically", () => {
    const chip = (props: { metadata?: string }) =>
      chipOf(
        render(
          <svg>
            <MapCallout x={50} y={50} reach={5} title="Zavetišče" {...props} />
          </svg>,
        ).container,
      ).className;

    // A name with a count under it is a small card and wants a card's room; a
    // name on its own is a tooltip and a card's air over one word is a plaque.
    expect(chip({ metadata: "63 živali" })).toContain("py-2.5");
    expect(chip({})).toContain("py-1.5");
    // The left edge is the same on every chip the plate draws.
    expect(chip({ metadata: "63 živali" })).toContain("px-3");
    expect(chip({})).toContain("px-3");
  });
});

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
    // about", and only when the card has actually been moved off it. The
    // species glyphs are paths of their own, inside the chip.
    expect(container.querySelector("g > path")).toBeNull();
    expect(container.querySelectorAll("[data-callout-chip]")).toHaveLength(1);
  });

  it("keeps the foreignObject, which is what wraps the text", () => {
    const container = annotation();

    expect(container.querySelector("foreignObject")).not.toBeNull();
    expect(container.innerHTML).toContain("break-words");
  });
});

// The card is laid out in the pixels it is read at and set on the plate by one
// SVG transform. Laid out in plate units, Chrome snapped every icon to a whole
// unit, about three pixels on a desktop plate, and a class inside it such as
// the touch button's mt-2 came out at 29 pixels.
describe("MapCallout in its own pixels", () => {
  function scaleAt(scale: number) {
    return cardScale(
      render(
        <svg>
          <MapCallout x={50} y={100} reach={5} title="Ljubljana" metadata="5 živali" scale={scale} />
        </svg>,
      ).container,
    );
  }

  it("is set on the plate by an SVG transform, never a CSS one", () => {
    const { container } = render(
      <svg>
        <MapCallout x={50} y={100} reach={5} title="Ljubljana" metadata="5 živali" />
      </svg>,
    );

    expect(cardScale(container)).toBeCloseTo(calloutType(DEFAULT_PLATE_SCALE).unit, 5);
    // WebKit paints nothing at all for a box with a CSS transform inside a
    // foreignObject. The transform has to be the object's parent's.
    for (const node of container.querySelectorAll<HTMLElement>("foreignObject *")) {
      expect(node.style.transform).toBe("");
    }
  });

  it("draws a pixel as a pixel wherever the plate lets it", () => {
    for (const scale of [2.2, 3.2]) {
      expect(scaleAt(scale) * scale).toBeCloseTo(1, 5);
    }
  });

  it("clamps the large-plate end, so no plate can produce absurd type", () => {
    expect(scaleAt(20)).toBe(scaleAt(10));
  });

  it("never draws its smallest line under eleven pixels, whatever the plate", () => {
    // text-xs, twelve of the card's pixels.
    for (const scale of [0.5, 1.12, 1.6, 2.2, 4.4]) {
      expect(12 * scaleAt(scale) * scale).toBeGreaterThanOrEqual(11 - 1e-9);
    }
  });

  it("keeps the card off most of the country", () => {
    for (const scale of [0.5, 1.12, 2.2, 4.4]) {
      expect(calloutType(scale).width).toBeLessThanOrEqual(MAP_WIDTH * 0.55 + 1e-9);
    }
  });
});

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

  it("draws the site's popover surface under the type", () => {
    const surface = chipOf(chipped());

    // Opaque, so contrast is a matter of tokens rather than of the region
    // underneath.
    expect(surface.className).toContain("bg-popover");
    expect(surface.className).not.toContain("bg-popover/");
    expect(surface.className).toContain("text-popover-foreground");
    expect(surface.className).toContain("rounded-ui");
  });

  it("takes its edge and lift from Select and the menus: a ring, and a shadow on light only", () => {
    const surface = chipOf(chipped());

    expect(surface.className).toContain("ring-1");
    expect(surface.className).toContain("ring-foreground/10");
    expect(surface.className).toContain("shadow-md");
    // Black on a near-black plate is mud, so dark keeps the ring alone.
    expect(surface.className).toContain("dark:shadow-none");
    expect(surface.className).not.toContain("border");
  });

  it("carries no halo on any line of the annotation", () => {
    const container = chipped();

    for (const selector of [
      "[data-callout-title]",
      "[data-callout-metadata]",
      "[data-callout-note]",
    ]) {
      expect(container.querySelector<HTMLElement>(selector)!.style.textShadow).toBe("");
    }
    expect(
      container.querySelector<HTMLElement>("[data-callout-species]")!.style.filter,
    ).toBe("");
  });

  it("takes only the width its words need, up to the column", () => {
    const container = chipped();
    const surface = chipOf(container);

    expect(surface.className).toContain("w-fit");
    expect(surface.className).toContain("max-w-full");
    // The object is the whole column wide wherever the chip stands, so the
    // chip is laid out at one width and measured at it.
    expect(Number(container.querySelector("foreignObject")?.getAttribute("width"))).toBeCloseTo(
      calloutType(DEFAULT_PLATE_SCALE).columnPx + 20,
      5,
    );
  });

  it("keeps the object's margin wide enough for the shadow it has to hold", () => {
    const container = chipped();
    const margin = container.querySelector<HTMLElement>("foreignObject > div")!;

    // A foreignObject clips at its own box. shadow-md reaches nine pixels
    // under its box, so the margin has to be at least that.
    expect(Number.parseFloat(margin.style.padding)).toBeGreaterThanOrEqual(9);
  });
});

describe("MapCallout lines", () => {
  function lines() {
    const container = render(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Mačja hiša"
          place="Celje · 70 km"
          metadata="Ni zavetišč v tej regiji"
          note="Zanje skrbi Zavetišče Nova Gorica"
          species={[{ species: "dog", count: 41 }]}
        />
      </svg>,
    ).container;
    const at = (selector: string) => container.querySelector<HTMLElement>(selector)!;
    return {
      chip: chipOf(container),
      title: at("[data-callout-title]"),
      place: at("[data-callout-place]"),
      metadata: at("[data-callout-metadata]"),
      note: at("[data-callout-note]"),
      species: at("[data-callout-species]"),
    };
  }

  it("leads with the title on size and on weight together", () => {
    const { title, metadata, place } = lines();

    expect(title.className).toContain("text-sm");
    expect(title.className).toContain("font-semibold");
    for (const line of [metadata, place]) {
      expect(line.className).toContain("text-xs");
      expect(line.className).toContain("text-muted-foreground");
    }
  });

  it("reads name, place, then the facts, in that order", () => {
    const { chip } = lines();

    expect(
      [...chip.children].map((child) =>
        [...child.attributes].find((a) => a.name.startsWith("data-callout-"))?.name,
      ),
    ).toEqual([
      "data-callout-title",
      "data-callout-place",
      "data-callout-metadata",
      "data-callout-note",
      "data-callout-species",
    ]);
  });

  it("binds the place to the name and a note to its fact, and sets the facts apart", () => {
    const { place, metadata, note, species } = lines();

    // The place is the second half of who this is; a note is the second half
    // of the fact above it. A fact is a new thing and is seen arriving.
    expect(place.className).toContain("mt-0.5");
    expect(note.className).toContain("mt-0.5");
    expect(metadata.className).toContain("mt-1.5");
    expect(species.className).toContain("mt-1.5");
  });

  it("draws no place line for a card that was given none", () => {
    const { container } = render(
      <svg>
        <MapCallout x={50} y={100} reach={5} title="Maribor" metadata="20 živali" />
      </svg>,
    );

    expect(container.querySelector("[data-callout-place]")).toBeNull();
  });
});

describe("MapCallout leader line", () => {
  const type = calloutType(DEFAULT_PLATE_SCALE);

  function leader(y: number, earlier?: CalloutRect[]) {
    const { container } = render(
      <svg>
        <MapCallout
          x={160}
          y={y}
          reach={5}
          title="Ljubljana"
          metadata="5"
          earlierCallouts={earlier}
        />
      </svg>,
    );
    return container.querySelector("[data-map-leader]");
  }

  // An earlier persistent card standing on the spot this one would take, so
  // the separation moves it well off its mark.
  const blocking = [{ x: 160 + 5 + type.labelGap, y: 70, width: type.width, height: 70 }];

  it("draws none while the card stands beside the thing it names", () => {
    expect(leader(MAP_HEIGHT / 2)).toBeNull();
  });

  it("draws none at the plate's edge, where the card slides or goes under instead", () => {
    expect(leader(2)).toBeNull();
  });

  it("draws one once the card has been pushed off its mark", () => {
    const line = leader(105, blocking);

    expect(line).not.toBeNull();
    expect(line!.getAttribute("stroke-width")).toBe("0.5");
    expect(line!.getAttribute("class")).toContain("stroke-foreground");
  });

  it("starts the line at the marker's edge, never at its centre", () => {
    const line = leader(105, blocking)!;
    const x1 = Number(line.getAttribute("x1"));
    const y1 = Number(line.getAttribute("y1"));

    expect(Math.hypot(x1 - 160, y1 - 105)).toBeCloseTo(5, 5);
  });
});

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
    const metadata = container.querySelector<HTMLElement>("[data-callout-metadata]");

    expect(note).not.toBeNull();
    expect(note!.textContent).toBe("Zanje skrbi Zavetišče Nova Gorica");
    expect(note!.className).toContain("text-xs");
    expect(metadata!.className).toContain("text-xs");
    expect(
      metadata!.compareDocumentPosition(note!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws no second line for an annotation that was given none", () => {
    expect(renderNote().querySelector("[data-callout-note]")).toBeNull();
    expect(renderNote("").querySelector("[data-callout-note]")).toBeNull();
  });
});

describe("MapCallout species line", () => {
  function renderSpecies(
    species?: { species: "dog" | "cat" | "rabbit" | "other"; count: number }[],
  ) {
    return render(
      <svg>
        <MapCallout x={50} y={100} reach={5} title="Ljubljana" species={species} />
      </svg>,
    ).container;
  }

  it("counts by species tab, in the tabs' order, one glyph and one count each", () => {
    const container = renderSpecies([
      { species: "cat", count: 24 },
      { species: "rabbit", count: 1 },
      { species: "dog", count: 22 },
      { species: "other", count: 2 },
    ]);
    const entries = [...container.querySelectorAll("[data-callout-species-entry]")];

    // A rabbit counts under "other", the way the tabs above the grid count it.
    expect(entries.map((entry) => entry.getAttribute("data-callout-species-entry"))).toEqual([
      "dog",
      "cat",
      "other",
    ]);
    expect(entries.map((entry) => entry.textContent)).toEqual(["22", "24", "3"]);
  });

  it("draws the species tabs' own glyphs", () => {
    const container = renderSpecies([
      { species: "dog", count: 41 },
      { species: "rabbit", count: 1 },
    ]);
    const paths = (tab: string) =>
      [
        ...container.querySelectorAll(`[data-callout-species-entry="${tab}"] path`),
      ].map((path) => path.getAttribute("d"));

    expect(paths("dog")).toEqual([...SPECIES_GLYPHS.dog]);
    // "Other" wears the rabbit, as its tab does.
    expect(paths("other")).toEqual([...SPECIES_GLYPHS.other]);
  });

  it("sets the numbers in ink and keeps the glyphs quiet", () => {
    const entry = renderSpecies([{ species: "dog", count: 41 }]).querySelector(
      "[data-callout-species-entry]",
    )!;

    expect(entry.querySelector("svg")!.getAttribute("class")).toContain("text-muted-foreground");
    expect(entry.querySelector("span")!.className).toContain("text-foreground");
    expect(entry.querySelector("span")!.className).toContain("font-medium");
  });

  it("draws no line for an annotation given none, or only zeroes", () => {
    expect(renderSpecies().querySelector("[data-callout-species]")).toBeNull();
    expect(renderSpecies([]).querySelector("[data-callout-species]")).toBeNull();
    expect(
      renderSpecies([{ species: "dog", count: 0 }]).querySelector("[data-callout-species]"),
    ).toBeNull();
  });

  it("folds the species into tabs without losing an animal", () => {
    expect(
      speciesByTab([
        { species: "other", count: 2 },
        { species: "rabbit", count: 3 },
      ]),
    ).toEqual([{ tab: "other", count: 5 }]);
  });
});

// The button a touch arming grows on the card. It stood between the count and
// the species line once, which split one shelter's facts in two around a
// control. The facts are what the press is decided on, so they come first.
describe("MapCallout action", () => {
  function armed(scale = DEFAULT_PLATE_SCALE) {
    return render(
      <svg>
        <MapCallout
          x={50}
          y={100}
          reach={5}
          title="Ljubljana"
          place="Ljubljana · 3 km"
          species={[{ species: "dog", count: 41 }]}
          action={{ label: "Izberi", onClick: () => undefined }}
          scale={scale}
        />
      </svg>,
    ).container;
  }

  it("comes after every fact on the card, the species line included", () => {
    const parts = [...chipOf(armed()).children].map((part) =>
      [
        "data-callout-title",
        "data-callout-place",
        "data-callout-metadata",
        "data-callout-note",
        "data-callout-species",
        "data-map-action",
      ].find((name) => part.hasAttribute(name)),
    );

    expect(parts).toEqual([
      "data-callout-title",
      "data-callout-place",
      "data-callout-species",
      "data-map-action",
    ]);
  });

  it("names the card it stands on, for a label that is only a verb", () => {
    const button = armed().querySelector("[data-map-action]")!;

    expect(button.textContent).toBe("Izberi");
    expect(button.getAttribute("aria-label")).toBe("Izberi: Ljubljana");
  });

  it("takes a tap on its body, and only an armed card does", () => {
    // Passed through, a tap on the card landed on whatever coin it covered
    // and armed that one instead.
    expect(chipOf(armed()).className).toContain("pointer-events-auto");
    const hover = render(
      <svg>
        <MapCallout x={50} y={100} reach={5} title="Ljubljana" metadata="5" />
      </svg>,
    ).container;
    expect(chipOf(hover).className).not.toContain("pointer-events-auto");
  });

  it("keeps a 44 pixel target on screen at any plate", () => {
    for (const scale of [0.9, 2.2, 4.4]) {
      const container = armed(scale);
      const button = container.querySelector<HTMLElement>("[data-map-action]")!;
      const onScreen = Number.parseFloat(button.style.minHeight) * cardScale(container) * scale;
      expect(onScreen).toBeGreaterThanOrEqual(44 - 1e-9);
      cleanup();
    }
  });
});

// The rectangle the annotation reports. The plate takes a town anchor off
// wherever a card is drawn across it, and that is only as good as this report
// saying where its chip ended up.
describe("MapCallout rectangle report", () => {
  const type = calloutType(DEFAULT_PLATE_SCALE);

  function renderReporting(onRect: (key: string, rect: unknown) => void, x = 50) {
    return render(
      <svg>
        <MapCallout
          x={x}
          y={100}
          reach={5}
          title="Horjul"
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

    // A gap off the marker's edge and centred on it: the same arithmetic the
    // card is laid out with, read back from the outside.
    expect(onRect).toHaveBeenLastCalledWith("town", {
      x: 50 + 5 + type.labelGap,
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
        <MapCallout x={50} y={100} reach={5} title="Horjul" metadata="12 živali" rectKey="town" onRect={onRect} />
      </svg>,
    );
    // Nothing about the block changed, so nothing is said.
    expect(onRect).not.toHaveBeenCalled();

    rerender(
      <svg>
        <MapCallout x={120} y={100} reach={5} title="Horjul" metadata="12 živali" rectKey="town" onRect={onRect} />
      </svg>,
    );
    expect(onRect).toHaveBeenLastCalledWith("town", {
      x: 120 + 5 + type.labelGap,
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
    expect(() =>
      render(
        <svg>
          <MapCallout x={50} y={100} reach={5} title="Celje" metadata="2" />
        </svg>,
      ),
    ).not.toThrow();
  });
});

// Which spot beside the mark the chip takes. The chip is opaque, so whatever it
// lands on is gone while it is up. placeCallout's own tests cover the spots;
// these pin that the card hands it the frame and the marks it was given.
describe("MapCallout side choice", () => {
  const type = calloutType(DEFAULT_PLATE_SCALE);
  const REACH = 5;
  // The card keeps its shadow's reach in from the plate's edge, ten of its
  // pixels, and never less than the plate labels' two units. Restated rather
  // than read out of the component, so the test does not assert that a
  // number equals itself.
  const margin = Math.max(2, 10 * type.unit);

  function placed(
    x: number,
    avoid?: readonly CalloutRect[],
    earlier?: readonly CalloutRect[],
  ): CalloutRect {
    const onRect = vi.fn();
    render(
      <svg>
        <MapCallout
          x={x}
          y={MAP_HEIGHT / 2}
          reach={REACH}
          title="Horjul"
          metadata="12 živali"
          rectKey="town"
          avoid={avoid}
          earlierCallouts={earlier}
          onRect={onRect}
        />
      </svg>,
    );
    return onRect.mock.calls.at(-1)![1] as CalloutRect;
  }

  const rightOf = (x: number) => x + REACH + type.labelGap;
  const leftOf = (x: number) => x - REACH - type.labelGap - type.width;

  it("keeps the chip on the right while it fits there", () => {
    const x = 120;
    expect(rightOf(x) + type.width).toBeLessThanOrEqual(MAP_WIDTH - margin);

    expect(placed(x).x).toBeCloseTo(rightOf(x), 5);
    expect(placed(x, []).x).toBeCloseTo(rightOf(x), 5);
  });

  it("takes it to the left once it would run off the frame", () => {
    const x = 260;
    expect(rightOf(x) + type.width).toBeGreaterThan(MAP_WIDTH - margin);

    expect(placed(x).x).toBeCloseTo(leftOf(x), 5);
    expect(placed(x).x).toBeGreaterThanOrEqual(margin);
    expect(placed(x).x + type.width).toBeLessThanOrEqual(MAP_WIDTH - margin);
  });

  it("flips to the quiet side when a mark is painted on the one it prefers", () => {
    const x = 160;
    expect(leftOf(x)).toBeGreaterThanOrEqual(margin);
    const right = placed(x);
    expect(right.x).toBeCloseTo(rightOf(x), 5);

    // One coin filling the box the chip would otherwise take.
    const marker = { x: right.x, y: right.y, width: right.width, height: right.height };

    expect(placed(x, [marker]).x).toBeCloseTo(leftOf(x), 5);
  });

  it("keeps off what the page paints over the plate", () => {
    const x = 160;
    const right = placed(x);
    cleanup();
    // A plate drawn at one pixel to the unit, and the map credit standing on
    // the spot the card would take. The credit paints above the plate, so a
    // card under it had the credit's lines drawn across its own.
    const own = Object.getOwnPropertyDescriptor(SVGSVGElement.prototype, "getScreenCTM");
    Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
      configurable: true,
      value: () => ({ a: 1, d: 1, e: 0, f: 0 }),
    });
    const credit = document.createElement("p");
    credit.setAttribute("data-map-overlay", "");
    credit.getBoundingClientRect = () =>
      ({ left: right.x, top: right.y, width: right.width, height: right.height }) as DOMRect;
    document.body.appendChild(credit);
    try {
      expect(placed(x).x).toBeCloseTo(leftOf(x), 5);
    } finally {
      credit.remove();
      if (own) Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", own);
      else Reflect.deleteProperty(SVGSVGElement.prototype, "getScreenCTM");
    }
  });

  it("keeps the quieter side while separating an earlier persistent label", () => {
    const x = 160;
    const right = placed(x);
    const marker = { x: right.x, y: right.y, width: right.width, height: right.height };
    const earlier = placed(x, [marker]);

    const separated = placed(x, [marker], [earlier]);
    expect(separated.x).toBeCloseTo(leftOf(x), 5);
    expect(
      separated.y + separated.height <= earlier.y ||
        earlier.y + earlier.height <= separated.y,
    ).toBe(true);
  });
});
