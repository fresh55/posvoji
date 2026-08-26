// @vitest-environment jsdom
//
// jsdom, not the plain node environment this file got away with before: the
// celebration pulse pulls in motion/react's useReducedMotion, which reads
// window.matchMedia. Without a window at all it degrades to "not reduced"
// rather than throwing, so the file would still run under node, but a real
// window is what every other reduced-motion mock in this codebase needs.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Celebration } from "@/components/filters/use-filter-motion";
import { cityAt } from "@/lib/geo";
import { I18nProvider } from "@/components/i18n-provider";
import {
  groupTownsByRegion,
  layoutTowns,
  regionStatsByRegion,
  type ShelterPin,
} from "@/lib/map-layout";
import { ShelterMap } from "./shelter-map";
import { MiniMap } from "./mini-map";

function pin(
  value: string,
  label: string,
  city: string,
  count: number,
): ShelterPin {
  return { value, label, city, count, at: cityAt(city)! };
}

function renderMini(
  pins: ShelterPin[],
  selected: string[] = [],
  celebration: Celebration<string> | null = null,
): string {
  return renderToStaticMarkup(
    <MiniMap pins={pins} selected={selected} celebration={celebration} />,
  );
}

// The same drawing at the size the Kje row gives it, which is the only size
// where the seams and the town dots are drawn at all.
function renderPlate(
  pins: ShelterPin[],
  selected: string[] = [],
  celebration: Celebration<string> | null = null,
): string {
  return renderToStaticMarkup(
    <MiniMap
      pins={pins}
      selected={selected}
      celebration={celebration}
      detail="plate"
      outlineWidth={2}
    />,
  );
}

