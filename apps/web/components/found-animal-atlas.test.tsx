// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { cityAt } from "@/lib/geo";
import type { ShelterPin } from "@/lib/map-layout";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { FoundAnimalAtlas } from "./found-animal-atlas";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const ENTRIES: LookupEntry[] = [
  {
    name: "Ljubljana",
    nearest: [],
    coverage: [
      {
        shelterId: "ljubljana",
        shelterName: "Zavetišče Ljubljana",
        city: "Ljubljana",
        detailHref: "/zavetisca/ljubljana",
        animals: 5,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
];

const PINS: ShelterPin[] = [
  {
    value: "ljubljana",
    label: "Zavetišče Ljubljana",
    city: "Ljubljana",
    at: cityAt("Ljubljana")!,
    count: 5,
  },
  {
    value: "maribor",
    label: "Zavetišče Maribor",
    city: "Maribor",
    at: cityAt("Maribor")!,
    count: 0,
    selectable: false,
  },
  // Far busier than Ljubljana, so a density ramp would put the two regions on
  // different steps and a flat map on the same one.
  {
    value: "obalno",
    label: "Zavetišče Obala",
    city: "Koper",
    at: cityAt("Koper")!,
    count: 40,
  },
];

function renderAtlas() {
  return render(
    <I18nProvider locale="sl">
      <FoundAnimalAtlas entries={ENTRIES} pins={PINS} />
    </I18nProvider>,
  );
}

describe("the found-animal atlas", () => {
  it("draws the map and the finder together, with the guidance up front", () => {
    renderAtlas();

    // Both halves of the answer, the map and the finder, on one page.
    const map = screen.getByRole("img", { name: /zemljevid/i });
    expect(map).toBeTruthy();
    // This page explains a lookup result; it does not expose filter controls
    // whose activation is silently discarded.
    expect(
      map.querySelector(
        '[role="button"], [aria-pressed], [tabindex], [data-map-commit]',
      ),
    ).toBeNull();
    expect(screen.getByRole("combobox")).toBeTruthy();
    // Nothing on the plate but the map and the credit its boundaries are
    // licensed under: no instruction chip, and no legend, because the regions
    // are flat here and there is no ramp to read.
    expect(document.querySelector('[data-slot="map-attribution"]')).toBeTruthy();
    expect(document.querySelector("[data-map-legend]")).toBeNull();
    const densities = [...map.querySelectorAll("[data-region-density]")].map(
      (region) => region.getAttribute("data-region-density"),
    );
    expect(densities.length).toBeGreaterThan(1);
    expect(new Set(densities)).toEqual(new Set(["0"]));
    // Guidance remains available before a municipality is named.
    expect(screen.getByText(/Zakon o zaščiti živali/)).toBeTruthy();
    expect(screen.getByText(/Poškodovane živali ne premikaj/)).toBeTruthy();
    // And nothing is ringed yet.
    expect(document.querySelector("[data-map-spotlight]")).toBeNull();
  });

  it("rings the responsible shelter on the map once an občina is named", () => {
    const { container } = renderAtlas();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Ljubljana" },
    });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    // The finder's answer reached the map: a spotlight ring, and a callout
    // naming the shelter and what it is: the responsible one.
    expect(container.querySelector("[data-map-spotlight]")).toBeTruthy();
    const callout = container.querySelector("[data-callout-metadata]");
    expect(callout?.textContent).toBe("pristojno zavetišče");
    expect(
      container.querySelector("[data-callout-title]")?.textContent,
    ).toContain("Zavetišče Ljubljana");
  });
});
