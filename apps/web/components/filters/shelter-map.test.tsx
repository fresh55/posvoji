import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cityAt } from "@/lib/geo";
import { I18nProvider } from "@/components/i18n-provider";
import { DENSITY_STEPS, type ShelterPin } from "@/lib/map-layout";
import { ShelterMap } from "./shelter-map";

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