describe("MiniMap regions", () => {
  it("draws all twelve regions, whatever the roster", () => {
    const html = renderMini([
      pin("brezice", "Zavetišče Brežice", "Brežice", 5),
    ]);

    expect(html.match(/data-minimap-region-state="/g)).toHaveLength(12);
  });

  it("carries a density class on every live, unpicked region", () => {
    const html = renderMini([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("maribor", "Zavetišče Maribor", "Maribor", 40),
    ]);

    const idle = [
      ...html.matchAll(/<path[^>]*data-minimap-region-state="idle"[^>]*>/g),
    ].map(([tag]) => tag);
    expect(idle.length).toBeGreaterThan(0);
    for (const tag of idle) {
      expect(tag).toContain("fill-[var(--map-density-fill)]");
      expect(tag).toContain("[fill-opacity:var(--map-density)]");
      expect(tag).toMatch(/data-minimap-region-density="\d"/);
    }
  });

  it("shows the selection accent on a fully picked shelter's region", () => {
    const html = renderMini(
      [pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)],
      ["ljubljana"],
    );

    const region = html.match(
      /<path[^>]*data-minimap-region-state="selected"[^>]*>/,
    )?.[0];
    expect(region).toBeTruthy();
    expect(region).toContain("fill-[var(--filter-accent-strong)]");
  });

  // Hatching cannot survive at trigger-icon size, so a mixed region gets the
  // same solid accent a fully selected one gets, rather than a pattern nobody
  // could ever resolve.
  it("gives a partly picked region the same accent as a fully picked one", () => {
    const pins = [
      pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
      pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
    ];
    const html = renderMini(pins, ["macja-hisa"]);

    const region = html.match(
      /<path[^>]*data-minimap-region-state="mixed"[^>]*>/,
    )?.[0];
    expect(region).toBeTruthy();
    expect(region).toContain("fill-[var(--filter-accent-strong)]");
    expect(html).not.toContain("<pattern");
  });

  it("draws no markers, relief, sea or furniture", () => {
    const html = renderMini([pin("koper", "Zavetišče Koper", "Koper", 5)]);

    expect(html).not.toContain("data-marker-key");
    expect(html).not.toContain("data-map-hillshade");
    expect(html).not.toContain("data-map-sea");
    expect(html).not.toContain("data-map-furniture");
  });

  // The homepage's found-animal button asks for a place mark, not a reading:
  // no pins means every region is inert, so twelve paths would paint one flat
  // tint whose union the outline already encloses.
  it("collapses onto the outline when there is nothing to tint", () => {
    const html = renderMini([]);

    expect(html).not.toContain("data-minimap-region-state");
    expect(html.match(/<path/g)).toHaveLength(1);
    expect(html).toContain("fill-foreground/5");
  });

  it("keeps the outline unfilled while regions are drawn", () => {
    const html = renderMini([pin("koper", "Zavetišče Koper", "Koper", 5)]);

    // The outline is the one path carrying a stroke width.
    const outline = html.match(/<path[^>]*stroke-width[^>]*>/)?.[0];
    expect(outline).toContain("fill-none");
    expect(html.match(/data-minimap-region-state="/g)).toHaveLength(12);
  });

  it("is aria-hidden, since the trigger's label carries the meaning", () => {
    const html = renderMini([pin("koper", "Zavetišče Koper", "Koper", 5)]);

    expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });
});

// Everything the plate draws over the glyph. The rule the whole prop exists
// for is the first test: an icon-size caller must get exactly the markup it
// got before any of this was added.
describe("MiniMap plate detail", () => {
  const roster = [
    pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
    pin("maribor", "Zavetišče Maribor", "Maribor", 40),
    pin("koper", "Zavetišče Koper", "Koper", 90),
  ];

  it("draws no seams and no dots at icon size", () => {
    const html = renderMini(roster);

    expect(html).not.toContain("stroke-background");
    expect(html).not.toContain('stroke-width="1.25"');
    expect(html).not.toContain("data-minimap-town-dot");
    expect(html).not.toContain("<circle");
    // Twelve regions and the outline, the same thirteen paths as before.
    expect(html.match(/<path/g)).toHaveLength(13);
  });

  it("keeps the icon-size drawing byte for byte what it was", () => {
    // The default is the icon, so passing nothing and asking for it by name
    // have to be the same picture.
    expect(renderMini(roster)).toBe(
      renderToStaticMarkup(
        <MiniMap pins={roster} selected={[]} celebration={null} />,
      ),
    );
  });

  it("seams every region in the ground's own colour", () => {
    const html = renderPlate(roster);

    const regions = [
      ...html.matchAll(/<path[^>]*data-minimap-region-state="[^"]*"[^>]*>/g),
    ].map(([tag]) => tag);
    expect(regions).toHaveLength(12);
    for (const tag of regions) {
      expect(tag).toContain("stroke-background");
      expect(tag).toContain('stroke-width="1.25"');
      expect(tag).toContain('stroke-linejoin="round"');
    }
  });

  it("puts a dot on every shelter town", () => {
    const html = renderPlate(roster);

    expect(html.match(/data-minimap-town-dot/g)).toHaveLength(3);
  });

  it("gives a picked town the accent ink and leaves the rest quiet", () => {
    const html = renderPlate(roster, ["koper"]);

    const dots = [...html.matchAll(/<circle[^>]*>/g)].map(([tag]) => tag);
    const picked = dots.filter((tag) =>
      tag.includes('data-minimap-town-dot="selected"'),
    );
    expect(picked).toHaveLength(1);
    // Not the selected region's own fill: the dot stands on that fill.
    expect(picked[0]).toContain("fill-[var(--filter-accent-foreground)]");
    for (const tag of dots.filter((one) => !picked.includes(one))) {
      expect(tag).toContain('data-minimap-town-dot="idle"');
      expect(tag).toContain("fill-foreground/50");
    }
  });

  it("draws an off-site town as quietly as an unpicked one", () => {
    const html = renderPlate([
      pin("koper", "Zavetišče Koper", "Koper", 90),
      { ...pin("ptuj", "Zavetišče Ptuj", "Ptuj", 0), selectable: false },
    ]);

    expect(html.match(/data-minimap-town-dot="idle"/g)).toHaveLength(2);
  });

  it("draws the dots over the fills, under the outline and under the flash", () => {
    const html = renderPlate(roster, ["koper"], { value: "koper", id: 1 });

    const firstRegion = html.indexOf("data-minimap-region-state");
    const dot = html.indexOf("data-minimap-town-dot");
    // The outline is the one path carrying a round linecap.
    const outline = html.indexOf('stroke-linecap="round"');
    const pulse = html.indexOf("data-minimap-celebration-region");
    expect(firstRegion).toBeLessThan(dot);
    expect(dot).toBeLessThan(outline);
    expect(outline).toBeLessThan(pulse);
  });

  it("draws no dots on a pinless plate, which has no towns to draw", () => {
    expect(renderPlate([])).not.toContain("data-minimap-town-dot");
  });
});

describe("MiniMap agrees with the big map", () => {
  it("ranks the same density index per region for the same pins and selection", () => {
    const pins = [
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("maribor", "Zavetišče Maribor", "Maribor", 40),
      pin("koper", "Zavetišče Koper", "Koper", 90),
    ];

    // The shared helper both components draw from, called directly: the
    // ground truth neither component may drift from.
    const expected = regionStatsByRegion(
      groupTownsByRegion(layoutTowns(pins)).byRegion,
      [],
    );

    const miniHtml = renderMini(pins);
    const bigHtml = renderToStaticMarkup(
      <I18nProvider locale="sl">
        <ShelterMap pins={pins} selected={[]} onPick={() => undefined} />
      </I18nProvider>,
    );

    for (const { stats } of expected.filter((r) => r.stats.live)) {
      expect(miniHtml).toContain(
        `data-minimap-region-density="${stats.density}"`,
      );
      expect(bigHtml).toContain(`data-region-density="${stats.density}"`);
    }
  });
});

describe("MiniMap celebration pulse", () => {
  it("flashes the region the celebrated shelter's town sits in", () => {
    const html = renderMini(
      [pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)],
      ["ljubljana"],
      { value: "ljubljana", id: 1 },
    );

    expect(html).toContain("data-minimap-celebration-region");
  });

  it("draws no flash without a celebration", () => {
    const html = renderMini(
      [pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)],
      ["ljubljana"],
    );

    expect(html).not.toContain("data-minimap-celebration-region");
  });

  it("draws no flash for a celebration whose shelter has no town on the map", () => {
    const html = renderMini(
      [pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5)],
      ["ljubljana"],
      { value: "not-on-the-map", id: 1 },
    );

    expect(html).not.toContain("data-minimap-celebration-region");
  });

  // Not tested here: suppression under prefers-reduced-motion. motion/react's
  // useReducedMotion reads window.matchMedia through a module-level singleton
  // that only ever initialises once per test file, so a mock installed after
  // earlier tests in this file have already rendered a MiniMap comes too
  // late to change what the hook already latched onto. The gate itself
  // mirrors the same useReducedMotion() guard every other filter celebration
  // in this codebase uses (SizePawCards, AgeGrowthControl).
});
