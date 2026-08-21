// @vitest-environment jsdom
// The static-markup assertions below do not need a DOM, but the inert-region
// hover ones do: a callout only appears once React has run the event.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cityAt, distanceKm, project, type LatLon } from "@/lib/geo";
import { I18nProvider } from "@/components/i18n-provider";
import { DENSITY_STEPS, layoutTowns, type ShelterPin } from "@/lib/map-layout";
import { ShelterMap, anyEmptyMarker, anyRegionMixed } from "./shelter-map";

function pin(
  value: string,
  label: string,
  city: string,
  count: number,
): ShelterPin {
  return { value, label, city, count, at: cityAt(city)! };
}

afterEach(() => cleanup());

// The one path a region draws, found by the accessible name it keeps.
function regionTag(html: string, name: string): string {
  return html.match(new RegExp(`<path[^>]*aria-label="${name}[^"]*"[^>]*>`))?.[0] ?? "";
}

function renderMap(
  pins: ShelterPin[],
  selected: string[] = [],
  highlightedValue?: string | null,
): string {
  return renderToStaticMarkup(
    <I18nProvider locale="sl">
      <ShelterMap
        pins={pins}
        selected={selected}
        onPick={() => undefined}
        highlightedValue={highlightedValue}
      />
    </I18nProvider>,
  );
}

// The one <g> a marker draws, found by the key its town carries.
function markerTag(html: string, key: string): string {
  return html.match(new RegExp(`<g[^>]*data-marker-key="${key}"[^>]*>`))?.[0] ?? "";
}

describe("ShelterMap marker states", () => {
  it("lights the disc of the shelter that is picked, not the first one", () => {
    const html = renderMap(
      [
        pin("vzhod", "Zavetišče Vzhod", "Celje", 60),
        pin("zahod", "Zavetišče Zahod", "Celje", 20),
      ],
      ["zahod"],
    );

    expect(html).toContain('data-marker-kind="cluster"');
    expect(html).toContain('data-marker-state="mixed"');
    expect(html).toContain('data-marker-shelters="2"');
    expect(html).toMatch(
      /data-cluster-disc="idle" data-cluster-shelter="vzhod"/,
    );
    expect(html).toMatch(
      /data-cluster-disc="selected" data-cluster-shelter="zahod"/,
    );
    expect(html).not.toContain("Celje, Celje");
  });

  it("draws the busier shelter of a cluster as the larger disc", () => {
    const html = renderMap([
      pin("vzhod", "Zavetišče Vzhod", "Celje", 60),
      pin("zahod", "Zavetišče Zahod", "Celje", 20),
    ]);

    // The two coin circles of the cluster, in shelter order.
    const radii = [
      ...html.matchAll(/data-cluster-shelter="[^"]+"[^]*?<circle[^>]*r="([\d.]+)"/g),
    ].map(([, r]) => Number(r));
    expect(radii).toHaveLength(2);
    expect(radii[0]).toBeGreaterThan(radii[1]);
  });

  it("draws one disc per shelter in a three-shelter town", () => {
    const html = renderMap([
      pin("a", "Zavetišče A", "Celje", 10),
      pin("b", "Zavetišče B", "Celje", 10),
      pin("c", "Zavetišče C", "Celje", 10),
    ]);

    expect(html).toContain('data-marker-shelters="3"');
    expect(html.match(/data-cluster-disc="/g)).toHaveLength(3);
  });

  it("counts the shelters it cannot draw instead of drawing the wrong number", () => {
    const html = renderMap([
      pin("a", "Zavetišče A", "Celje", 10),
      pin("b", "Zavetišče B", "Celje", 10),
      pin("c", "Zavetišče C", "Celje", 10),
      pin("d", "Zavetišče D", "Celje", 10),
    ]);

    expect(html).toContain('data-cluster-overflow="4"');
    expect(html).not.toContain('data-cluster-disc="');
  });

  it("keeps an unavailable marker visibly and behaviorally disabled", () => {
    const html = renderMap([
      pin("empty", "Zavetišče brez živali", "Ljubljana", 0),
    ]);

    expect(html).toContain('data-marker-live="false"');
    expect(html).toContain("pointer-events-none");
  });

  it("draws a shelter with nothing to pick as a dot, not a fainter paw disc", () => {
    const html = renderMap([
      pin("empty", "Zavetišče brez živali", "Ljubljana", 0),
    ]);

    expect(html).toContain("data-marker-empty");
    // The paw and the stroked disc belong to pickable shelters only.
    expect(html).not.toContain("lucide-paw-print");
    expect(html).not.toContain("stroke-foreground/40");
  });

  // discFitsGlyph decides in user units against a fixed guess at the render
  // scale, so it cannot know the plate is being drawn on a tablet at under one
  // pixel per unit. The container query is what knows. Asserted on the glyph
  // itself rather than through a layout the test environment does not have.
  it("takes the paw off a plate drawn too small for it to read", () => {
    const html = renderMap([pin("jug", "Zavetišče Jug", "Ljubljana", 50)]);

    expect(html).toContain("lucide-paw-print");
    expect(html).toContain("@max-[512px]/map-stage:hidden");
  });

  it("draws that dot hollow, in the alpha the legend swatch copies", () => {
    const html = renderMap([
      pin("empty", "Zavetišče brez živali", "Ljubljana", 0),
    ]);

    const dot = html.match(/<circle[^>]*data-marker-empty[^>]*>/)?.[0] ?? "";
    expect(dot).toContain("fill-none");
    expect(dot).toContain("stroke-foreground/45");
    expect(dot).not.toContain("fill-foreground/35");
  });

  it("keeps an off-site shelter hoverable so its dot can name itself", () => {
    const html = renderMap([
      { ...pin("johanca", "Zavetišče Johanca", "Tolmin", 0), selectable: false },
    ]);

    const marker = markerTag(html, "tolmin");
    expect(marker).toContain('data-marker-info="true"');
    expect(marker).toContain("cursor-default");
    // A dead marker takes no pointer at all; this one still answers a hover.
    expect(marker).not.toContain("pointer-events-none");
    expect(marker).not.toContain("cursor-pointer");
  });

  it("keeps an off-site shelter out of its region's pick and count", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 50),
      { ...pin("horjul", "Zavetišče Horjul", "Horjul", 0), selectable: false },
    ]);

    // Both towns sit in Osrednjeslovenska, but the region answers for the
    // one selectable shelter only.
    expect(regionTag(html, "Osrednjeslovenska")).toContain("1 zavetišče");
  });

  it("keeps pointer markers out of the accessibility tree", () => {
    const html = renderMap([
      pin("brezice", "Zavetišče Brežice", "Brežice", 5),
    ]);

    expect(html).toContain('aria-hidden="true" data-marker-kind="single"');
  });

  it("hides pointer markers below the md breakpoint", () => {
    const html = renderMap([
      pin("brezice", "Zavetišče Brežice", "Brežice", 5),
    ]);

    expect(html).toContain("hidden md:block");
  });
});

