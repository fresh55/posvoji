// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { cityAt } from "@/lib/geo";
import type { ShelterPin } from "@/lib/map-layout";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { FoundAnimalAtlas } from "./found-animal-atlas";

afterEach(cleanup);

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
    expect(screen.getByRole("group", { name: /zemljevid/i })).toBeTruthy();
    expect(screen.getByRole("searchbox")).toBeTruthy();
    // The map says what it does, once, on the plate.
    expect(
      screen.getByText("Zemljevid pokaže pristojno zavetišče"),
    ).toBeTruthy();
    // The credit the boundaries are licensed under, on this plate too.
    expect(document.querySelector('[data-slot="map-attribution"]')).toBeTruthy();
    // What to do stands under the search before any občina is named: the
    // person this page is for needs "do not move an injured animal" first.
    expect(screen.getByText("Kaj zdaj")).toBeTruthy();
    expect(screen.getByText(/Zakon o zaščiti živali/)).toBeTruthy();
    // And nothing is ringed yet.
    expect(document.querySelector("[data-map-spotlight]")).toBeNull();
  });

  it("rings the responsible shelter on the map once an občina is named", () => {
    const { container } = renderAtlas();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Ljubljana" },
    });
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });

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
