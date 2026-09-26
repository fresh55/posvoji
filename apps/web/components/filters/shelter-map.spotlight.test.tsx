// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { cityAt, MAP_HEIGHT, MAP_WIDTH, project } from "@/lib/geo";
import { ShelterMap } from "./shelter-map";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a municipality served by two nearby shelters", () => {
  it.each([1.7, 0.85])("keeps both shelter labels readable at scale %s", (scale) => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0,
      width: MAP_WIDTH * scale, height: MAP_HEIGHT * scale,
      bottom: MAP_HEIGHT * scale, right: MAP_WIDTH * scale,
      toJSON() {},
    });
    // Emulate multiline shelter names on the smaller plate. jsdom does not
    // measure text, but the map must use the chip's reported size, which
    // carries its padding.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
      scale < 1 ? 74 : 44,
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(150);
    const { container } = render(
      <I18nProvider locale="sl">
        <ShelterMap
          interactive={false}
          shading="flat"
          pins={[
            { value: "macja-hisa", label: "Mačja hiša", city: "Celje", at: cityAt("Celje")!, count: 3 },
            { value: "zonzani", label: "Zavetišče Zonzani", city: "Dramlje", at: cityAt("Dramlje")!, count: 3 },
          ]}
          spotlightValues={["macja-hisa", "zonzani"]}
          spotlightNote="pristojno zavetišče · starejši vir"
        />
      </I18nProvider>,
    );

    const labels = [...container.querySelectorAll("[data-map-callout] foreignObject")];
    expect(labels).toHaveLength(2);
    // Each card is laid out in its own pixels inside a group that translates
    // and scales it onto the plate, with a ten-pixel margin round the chip for
    // its shadow. The chip itself, in the plate's units:
    const rectangles = labels.map((label) => {
      const [, tx, ty, s] = (
        label.parentElement!.getAttribute("transform")!.match(
          /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([\d.e-]+)\)/,
        ) ?? []
      ).map(Number);
      return {
        x: tx + 10 * s,
        y: ty + 10 * s,
        width: 150 * s,
        height: (Number(label.getAttribute("height")) - 20) * s,
      };
    });
    const [a, b] = rectangles;
    const overlap = a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
    expect(overlap).toBe(false);
    // And each card says whose it is: it stands beside its own shelter, or it
    // draws a line to it from wherever it had to go.
    const marks: Record<string, { x: number; y: number }> = {
      "Mačja hiša": project(cityAt("Celje")!),
      "Zavetišče Zonzani": project(cityAt("Dramlje")!),
    };
    const cards = [...container.querySelectorAll("[data-map-callout]")];
    cards.forEach((card, index) => {
      const at = marks[card.querySelector("[data-callout-title]")!.textContent!];
      const rect = rectangles[index];
      const away = Math.hypot(
        Math.min(Math.max(at.x, rect.x), rect.x + rect.width) - at.x,
        Math.min(Math.max(at.y, rect.y), rect.y + rect.height) - at.y,
      );
      if (away > 30) expect(card.querySelector("[data-map-leader]")).toBeTruthy();
    });
  });
});