// The transparent hit path a cluster draws over each of its discs.
function wedgeTag(html: string, value: string): string {
  return (
    html.match(new RegExp(`<path[^>]*data-wedge-shelter="${value}"[^>]*>`))?.[0] ??
    ""
  );
}

function wedgeOrder(html: string): string[] {
  return [...html.matchAll(/data-wedge-shelter="([^"]+)"/g)].map(
    ([, value]) => value,
  );
}

describe("ShelterMap cluster wedges", () => {
  it("gives each shelter in a cluster its own hit target, in disc order", () => {
    const html = renderMap([
      pin("vzhod", "Zavetišče Vzhod", "Celje", 60),
      pin("zahod", "Zavetišče Zahod", "Celje", 20),
    ]);

    expect(wedgeOrder(html)).toEqual(["vzhod", "zahod"]);
  });

  it("leaves a single-shelter marker whole", () => {
    const html = renderMap([
      pin("brezice", "Zavetišče Brežice", "Brežice", 5),
    ]);

    expect(wedgeOrder(html)).toEqual([]);
  });

  it("leaves an overflow marker whole", () => {
    const html = renderMap([
      pin("a", "Zavetišče A", "Celje", 10),
      pin("b", "Zavetišče B", "Celje", 10),
      pin("c", "Zavetišče C", "Celje", 10),
      pin("d", "Zavetišče D", "Celje", 10),
    ]);

    expect(wedgeOrder(html)).toEqual([]);
  });

  // A disc below the glyph floor loses its paw, so the callout is the only
  // place its name and its count are said. Both have to keep working.
  it("names and counts the quiet shelter of a lopsided cluster on hover", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterMap
          pins={[
            pin("vzhod", "Zavetišče Vzhod", "Celje", 60),
            pin("zahod", "Zavetišče Zahod", "Celje", 20),
          ]}
          selected={[]}
          onPick={() => undefined}
        />
      </I18nProvider>,
    );

    const disc = document.querySelector('[data-disc-shelter="zahod"]')!;
    fireEvent.pointerEnter(disc);

    expect(screen.getByText("Zavetišče Zahod")).toBeTruthy();
    expect(screen.getByText("20 živali")).toBeTruthy();
  });

  it("covers each disc with its own hit circle, in the order they are drawn", () => {
    const html = renderMap([
      pin("vzhod", "Zavetišče Vzhod", "Celje", 60),
      pin("zahod", "Zavetišče Zahod", "Celje", 20),
    ]);

    // A wedge splits the target by direction only, and the large disc reaches
    // across the town centre into the other wedge.
    expect(
      [...html.matchAll(/data-disc-shelter="([^"]+)"/g)].map(([, v]) => v),
    ).toEqual(["vzhod", "zahod"]);
  });

  it("keeps an off-site shelter's wedge hoverable but never clickable", () => {
    // Three shelters, because a zero beside a single busy one is a town that
    // one shelter dominates and it lays out as a coin with a satellite
    // instead. Two that share the town keep the coin split, and the one with
    // nothing listed rides along in it.
    const html = renderMap([
      pin("sever", "Zavetišče Sever", "Celje", 40),
      pin("vzhod", "Zavetišče Vzhod", "Celje", 30),
      { ...pin("zahod", "Zavetišče Zahod", "Celje", 0), selectable: false },
    ]);

    expect(wedgeTag(html, "sever")).toContain("cursor-pointer");
    expect(wedgeTag(html, "sever")).toContain('data-wedge-pickable="true"');
    expect(wedgeTag(html, "zahod")).toContain("cursor-default");
    expect(wedgeTag(html, "zahod")).not.toContain("data-wedge-pickable");
  });
});

// Celje: the busiest shelter in the country beside one with nothing listed.
// Sharing a coin sized for the town left Mačja hiša drawing a smaller mark
// than Horjul's, which holds a third of its animals. It draws its own coin now
// and its neighbour rides the rim.
describe("ShelterMap satellite markers", () => {
  const celje = [
    pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 186),
    { ...pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 0), selectable: false },
  ];

  function radiusOf(html: string, mark: string): number {
    const tag =
      html.match(
        new RegExp(`data-mark-kind="${mark}"[^]*?<circle[^>]*\\sr="([\\d.]+)"`),
      ) ?? [];
    return Number(tag[1]);
  }

  it("draws the dominant shelter the coin it would draw standing alone", () => {
    const shared = renderMap(celje);
    const alone = renderMap([
      pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 186),
    ]);

    expect(shared).toContain('data-marker-kind="satellite"');
    expect(shared).toContain('data-marker-shelters="2"');
    // The same circle either way: the company a shelter keeps no longer
    // changes the size of its mark.
    const solo =
      Number(
        alone.match(/data-marker-kind="single"[^]*?<circle[^]*?<circle[^>]*\sr="([\d.]+)"/)?.[1],
      );
    expect(radiusOf(shared, "coin")).toBe(solo);
    // And a lone marker in another town holding fewer animals is no larger.
    const horjul = renderMap([pin("horjul", "Zavetišče Horjul", "Horjul", 72)]);
    expect(
      Number(
        horjul.match(/data-marker-kind="single"[^]*?<circle[^]*?<circle[^>]*\sr="([\d.]+)"/)?.[1],
      ),
    ).toBe(radiusOf(shared, "coin"));
  });

  it("hangs the quiet shelter off the rim as a small mark of its own", () => {
    const html = renderMap(celje);

    expect(html).toContain('data-mark-kind="satellite"');
    // Nothing listed, so it keeps the hollow mark, at the size a lone empty
    // marker draws rather than a fraction of it.
    const dot = html.match(/<circle[^>]*data-marker-empty[^>]*>/)?.[0] ?? "";
    expect(dot).toContain("fill-none");
    expect(Number(dot.match(/\sr="([\d.]+)"/)?.[1])).toBeCloseTo(2.2, 5);
  });

  it("splits the target per mark instead of cutting wedges", () => {
    const html = renderMap(celje);

    expect(wedgeOrder(html)).toEqual([]);
    // The coin first, the satellite painted over it, so the mark under the
    // pointer answers.
    expect(
      [...html.matchAll(/data-disc-shelter="([^"]+)"/g)].map(([, v]) => v),
    ).toEqual(["macja-hisa", "sia-in-lu"]);
    // The off-site shelter names itself and stops there, the deal its dot has
    // always had.
    const target = (value: string) =>
      html.match(new RegExp(`<circle[^>]*data-disc-shelter="${value}"[^>]*>`))?.[0] ??
      "";
    expect(target("macja-hisa")).toContain('data-disc-pickable="true"');
    expect(target("sia-in-lu")).toContain("cursor-default");
    expect(target("sia-in-lu")).not.toContain("data-disc-pickable");
  });

  it("names the satellite's own shelter on hover, not its town", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterMap
          pins={[
            pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 186),
            pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
          ]}
          selected={[]}
          onPick={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.pointerEnter(
      document.querySelector('[data-disc-shelter="sia-in-lu"]')!,
    );
    expect(screen.getByText("Zavetišče Sia in Lu")).toBeTruthy();
    expect(screen.getByText("11 živali")).toBeTruthy();
  });

  it("inverts the mark that is picked, coin or satellite", () => {
    const picked = renderMap(
      [
        pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 186),
        pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
      ],
      ["sia-in-lu"],
    );

    expect(picked).toContain('data-marker-state="mixed"');
    expect(picked).toMatch(
      /data-cluster-disc="idle" data-cluster-shelter="macja-hisa" data-mark-kind="coin"/,
    );
    expect(picked).toMatch(
      /data-cluster-disc="selected" data-cluster-shelter="sia-in-lu" data-mark-kind="satellite"/,
    );
  });

  it("gives a three-shelter dominated town one coin and two satellites", () => {
    const html = renderMap([
      pin("veliko", "Zavetišče Veliko", "Celje", 180),
      pin("srednje", "Zavetišče Srednje", "Celje", 20),
      pin("majhno", "Zavetišče Majhno", "Celje", 6),
    ]);

    expect(html).toContain('data-marker-kind="satellite"');
    expect(html.match(/data-mark-kind="satellite"/g)).toHaveLength(2);
    expect(html.match(/data-mark-kind="coin"/g)).toHaveLength(1);
    // The busier companion draws the larger of the two.
    const satellite = (value: string) =>
      Number(
        html.match(
          new RegExp(
            `data-cluster-shelter="${value}" data-mark-kind="satellite"[^]*?<circle[^>]*\\sr="([\\d.]+)"`,
          ),
        )?.[1],
      );
    expect(satellite("srednje")).toBeGreaterThan(satellite("majhno"));
  });

  it("keeps a town nobody dominates on the split coin", () => {
    const html = renderMap([
      pin("vzhod", "Zavetišče Vzhod", "Celje", 79),
      pin("zahod", "Zavetišče Zahod", "Celje", 20),
    ]);

    expect(html).toContain('data-marker-kind="cluster"');
    expect(html).not.toContain("data-mark-kind");
  });
});

