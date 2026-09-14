// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShelterLocationMap } from "@/components/shelter-location-map";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";

afterEach(cleanup);

const label = "Lega zavetišča na zemljevidu Slovenije: Koper";
const OUTLINE = "Obris države";

describe("shelter location map", () => {
  it("draws nothing for a town the gazetteer does not know", () => {
    const { container } = render(
      <ShelterLocationMap
        city="Nekje pri Nikjer"
        label="Lega zavetišča na zemljevidu Slovenije: Nekje pri Nikjer"
        outline={OUTLINE}
      />,
    );

    // Not an empty svg either: a new registry entry with an unknown town has
    // no location to show, and a blank silhouette would claim it does.
    expect(container.innerHTML).toBe("");
  });

  it("puts a known town's marker inside the viewBox", () => {
    const { container } = render(
      <ShelterLocationMap city="Koper" label={label} outline={OUTLINE} />,
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

  // The outline is GURS data under CC BY 4.0, which asks to be credited
  // wherever the boundaries are drawn. /najdena-zival credits the same country
  // through MapAttribution; this plate used to draw it with nothing under it.
  it("credits the source of the outline it draws", () => {
    const { container } = render(
      <ShelterLocationMap city="Koper" label={label} outline={OUTLINE} />,
    );

    const credit = container.querySelector("figcaption");
    expect(credit?.textContent).toBe(`${OUTLINE}: GURS, CC BY 4.0.`);
    expect(credit?.querySelector("a")?.getAttribute("href")).toContain(
      "geodetska-uprava",
    );
  });

  it("matches the town's spelling without case or accents", () => {
    const { container } = render(
      <ShelterLocationMap city="skofja loka" label={label} outline={OUTLINE} />,
    );

    expect(container.querySelectorAll("circle").length).toBe(2);
  });
});
