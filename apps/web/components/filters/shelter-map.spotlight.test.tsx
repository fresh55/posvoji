// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { cityAt, MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
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
    // measure text, but the map must use the reported content height.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
      scale < 1 ? 54 : 24,
    );
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
    const rectangles = labels.map((label) => ({
      x: Number(label.getAttribute("x")), y: Number(label.getAttribute("y")),
      width: Number(label.getAttribute("width")), height: Number(label.getAttribute("height")),
    }));
    const [a, b] = rectangles;
    const overlap = a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
    expect(overlap).toBe(false);
    expect(container.querySelector("[data-map-leader]")).toBeTruthy();
  });
});