describe("ShelterMap regions", () => {
  it("spreads the density ramp over the live regions by rank", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("maribor", "Zavetišče Maribor", "Maribor", 40),
      pin("koper", "Zavetišče Koper", "Koper", 90),
    ]);

    const steps = [...html.matchAll(/data-region-density="(\d)"/g)].map(
      ([, step]) => Number(step),
    );
    expect(steps).toHaveLength(3);
    expect(Math.min(...steps)).toBe(0);
    expect(Math.max(...steps)).toBe(DENSITY_STEPS.length - 1);
  });

  it("gives a region with no animals but a picked shelter the lowest step", () => {
    const html = renderMap(
      [
        pin("empty", "Zavetišče brez živali", "Ljubljana", 0),
        pin("maribor", "Zavetišče Maribor", "Maribor", 40),
      ],
      ["empty"],
    );

    const region = regionTag(html, "Osrednjeslovenska");
    expect(region).toContain('data-region-state="selected"');
    expect(region).toContain('data-region-density="0"');
  });

  it("marks a fully picked region green and a partly picked one apart from it", () => {
    const html = renderMap(
      [
        pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
        pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
        pin("maribor", "Zavetišče Maribor", "Maribor", 40),
      ],
      ["macja-hisa", "maribor"],
    );

    expect(html).toContain('data-region-state="mixed"');
    expect(html).toContain('data-region-state="selected"');
    expect(html).toContain("var(--filter-accent-strong)");
  });

  it("hatches a partly picked region instead of half-fading the green", () => {
    const html = renderMap(
      [
        pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
        pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
      ],
      ["macja-hisa"],
    );

    const pattern = html.match(/<pattern[^>]*>/)?.[0] ?? "";
    const id = pattern.match(/id="([^"]+)"/)?.[1] ?? "";
    expect(id).not.toBe("");
    expect(pattern).toContain('patternUnits="userSpaceOnUse"');
    expect(pattern).toContain('patternTransform="rotate(45)"');

    const region = regionTag(html, "Savinjska");
    expect(region).toContain('data-region-state="mixed"');
    expect(region).toContain(`fill="url(#${id})"`);
    // The half-strength green the hatch replaces.
    expect(region).not.toContain("fill-opacity:0.5");
  });

  it("keeps every region drawn, empty ones included", () => {
    const html = renderMap([
      pin("brezice", "Zavetišče Brežice", "Brežice", 5),
    ]);

    expect(html).toContain('data-region-state="inert"');
    expect(html).toContain("stroke-foreground/30");
    expect(html).not.toContain("stroke-background");
  });

  it("names a region for assistive tech without a native tooltip", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
    ]);

    expect(html).toContain(
      'aria-label="Osrednjeslovenska: 1 zavetišče, 5 živali"',
    );
    expect(html).not.toContain("<title>");
  });
});

