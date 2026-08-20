import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cityAt, distanceKm, project, type LatLon } from "@/lib/geo";
import { I18nProvider } from "@/components/i18n-provider";
import { DENSITY_STEPS, type ShelterPin } from "@/lib/map-layout";
import { ShelterMap, anyRegionMixed } from "./shelter-map";

function pin(
  value: string,
  label: string,
  city: string,
  count: number,
): ShelterPin {
  return { value, label, city, count, at: cityAt(city)! };
}

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
        pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
        pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
      ],
      ["sia-in-lu"],
    );

    expect(html).toContain('data-marker-kind="cluster"');
    expect(html).toContain('data-marker-state="mixed"');
    expect(html).toContain('data-marker-shelters="2"');
    expect(html).toMatch(
      /data-cluster-disc="idle" data-cluster-shelter="macja-hisa"/,
    );
    expect(html).toMatch(
      /data-cluster-disc="selected" data-cluster-shelter="sia-in-lu"/,
    );
    expect(html).not.toContain("Celje, Celje");
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
      pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
      pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
    ]);

    expect(wedgeOrder(html)).toEqual(["macja-hisa", "sia-in-lu"]);
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

  it("keeps an off-site shelter's wedge hoverable but never clickable", () => {
    const html = renderMap([
      pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
      { ...pin("vzhod", "Zavetišče Vzhod", "Celje", 0), selectable: false },
    ]);

    expect(wedgeTag(html, "macja-hisa")).toContain("cursor-pointer");
    expect(wedgeTag(html, "macja-hisa")).toContain('data-wedge-pickable="true"');
    expect(wedgeTag(html, "vzhod")).toContain("cursor-default");
    expect(wedgeTag(html, "vzhod")).not.toContain("data-wedge-pickable");
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

  it("leaves the water unlabelled", () => {
    expect(html).not.toContain("data-map-sea-label");
    expect(html).not.toContain("Jadransko morje");
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

describe("ShelterMap inert regions", () => {
  it("keeps an empty region a clear step below the quietest live one", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("maribor", "Zavetišče Maribor", "Maribor", 40),
    ]);

    const inert = html.match(/<path[^>]*data-region-state="inert"[^>]*>/)?.[0] ?? "";
    expect(inert).toContain("fill-foreground/4");
    // The gap to the ramp's floor is a step of the ramp, not a rounding error.
    const steps: number[] = [...DENSITY_STEPS];
    const smallest = Math.min(
      ...steps.slice(1).map((step, index) => step - steps[index]),
    );
    expect(steps[0] - 0.04).toBeGreaterThan(smallest - 0.001);
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
    expect(html).toContain(">25 km</text>");
    // The callout's title runs at 5.5px; italic is the water's register.
    expect(html).toContain('font-size="4.2"');
    expect(html).not.toContain("italic");
  });

  it("keeps the bar out of the tree and out of the way of the pointer", () => {
    expect(html).toMatch(
      /<g aria-hidden="true" class="pointer-events-none"><path data-map-scale=/,
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
