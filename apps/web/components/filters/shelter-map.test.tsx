import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cityAt } from "@/lib/geo";
import { I18nProvider } from "@/components/i18n-provider";
import type { ShelterPin } from "@/lib/map-layout";
import { ShelterMap } from "./shelter-map";

function pin(
  value: string,
  label: string,
  city: string,
  count: number,
): ShelterPin {
  return { value, label, city, count, at: cityAt(city)! };
}

function renderMap(pins: ShelterPin[], selected: string[] = []): string {
  return renderToStaticMarkup(
    <I18nProvider locale="sl">
      <ShelterMap pins={pins} selected={selected} onPick={() => undefined} />
    </I18nProvider>,
  );
}

describe("ShelterMap marker states", () => {
  it("renders a mixed cluster as one selected and one idle paw disc", () => {
    const html = renderMap(
      [
        pin("macja-hisa", "Zavetišče Mačja hiša", "Celje", 185),
        pin("sia-in-lu", "Zavetišče Sia in Lu", "Celje", 11),
      ],
      ["macja-hisa"],
    );

    expect(html).toContain('data-marker-kind="cluster"');
    expect(html).toContain('data-marker-state="mixed"');
    expect(html).toContain('data-cluster-disc="selected"');
    expect(html).toContain('data-cluster-disc="idle"');
    expect(html).not.toContain("Celje, Celje");
  });

  it("keeps an unavailable marker visibly and behaviorally disabled", () => {
    const html = renderMap([
      pin("empty", "Zavetišče brez živali", "Ljubljana", 0),
    ]);

    expect(html).toContain('data-marker-live="false"');
    expect(html).toContain("pointer-events-none");
  });

  it("gives a populated low-count region a visible density step", () => {
    const html = renderMap([
      pin("ljubljana", "Zavetišče Ljubljana", "Ljubljana", 5),
    ]);

    expect(html).toMatch(
      /fill-foreground\/14[^>]*><title>Osrednjeslovenska/,
    );
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