describe("ShelterMap geographic context", () => {
  const html = renderMap([pin("koper", "Zavetišče Koper", "Koper", 5)]);
  const layer =
    html.match(/<g aria-hidden="true" class="pointer-events-none"[^>]*>/)?.[0] ??
    "";

  it("paints sea across the viewBox and the neighbouring land over it", () => {
    const sea = html.match(/<rect[^>]*data-map-sea[^>]*>/)?.[0] ?? "";
    expect(sea).toContain('width="320"');
    expect(sea).toContain('height="210"');
    expect(sea).toContain("var(--map-sea)");

    const abroad = [...html.matchAll(/data-map-abroad="([^"]+)"/g)].map(
      ([, id]) => id,
    );
    // The four neighbours, plus Natural Earth's Slovenia underneath, which is
    // what keeps the border from opening a sliver of sea.
    expect(abroad).toEqual(["ITA", "AUT", "HUN", "HRV", "SVN"]);
    expect(html).toContain("var(--map-abroad)");
  });

  it("draws the context before the country, inert and out of the tree", () => {
    expect(layer).not.toBe("");
    expect(html.indexOf("data-map-sea")).toBeLessThan(
      html.indexOf("stroke-foreground/45"),
    );
  });

  const maskId = layer.match(/mask="url\(#([^)]+)\)"/)?.[1] ?? "";

  it("fades the context out at the edges and masks nothing else", () => {
    expect(maskId).not.toBe("");
    expect(html).toContain(`<mask id="${maskId}"`);
    // Four edge gradients, so the fade runs on all sides rather than one.
    expect(html).toContain(`<linearGradient id="${maskId}-t"`);
    expect(html).toContain(`<linearGradient id="${maskId}-b"`);
    expect(html).toContain(`<linearGradient id="${maskId}-l"`);
    expect(html).toContain(`<linearGradient id="${maskId}-r"`);
    // Only the context wears the fade itself.
    expect(html.match(new RegExp(`mask="url\\(#${maskId}\\)"`, "g"))).toHaveLength(1);
  });

  it("holds the fade off the southwest corner, where the sea is", () => {
    // The two strips crossing the gulf switch themselves off along their
    // length; the two that never touch it do not.
    expect(html).toContain(
      `<rect x="0" y="0" width="14" height="210" fill="url(#${maskId}-l)" mask="url(#${maskId}-l-keep-mask)"`,
    );
    expect(html).toContain(
      `<rect x="0" y="196" width="320" height="14" fill="url(#${maskId}-b)" mask="url(#${maskId}-b-keep-mask)"`,
    );
    expect(html).toContain(
      `<rect x="0" y="0" width="320" height="14" fill="url(#${maskId}-t)"></rect>`,
    );
    expect(html).toContain(
      `<rect x="306" y="0" width="14" height="210" fill="url(#${maskId}-r)"></rect>`,
    );

    // Each keep gradient runs white (fade) to black (no fade) toward the
    // water, in user units, so it lands on the coastline and not on a
    // proportion of the strip.
    const keeps = [...html.matchAll(/<linearGradient id="[^"]*-keep"[^>]*>/g)].map(
      ([tag]) => tag,
    );
    expect(keeps).toHaveLength(2);
    for (const keep of keeps) {
      expect(keep).toContain('gradientUnits="userSpaceOnUse"');
    }
    // Left strip: faded above y 132, off below y 162.
    expect(keeps[0]).toContain('y1="132"');
    expect(keeps[0]).toContain('y2="162"');
    // Bottom strip: faded right of x 50, off left of x 18.
    expect(keeps[1]).toContain('x1="50"');
    expect(keeps[1]).toContain('x2="18"');
  });

  it("names the water, in the italic every map sets water in", () => {
    const sea = html.match(/<text[^>]*data-map-sea-label[^>]*>/)?.[0] ?? "";
    expect(sea).not.toBe("");
    expect(sea).toContain('font-style="italic"');
    // Two stacked lines, because the gulf is a column narrower than the name
    // set level: one line had nowhere to stand but the Italian coast.
    expect(html).toContain(">Jadransko</tspan>");
    expect(html).toContain(">morje</tspan>");
  });

  const coast = html.match(/<path[^>]*data-map-coastline[^>]*>/)?.[0] ?? "";
  const rivers = html.match(/<path[^>]*data-map-rivers[^>]*>/)?.[0] ?? "";

  it("draws the coast as an open hairline, not another ring", () => {
    expect(coast).not.toBe("");
    const d = coast.match(/ d="([^"]+)"/)?.[1] ?? "";
    // A ring would close itself and rule a chord back across the water.
    expect(d).toMatch(/^M-?[\d.]/);
    expect(d).not.toContain("Z");
    expect(coast).toContain("fill-none");
  });

  it("keeps the coast well under the country silhouette", () => {
    expect(coast).toContain('stroke-width="0.4"');
    expect(coast).toContain("stroke-foreground/25");
    // The silhouette: 1.1 wide at 45%. The coast must lose on both counts.
    expect(html).toContain("stroke-foreground/45");
    expect(html).toContain("[stroke-width:1.1]");
  });

  it("draws the rivers thinner still, in the water tone rather than in ink", () => {
    expect(rivers).not.toBe("");
    expect(rivers).toContain('stroke-width="0.3"');
    expect(rivers).toContain("var(--map-river)");
    expect(rivers).toContain('fill="none"');
    const d = rivers.match(/ d="([^"]+)"/)?.[1] ?? "";
    expect(d).not.toContain("Z");
    // Sava, Drava and Mura, so three separate lines and no more.
    expect(d.match(/M/g)).toHaveLength(3);
  });

  it("stacks the rivers over the land and the coast over both, all masked", () => {
    // Inside the one masked group, which the sea opens and the silhouette
    // closes: the context fades at the edges and the choropleth stays on top.
    expect(html.indexOf("data-map-sea")).toBeLessThan(
      html.indexOf("data-map-rivers"),
    );
    expect(html.indexOf('data-map-abroad="SVN"')).toBeLessThan(
      html.indexOf("data-map-rivers"),
    );
    expect(html.indexOf("data-map-rivers")).toBeLessThan(
      html.indexOf("data-map-coastline"),
    );
    expect(html.indexOf("data-map-coastline")).toBeLessThan(
      html.indexOf("stroke-foreground/45"),
    );
    expect(html.indexOf("data-map-coastline")).toBeLessThan(
      html.indexOf("data-region-state"),
    );
  });
});

// The relief is a real hillshade computed from public elevation tiles by
// scripts/build-map-hillshade.mjs. Nothing here looks at the raster: the
// pixels are the script's business and the asset is committed. What is
// asserted is everything the component decides — where the image sits in the
// stack, that it stops at the border, and that both themes are told how to
// blend it.
describe("ShelterMap hillshade", () => {
  const html = renderMap([pin("koper", "Zavetišče Koper", "Koper", 5)]);
  const image = html.match(/<image[^>]*data-map-hillshade[^>]*>/)?.[0] ?? "";

  it("lays the raster over the whole viewBox, at the viewBox's own size", () => {
    expect(image).not.toBe("");
    expect(image).toContain('href="/map-hillshade.png"');
    expect(image).toContain('width="320"');
    expect(image).toContain('height="210"');
    expect(image).toContain('preserveAspectRatio="none"');
  });

  const clipId = image.match(/clip-path="url\(#([^)]+)\)"/)?.[1] ?? "";

  it("clips the relief to the country and to nothing else", () => {
    expect(clipId).not.toBe("");
    const clip =
      html.match(new RegExp(`<clipPath id="${clipId}">.*?</clipPath>`))?.[0] ??
      "";
    expect(clip).not.toBe("");
    // The clip path has to be the country's own outline, not a copy that could
    // drift from it. The silhouette stroked at 1.1 draws the same d.
    const clipD = clip.match(/ d="([^"]+)"/)?.[1] ?? "";
    const silhouette =
      html.match(/<path[^>]* d="([^"]+)"[^>]*\[stroke-width:1\.1\]/)?.[1] ?? "";
    expect(clipD).not.toBe("");
    expect(clipD).toBe(silhouette);
    // One user of the clip: terrain must not be clipped onto anything else.
    expect(
      html.match(new RegExp(`clip-path="url\\(#${clipId}\\)"`, "g")),
    ).toHaveLength(1);
  });

  it("takes its blend, opacity and inversion from the theme's tokens", () => {
    // Not a hard-coded multiply. Dark has no headroom under multiply, so the
    // three values move together per theme and globals.css owns them.
    expect(image).toContain("[mix-blend-mode:var(--map-relief-blend)]");
    expect(image).toContain("opacity-[var(--map-relief-opacity)]");
    expect(image).toContain("[filter:invert(var(--map-relief-invert))]");
  });

  it("sits over the land base and under the rivers, the coast and the regions", () => {
    // Ground first, then relief, then everything drawn on the ground. The last
    // of these is the one that matters most: the choropleth keeps the floor.
    expect(html.indexOf("data-map-sea")).toBeLessThan(
      html.indexOf("data-map-hillshade"),
    );
    expect(html.indexOf('data-map-abroad="SVN"')).toBeLessThan(
      html.indexOf("data-map-hillshade"),
    );
    expect(html.indexOf("data-map-hillshade")).toBeLessThan(
      html.indexOf("data-map-rivers"),
    );
    expect(html.indexOf("data-map-hillshade")).toBeLessThan(
      html.indexOf("data-map-coastline"),
    );
    expect(html.indexOf("data-map-hillshade")).toBeLessThan(
      html.indexOf("data-region-state"),
    );
  });

  it("fades with the rest of the context at the viewBox edges", () => {
    // Inside the masked group, so the relief cannot rule a hard rectangle
    // across a panel that is wider than the viewBox.
    const layer =
      html.match(
        /<g aria-hidden="true" class="pointer-events-none"[^>]*mask="url\(#([^)]+)\)"[^>]*>/,
      )?.[1] ?? "";
    expect(layer).not.toBe("");
    expect(html.indexOf(`mask="url(#${layer})"`)).toBeLessThan(
      html.indexOf("data-map-hillshade"),
    );
  });

  it("is inert and unnamed, like the rest of the ground", () => {
    expect(image).not.toContain("aria-label");
    expect(image).not.toContain("role=");
  });
});

