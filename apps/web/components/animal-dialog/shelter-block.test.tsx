// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { I18nProvider } from "@/components/i18n-provider";
import {
  resetNearbyOriginStore,
  usePublishNearbyOrigin,
} from "@/hooks/use-nearby-origin";
import type { AnimalFields } from "@/lib/animal";
import { cityAt, distanceKm, formatKm } from "@/lib/geo";

// The shelter block is the dialog's and the animal page's both. What it shows
// of the distance is what the card under the dialog shows: the town, then how
// far it is from the place the visitor gave the location picker.

const REFERENCE = new Date("2026-08-18T00:00:00.000Z");

const REX: AnimalFields = {
  id: "rex",
  source: {
    sourceUrl: "https://example.test/animals/rex",
    fetchedAt: "2026-08-17T00:00:00.000Z",
  },
  shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Maribor" },
  name: "Rex",
  species: "dog",
  status: "available",
  attribution: "Foto: Zavetišče Test",
};

function GrantOrigin({ city }: { city: string }) {
  usePublishNearbyOrigin({ at: cityAt(city)!, source: "typed", label: city });
  return null;
}

beforeEach(() => resetNearbyOriginStore());

afterEach(() => {
  cleanup();
  resetNearbyOriginStore();
});

describe("ShelterBlock distance", () => {
  it("names the town alone while nobody has given a place", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterBlock animal={REX} logos={{}} reference={REFERENCE} />
      </I18nProvider>,
    );

    expect(screen.getByText("Maribor")).toBeTruthy();
    expect(document.querySelector('[data-slot="shelter-km"]')).toBeNull();
  });

  it("adds the distance to the town once there is one", () => {
    render(
      <I18nProvider locale="sl">
        <GrantOrigin city="Ljubljana" />
        <ShelterBlock animal={REX} logos={{}} reference={REFERENCE} />
      </I18nProvider>,
    );

    const km = formatKm(distanceKm(cityAt("Ljubljana")!, cityAt("Maribor")!));
    const line = screen.getByText("Maribor").parentElement;
    expect(line?.textContent).toBe(`Maribor\u00a0·\u00a0${km}`);
    // Only the town gives way on a narrow box.
    expect(screen.getByText("Maribor").className).toContain("truncate");
  });
});
