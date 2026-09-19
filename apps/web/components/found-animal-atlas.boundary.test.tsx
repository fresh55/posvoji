// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { FoundAnimalAtlas } from "./found-animal-atlas";

// Its own file because the mock is file-scoped: everywhere else in the suite
// the real map has to draw.
vi.mock("@/components/filters/shelter-map", () => ({
  ShelterMap: () => {
    throw new Error("the map threw while rendering");
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
        phone: "01 256 02 79",
        detailHref: "/zavetisca/ljubljana",
        animals: 5,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
];

// Until RenderBoundary there was no boundary anywhere in this app, so the
// nearest one above a throw in the map was the route itself: the finder, its
// phone numbers and the guidance all went with it to Next's error page.
describe("the found-animal atlas when the map throws", () => {
  it("explains the missing map and keeps shelter contacts searchable", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <I18nProvider locale="sl">
        <FoundAnimalAtlas entries={ENTRIES} pins={[]} />
      </I18nProvider>,
    );

    // A failed map has a readable fallback, while its phone lookup survives.
    expect(document.querySelector('[data-slot="map-plate"]')).toBeNull();
    // And the half of the page that answers the question is still on it.
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByText(/Poškodovane živali ne premikaj/)).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Ljubljana" },
    });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(screen.getByRole("link", { name: /01 256 02 79/ }).getAttribute("href"))
      .toBe("tel:+38612560279");
    expect(screen.getByText(getMessages("sl").muniMapUnavailable)).toBeTruthy();

    // Said out loud. A part that quietly stops rendering is a bug nobody
    // reports.
    expect(
      logged.mock.calls.some(([first]) =>
        first instanceof Error
          ? first.message === "the map threw while rendering"
          : false,
      ),
    ).toBe(true);
  });
});