// Read off globals.css rather than off a rendered tree: the tokens are the
// whole of the theme decision, and a component test renders in neither theme.
describe("hillshade theme tokens", () => {
  // cwd is apps/web, the vitest root. import.meta.url is not a file URL under
  // the transform, so it cannot be resolved from here.
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  it("multiplies the shadow-only raster on light", () => {
    const light = css.slice(0, css.indexOf(".dark {"));
    expect(light).toContain("--map-relief-blend: multiply;");
    expect(light).toContain("--map-relief-invert: 0;");
    const opacity = Number(
      light.match(/--map-relief-opacity:\s*([\d.]+);/)?.[1] ?? "0",
    );
    // Texture, not a subject. Past about a third the relief starts competing
    // with the density ramp for the same reading.
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(0.3);
  });

  it("inverts and screens on dark, where multiply has no headroom", () => {
    // Both dark selectors: the .dark class the gallery and the dialog use, and
    // the OS preference. A token set in one and missed in the other is a theme
    // that only works on half the site.
    const dark = css.slice(css.indexOf(".dark {"));
    const blocks = [
      ...dark.matchAll(/--map-relief-blend:\s*(\w+);/g),
    ].map(([, value]) => value);
    expect(blocks).toEqual(["screen", "screen"]);
    expect(
      [...dark.matchAll(/--map-relief-invert:\s*(\d);/g)].map(([, v]) => v),
    ).toEqual(["1", "1"]);
    const opacities = [
      ...dark.matchAll(/--map-relief-opacity:\s*([\d.]+);/g),
    ].map(([, value]) => Number(value));
    expect(opacities).toHaveLength(2);
    // A light mark on a dark ground carries further, so dark spends less.
    const light = Number(
      css.slice(0, css.indexOf(".dark {")).match(
        /--map-relief-opacity:\s*([\d.]+);/,
      )?.[1] ?? "0",
    );
    for (const opacity of opacities) {
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(light);
    }
  });
});

describe("ShelterMap inert regions", () => {
  it("keeps an empty region a clear step below the quietest live one", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("maribor", "Zavetišče Maribor", "Maribor", 40),
    ]);

    const inert = html.match(/<path[^>]*data-region-state="inert"[^>]*>/)?.[0] ?? "";
    // Neutral foreground and never the ramp's colour: "no shelters here" must
    // not be drawn as a faint "few animals here".
    expect(inert).toContain("fill-foreground/4");
    expect(inert).not.toContain("--map-density-fill");
    // The gap to the ramp's floor is a step of the ramp, not a rounding error.
    const steps: number[] = [...DENSITY_STEPS];
    const smallest = Math.min(
      ...steps.slice(1).map((step, index) => step - steps[index]),
    );
    expect(steps[0] - 0.04).toBeGreaterThan(smallest - 0.001);
  });

  // Ljubljana alone leaves Goriška with nothing, which is the region the
  // design review named: large, obvious, and silent until now.
  const onlyLjubljana = [pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)];

  function renderLive(pins: ShelterPin[]) {
    const onPick = vi.fn();
    const { container } = render(
      <I18nProvider locale="sl">
        <ShelterMap pins={pins} selected={[]} onPick={onPick} />
      </I18nProvider>,
    );
    // By name, not by document order: which region happens to be drawn first
    // is not what these tests are about.
    return {
      onPick,
      inert: container.querySelector('[aria-label^="Goriška"]')!,
    };
  }

  it("lets an empty region take a hover instead of swallowing it", () => {
    const html = renderMap(onlyLjubljana);
    const inert = html.match(/<path[^>]*data-region-state="inert"[^>]*>/)?.[0] ?? "";

    expect(inert).not.toBe("");
    expect(inert).not.toContain("pointer-events-none");
    // Answers with information and does nothing else, same as the legend
    // swatches. A pointer cursor would promise a click that never lands.
    expect(inert).toContain("cursor-help");
    expect(inert).not.toContain("cursor-pointer");
  });

  it("acknowledges the hover far below anything a live region does", () => {
    const html = renderMap(onlyLjubljana);
    const inert = html.match(/<path[^>]*data-region-state="inert"[^>]*>/)?.[0] ?? "";

    // 4% at rest to 7% hovered: under half the ramp's own smallest step, and
    // still well under DENSITY_STEPS[0].
    expect(inert).toContain("hover:fill-foreground/7");
    expect(0.07).toBeLessThan(DENSITY_STEPS[0]);
    // The stroke stays put; thickening it is the live region's answer.
    expect(inert).not.toContain("hover:[stroke-width");
    expect(inert).not.toContain("hover:stroke-foreground/45");
  });

  it("names the empty region and says so, without a count", () => {
    const { inert } = renderLive(onlyLjubljana);

    fireEvent.pointerOver(inert);

    expect(screen.getByText("Goriška")).toBeTruthy();
    expect(screen.getByText("Ni zavetišč v tej regiji")).toBeTruthy();
    // The live region's metadata line is a count pair joined by a middot.
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("takes the card away again when the pointer leaves", () => {
    const { inert } = renderLive(onlyLjubljana);

    fireEvent.pointerOver(inert);
    expect(screen.queryByText("Ni zavetišč v tej regiji")).toBeTruthy();

    fireEvent.pointerOut(inert);
    expect(screen.queryByText("Ni zavetišč v tej regiji")).toBeNull();
    expect(screen.queryByText("Goriška")).toBeNull();
  });

  it("stays out of the tab order and does nothing when clicked", () => {
    const { inert, onPick } = renderLive(onlyLjubljana);

    expect(inert.getAttribute("tabindex")).toBeNull();
    expect(inert.getAttribute("role")).toBe("img");
    // Explaining itself is not a control: no button role, nothing pressed.
    expect(inert.getAttribute("aria-pressed")).toBeNull();

    fireEvent.click(inert);
    fireEvent.keyDown(inert, { key: "Enter" });

    expect(onPick).not.toHaveBeenCalled();
  });

  it("keeps the empty region in the accessibility tree, named", () => {
    const goriska = regionTag(renderMap(onlyLjubljana), "Goriška");

    // A hover-only affordance would tell a screen reader nothing, so the fact
    // is carried by the label instead of being hidden along with the path.
    expect(goriska).toContain('data-region-state="inert"');
    expect(goriska).toContain('aria-label="Goriška: Ni zavetišč v tej regiji"');
    expect(goriska).toContain('role="img"');
    expect(goriska).not.toContain("aria-hidden");
  });
});

