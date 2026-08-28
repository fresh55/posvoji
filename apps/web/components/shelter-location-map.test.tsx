// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShelterLocationMap } from "@/components/shelter-location-map";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";

afterEach(cleanup);

const label = "Lega zavetišča na zemljevidu Slovenije: Koper";

describe("shelter location map", () => {
  it("draws nothing for a town the gazetteer does not know", () => {
    const { container } = render(
      <ShelterLocationMap
        city="Nekje pri Nikjer"
        label="Lega zavetišča na zemljevidu Slovenije: Nekje pri Nikjer"
      />,
    );

    // Not an empty svg either: a new registry entry with an unknown town has
    // no location to show, and a blank silhouette would claim it does.
    expect(container.innerHTML).toBe("");
  });

  it("puts a known town's marker inside the viewBox", () => {
    const { container } = render(
      <ShelterLocationMap city="Koper" label={label} />,
    );

    expect(screen.getByRole("img", { name: label })).toBeTruthy();

    const marker = container.querySelectorAll("circle");
    expect(marker.length).toBe(2);
    for (const circle of marker) {
      const x = Number(circle.getAttribute("cx"));
      const y = Number(circle.getAttribute("cy"));
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_WIDTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("matches the town's spelling without case or accents", () => {
    const { container } = render(
      <ShelterLocationMap city="skofja loka" label={label} />,
    );

    expect(container.querySelectorAll("circle").length).toBe(2);
  });
});
