import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

function renderMini(pins: ShelterPin[], selected: string[] = []): string {
  return renderToStaticMarkup(
    <MiniMap pins={pins} selected={selected} />,
  );
}

describe("MiniMap regions", () => {
  it("draws all twelve regions, whatever the roster", () => {
    const html = renderMini([pin("brezice", "Zavetišče Brežice", "Brežice", 5)]);

    expect(html.match(/data-minimap-region-state="/g)).toHaveLength(12);
  });

  it("carries a density class on every live, unpicked region", () => {
    const html = renderMini([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
      pin("maribor", "Zavetišče Maribor", "Maribor", 40),
    ]);

    const idle = [...html.matchAll(/<path[^>]*data-minimap-region-state="idle"[^>]*>/g)].map(
      ([tag]) => tag,
    );
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