describe("ShelterMap density colour", () => {
  it("fills idle regions with the shared density token, not foreground", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("maribor", "Zavetišče Maribor", "Maribor", 40),
    ]);

    const region = regionTag(html, "Podravska");
    expect(region).toContain('data-region-state="idle"');
    // One colour for the whole ramp, with DENSITY_STEPS carrying the step as
    // alpha, so the legend swatches can use the same token and the same array.
    expect(region).toContain("fill-[var(--map-density-fill)]");
    expect(region).toContain("[fill-opacity:var(--map-density)]");
    expect(region).not.toContain("fill-foreground ");
  });

  it("keeps the selected look on its own tokens, above the ramp", () => {
    const html = renderMap(
      [
        pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
        pin("maribor", "Zavetišče Maribor", "Maribor", 40),
      ],
      ["maribor"],
    );

    const region = regionTag(html, "Podravska");
    expect(region).toContain('data-region-state="selected"');
    // --map-selected-fill, not --filter-accent-border: that token sits too
    // close to the ramp's darkest step to read as a distinct colour (see its
    // definition in globals.css), so the chosen region gets its own.
    expect(region).toContain("fill-[var(--map-selected-fill)]");
    expect(region).not.toContain("--map-density-fill");
    expect(region).not.toContain("fill-[var(--filter-accent-border)]");
  });

  it("gives the selected region the heaviest stroke on the plate, keyboard focus heavier still", () => {
    const html = renderMap(
      [
        pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
        pin("maribor", "Zavetišče Maribor", "Maribor", 40),
      ],
      ["maribor"],
    );

    const region = regionTag(html, "Podravska");
    // 1.5 at rest, stepping to 1.8 on hover/highlighted: heavier than any
    // idle region ever draws (0.6 at rest, 1 on hover), so the selection
    // reads from stroke weight alone, independent of colour vision.
    expect(region).toContain("[stroke-width:1.5]");
    expect(region).toContain("hover:[stroke-width:1.8]");
    // Focus-visible has to outrank that 1.8 hover/highlighted step, or
    // tabbing to a selected region would not visibly change anything.
    expect(region).toContain("focus-visible:[stroke-width:2.1]");
  });
});

describe("anyRegionMixed", () => {
  const celje = [
    pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
    pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
  ];

  it("is false with nothing picked and false with a region picked whole", () => {
    expect(anyRegionMixed(celje, [])).toBe(false);
    expect(anyRegionMixed(celje, ["macja-hisa", "sia-in-lu"])).toBe(false);
  });

  it("is true once one shelter of a region is picked and another is not", () => {
    expect(anyRegionMixed(celje, ["macja-hisa"])).toBe(true);
  });

  it("agrees with the state the map draws", () => {
    expect(renderMap(celje, ["macja-hisa"])).toContain(
      'data-region-state="mixed"',
    );
    expect(renderMap(celje, ["macja-hisa", "sia-in-lu"])).not.toContain(
      'data-region-state="mixed"',
    );
  });

  it("ignores an off-site shelter, which a region pick never selects", () => {
    const pins = [
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 50),
      { ...pin("horjul", "Zavetišče Horjul", "Horjul", 0), selectable: false },
    ];

    expect(anyRegionMixed(pins, ["ljubljana"])).toBe(false);
  });
});

describe("anyEmptyMarker", () => {
  it("is false while every shelter on the map lists animals", () => {
    expect(
      anyEmptyMarker(
        [
          pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 50),
          pin("maribor", "Zavetišče Maribor", "Maribor", 40),
        ],
        [],
      ),
    ).toBe(false);
  });

  it("is true for a shelter with nothing listed, and agrees with the map", () => {
    const pins = [
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 50),
      pin("horjul", "Zavetišče Horjul", "Horjul", 0),
    ];

    expect(anyEmptyMarker(pins, [])).toBe(true);
    expect(renderMap(pins, [])).toContain("data-marker-empty");
  });

  it("is false once that shelter is picked, which draws it as a coin", () => {
    const pins = [
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 50),
      pin("horjul", "Zavetišče Horjul", "Horjul", 0),
    ];

    expect(anyEmptyMarker(pins, ["horjul"])).toBe(false);
    expect(renderMap(pins, ["horjul"])).not.toContain("data-marker-empty");
  });

  it("catches an off-site shelter sharing a town with a busy one", () => {
    const pins = [
      pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
      { ...pin("vzhod", "Zavetišče Vzhod", "Celje", 0), selectable: false },
    ];

    expect(anyEmptyMarker(pins, [])).toBe(true);
    expect(renderMap(pins, [])).toContain("data-marker-empty");
  });
});

describe("ShelterMap legend hover", () => {
  const pins = [
    pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
    pin("maribor", "Zavetišče Maribor", "Maribor", 40),
  ];

  function renderWithDensity(density: number | null): string {
    return renderToStaticMarkup(
      <I18nProvider locale="sl">
        <ShelterMap
          pins={pins}
          selected={[]}
          onPick={() => undefined}
          highlightedDensity={density}
        />
      </I18nProvider>,
    );
  }

  it("lights the regions on the hovered step and fades the rest", () => {
    const html = renderWithDensity(DENSITY_STEPS.length - 1);

    // Maribor holds the most animals, so it sits on the top step.
    const lit = regionTag(html, "Podravska");
    const dim = regionTag(html, "Osrednjeslovenska");
    expect(lit).toContain('data-region-density-focus="match"');
    expect(lit).toContain("stroke-foreground/45");
    expect(dim).toContain('data-region-density-focus="dim"');
    // The dimmed region keeps its hover value, so a pointer still lifts it out.
    expect(dim).toContain(`--map-density:${DENSITY_STEPS[0] * 0.4}`);
    expect(dim).toContain(`--map-density-hover:${DENSITY_STEPS[1]}`);
  });

  it("renders exactly as before when no step is hovered", () => {
    expect(renderWithDensity(null)).toBe(renderMap(pins));
  });

  it("leaves a picked region out of the legend preview", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="sl">
        <ShelterMap
          pins={pins}
          selected={["ljubljana"]}
          onPick={() => undefined}
          highlightedDensity={DENSITY_STEPS.length - 1}
        />
      </I18nProvider>,
    );

    expect(regionTag(html, "Osrednjeslovenska")).not.toContain(
      "data-region-density-focus",
    );
  });
});

describe("ShelterMap scale bar", () => {
  const html = renderMap([pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)]);
  const bar = html.match(/<path[^>]*data-map-scale="(\d+)"[^>]*>/);
  const km = Number(bar?.[1]);
  // Only the ends of the strokes: the tick verticals carry no x of their own.
  const xs = [
    ...(bar?.[0].match(/ d="([^"]+)"/)?.[1] ?? "").matchAll(/[MH](-?[\d.]+)/g),
  ].map(([, x]) => Number(x));

  it("measures a round number of kilometres, honestly projected", () => {
    expect(bar).not.toBeNull();
    expect(km).toBe(25);

    // The same distance put through the projection the map itself uses: two
    // points that far apart along the map's mid latitude have to span exactly
    // as many user units as the bar is long.
    const west: LatLon = { lat: 46.15, lon: 13.35 };
    const east: LatLon = {
      lat: 46.15,
      lon: 13.35 + km / (111.32 * Math.cos((46.15 * Math.PI) / 180)),
    };
    expect(distanceKm(west, east)).toBeCloseTo(km, 1);

    const length = Math.max(...xs) - Math.min(...xs);
    expect(length).toBeCloseTo(project(east).x - project(west).x, 6);
    // 0.795 km per unit, so 25 km is a little over 31 units.
    expect(length).toBeCloseTo(31.44, 1);
  });

  it("stands in the bottom-right corner, clear of the legend overlay", () => {
    expect(Math.max(...xs)).toBe(314);
    expect(html).toContain('y="173.5"');
  });

  it("labels itself without a message key, in type quieter than a callout", () => {
    const label =
      html.match(/<text[^>]*font-size="4.2"[^>]*>25 km<\/text>/)?.[0] ?? "";
    expect(label).not.toBe("");
    // The callout's title runs at 5.5px. Upright, because italic is the
    // water's register and this measures land.
    expect(label).not.toContain("italic");
  });

  it("keeps the bar out of the tree and out of the way of the pointer", () => {
    expect(html).toMatch(
      /<g aria-hidden="true" class="pointer-events-none"><path data-map-scale=/,
    );
  });
});

// The type a printed plate carries and a chart does not: the neighbours, the
// water, and three towns to anchor the shape. It is always on, so the dev
// gallery draws it too, and it is never a control.
describe("ShelterMap plate furniture", () => {
  const html = renderMap([pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)]);
  const layer = html.match(/<g aria-hidden="true" data-map-furniture[^>]*>/)?.[0] ?? "";
  const texts = [...html.matchAll(/<text[^>]*data-map-(?:neighbor|city|sea-label)[^>]*>/g)]
    .map(([tag]) => tag);
  // Anchored on the space before the attribute: data-map-city="Ljubljana"
  // ends in y=" and would otherwise answer for the y coordinate.
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`\\s${name}="([^"]+)"`))?.[1];

  it("names all four neighbours, in spaced capitals", () => {
    const names = [...html.matchAll(/data-map-neighbor="([^"]+)"/g)].map(
      ([, name]) => name,
    );
    expect(names).toEqual(["ITALIJA", "AVSTRIJA", "MADŽARSKA", "HRVAŠKA"]);
    for (const name of names) {
      const tag = html.match(new RegExp(`<text[^>]*data-map-neighbor="${name}"[^>]*>`))?.[0] ?? "";
      // Letterspaced capitals are how an atlas sets a country name, and the
      // tracking is what carries that at this size.
      expect(tag).toContain("tracking-[0.16em]");
      expect(tag).toContain("uppercase");
      expect(tag).toContain("fill-foreground/35");
    }
  });

  it("keeps every label off the frame, whatever the letterbox does", () => {
    // The SVG letterboxes into containers of every aspect ratio, so a label
    // sitting on the viewBox edge is a label waiting to be clipped.
    expect(texts.length).toBeGreaterThan(0);
    for (const tag of texts) {
      const x = Number(attr(tag, "x"));
      const y = Number(attr(tag, "y"));
      expect(x).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThanOrEqual(316);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(y).toBeLessThanOrEqual(206);
    }
  });

  it("welds each town's name to its own mark, without dots", () => {
    const cities = [...html.matchAll(/data-map-city="([^"]+)"/g)].map(
      ([, city]) => city,
    );
    expect(cities).toEqual(["Ljubljana", "Maribor", "Kranj"]);

    // A name follows its town's laid-out disc when one exists, because
    // collision layout may nudge the disc off the projected point and a name
    // left behind would caption empty ground. It has to clear the disc's own
    // radius and stay close enough to read as that disc's caption. A city
    // without a marker in the fixture keeps the projected point, nudged off
    // it but never far enough to name another place.
    const towns = layoutTowns([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
    ]);
    for (const city of cities) {
      const tag = html.match(new RegExp(`<text[^>]*data-map-city="${city}"[^>]*>`))?.[0] ?? "";
      const town = towns.find((candidate) => candidate.city === city);
      const at = town ?? project(cityAt(city)!);
      const offset = Math.hypot(Number(attr(tag, "x")) - at.x, Number(attr(tag, "y")) - at.y);
      expect(offset).toBeGreaterThan(town ? town.r + 1 : 2);
      expect(offset).toBeLessThan((town ? town.r : 0) + 8);
    }

    // A dot would be a fourth kind of mark on a plate that already has
    // markers, and would read as a shelter that is not there.
    const group =
      html.match(/<g class="hidden md:block">[\s\S]*?<\/g>/)?.[0] ?? "";
    expect(group).toContain("data-map-city");
    expect(group).not.toContain("<circle");
  });

  it("hides the town anchors below md, where the markers are hidden too", () => {
    expect(html).toMatch(/<g class="hidden md:block"><text[^>]*data-map-city/);
    // The neighbours and the water stay at every size: they name the ground,
    // not the roster.
    expect(html.indexOf("data-map-neighbor")).toBeLessThan(
      html.indexOf('<g class="hidden md:block"><text'),
    );
  });

  it("is furniture and not content: inert, unnamed, off the pointer", () => {
    expect(layer).not.toBe("");
    expect(layer).toContain("pointer-events-none");
    for (const tag of texts) {
      expect(tag).not.toContain("role=");
      expect(tag).not.toContain("aria-label");
    }
  });

  it("sits over the choropleth and under the scale bar", () => {
    // A town name read through a region fill is a town name nobody reads, so
    // the layer paints after the regions; the bar is furniture of the same
    // rank and comes next.
    expect(html.indexOf("data-region-state")).toBeLessThan(
      html.indexOf("data-map-furniture"),
    );
    expect(html.indexOf("data-map-furniture")).toBeLessThan(
      html.indexOf("data-map-scale"),
    );
  });
});

describe("ShelterMap municipality connector", () => {
  // Trebnje, well away from Ljubljana, so there is a line to draw.
  const from: LatLon = { lat: 45.908, lon: 15.01 };
  const pins = [pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)];

  function renderConnector(
    spotlightFrom?: LatLon | null,
    spotlightValues: string[] | null = ["ljubljana"],
  ): string {
    return renderToStaticMarkup(
      <I18nProvider locale="sl">
        <ShelterMap
          pins={pins}
          selected={[]}
          onPick={() => undefined}
          spotlightValues={spotlightValues}
          spotlightFrom={spotlightFrom}
        />
      </I18nProvider>,
    );
  }

  it("joins the municipality to its shelter in the origin's dashed language", () => {
    const line =
      renderConnector(from).match(/<line[^>]*data-map-connector[^>]*>/)?.[0] ?? "";

    expect(line).not.toBe("");
    expect(line).toContain('stroke-dasharray="2 2"');
    expect(line).toContain('stroke-width="0.9"');
    expect(line).toContain("stroke-foreground");
    expect(line).toContain("opacity-60");
  });

  it("starts at the municipality's own point and stops short of the ring", () => {
    const html = renderConnector(from);
    const dot =
      html.match(/<circle[^>]*data-map-connector-from[^>]*>/)?.[0] ?? "";
    const line = html.match(/<line[^>]*data-map-connector[^>]*>/)?.[0] ?? "";
    const at = (tag: string, name: string) =>
      Number(tag.match(new RegExp(`${name}="([\\d.-]+)"`))?.[1]);

    expect(at(dot, "cx")).toBeCloseTo(project(from).x, 3);
    expect(at(dot, "cy")).toBeCloseTo(project(from).y, 3);

    // Both ends give way: the line leaves its own dot and stops at the ring
    // rather than crossing either.
    const marker = project(cityAt("Ljubljana")!);
    expect(
      Math.hypot(at(line, "x1") - project(from).x, at(line, "y1") - project(from).y),
    ).toBeCloseTo(2.4, 3);
    expect(
      Math.hypot(at(line, "x2") - marker.x, at(line, "y2") - marker.y),
    ).toBeGreaterThan(4);
  });

  it("draws nothing without a municipality point, and nothing without a spotlight", () => {
    expect(renderConnector(undefined)).not.toContain("data-map-connector");
    expect(renderConnector(null)).not.toContain("data-map-connector");
    expect(renderConnector(from, null)).not.toContain("data-map-connector");
  });

  it("draws nothing from a point off the map", () => {
    // Vienna: a real place, and not one this viewBox holds.
    expect(
      renderConnector({ lat: 48.21, lon: 16.37 }),
    ).not.toContain("data-map-connector");
  });

  it("draws one line per spotlighted shelter, from the same point", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="sl">
        <ShelterMap
          pins={[
            pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
            pin("maribor", "Zavetišče Maribor", "Maribor", 40),
          ]}
          selected={[]}
          onPick={() => undefined}
          spotlightValues={["ljubljana", "maribor"]}
          spotlightFrom={from}
        />
      </I18nProvider>,
    );

    expect(html.match(/data-map-connector(?!-from)/g)).toHaveLength(2);
    expect(html.match(/data-map-connector-from/g)).toHaveLength(1);
  });

  it("keeps the connector inert and out of the accessibility tree", () => {
    const html = renderConnector(from);
    const group =
      html.match(/<g aria-hidden="true" class="pointer-events-none">(?=<line)/)?.[0] ??
      "";

    expect(group).not.toBe("");
    // Under the ring it explains, so it is never drawn across it.
    expect(html.indexOf("data-map-connector")).toBeLessThan(
      html.indexOf("stroke-[var(--filter-accent-strong)]"),
    );
  });
});

describe("ShelterMap hover linking", () => {
  it("highlights the hovered shelter's marker and its region, not others", () => {
    const html = renderMap(
      [
        pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
        pin("maribor", "Zavetišče Maribor", "Maribor", 40),
      ],
      [],
      "ljubljana",
    );

    expect(markerTag(html, "ljubljana")).toContain(
      'data-marker-highlighted="true"',
    );
    expect(markerTag(html, "maribor")).not.toContain(
      "data-marker-highlighted",
    );

    expect(regionTag(html, "Osrednjeslovenska")).toContain(
      'data-region-highlighted="true"',
    );
  });

  it("highlights the whole town marker for a clustered shelter, not just its disc", () => {
    const html = renderMap(
      [
        pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
        pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
      ],
      [],
      "sia-in-lu",
    );

    expect(markerTag(html, "celje")).toContain(
      'data-marker-highlighted="true"',
    );
  });

  it("leaves the map unhighlighted when nothing is hovered", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
    ]);

    expect(html).not.toContain("data-marker-highlighted");
    expect(html).not.toContain("data-region-highlighted");
  });
});

// Switching the species tab re-derives every number on this map at once: the
// density alphas, the marker radii, the split inside a cluster coin. The map
// morphs through that instead of snapping, and these lock down the three things
// the morph depends on that are easy to break by accident.
describe("ShelterMap species morph", () => {
  const html = renderMap([
    pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 50),
    pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 186),
    pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
    pin("maribor", "Zavetišče Maribor", "Maribor", 18),
  ]);

  // Every circle that draws a coin, hollow dot included. The transparent hit
  // circles carry no r in their style and are meant not to.
  const coins = [
    ...html.matchAll(/<circle[^>]*style="[^"]*\br:[^"]*"[^>]*>/g),
  ].map(([tag]) => tag);

  it("draws a radius as both an attribute and a style", () => {
    // The style is what transitions; the attribute is what a browser that does
    // not take r from CSS falls back to. Losing the attribute would leave those
    // browsers a circle with no size at all, which is the one outcome worse
    // than an instant radius.
    expect(coins.length).toBeGreaterThan(0);
    for (const coin of coins) {
      expect(coin).toMatch(/\sr="[\d.]+"/);
      expect(coin).toMatch(/style="[^"]*\br:\s*[\d.]+px/);
    }
  });

  it("moves the radii and the region fills on one timing", () => {
    // One duration across the map or it arrives in waves. The region path is
    // the other half of the same morph, so it is checked against the same
    // token rather than against a number written twice.
    for (const coin of coins) {
      expect(coin).toContain("duration-300");
      expect(coin).toContain("ease-out");
    }
    const region = regionTag(html, "Osrednjeslovenska");
    expect(region).toContain("fill-opacity");
    expect(region).toContain("duration-300");
    expect(region).toContain("ease-out");
  });

  it("stands every morph down for a reader who asked for less motion", () => {
    for (const coin of coins) {
      expect(coin).toContain("motion-reduce:transition-none");
    }
    expect(regionTag(html, "Osrednjeslovenska")).toContain(
      "motion-reduce:transition-none",
    );
  });

  it("leaves the plate's furniture out of it", () => {
    // The hillshade, the neighbours and the scale bar say nothing about the
    // species being asked for, so nothing about them may move when it changes.
    const furniture =
      html.match(/<g[^>]*data-map-furniture[^>]*>/)?.[0] ?? "";
    expect(furniture).not.toBe("");
    expect(furniture).not.toContain("transition");
    expect(html.match(/<image[^>]*data-map-hillshade[^>]*>/)?.[0]).not.toContain(
      "transition",
    );
    expect(html.match(/<path[^>]*data-map-scale[^>]*>/)?.[0]).not.toContain(
      "transition",
    );
  });
});
