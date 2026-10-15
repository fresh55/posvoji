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

describe("ShelterBlock source actions", () => {
  it.each([
    { locale: "sl" as const, status: "available" as const, label: "Kontakt zavetišča", href: "/zavetisca/oskar", sourceUrl: "https://posvoji.si/zavetisca/oskar" },
    { locale: "en" as const, status: "available" as const, label: "Contact the shelter", href: "/en/shelters/oskar", sourceUrl: "https://posvoji.si/animals/luna?from=portal" },
    { locale: "sl" as const, status: "adopted" as const, label: "Kontakt zavetišča", href: "/zavetisca/oskar", sourceUrl: "https://posvoji.si/en/shelters/oskar" },
    { locale: "en" as const, status: "adopted" as const, label: "Contact the shelter", href: "/en/shelters/oskar", sourceUrl: "https://posvoji.si/zavetisca/oskar" },
  ])("offers contact only for an available manual listing in $locale ($status)", ({ locale, status, label, href, sourceUrl }) => {
    render(
      <I18nProvider locale={locale}>
        <ShelterBlock
          animal={{
            ...REX,
            status,
            shelter: { ...REX.shelter, id: "oskar" },
            source: { ...REX.source!, sourceUrl },
          }}
          logos={{}}
          reference={REFERENCE}
        />
      </I18nProvider>,
    );

    if (status === "adopted") {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
      const [shelter] = screen.getAllByRole("link");
      expect(shelter.getAttribute("href")).toBe(href);
      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(screen.getByText(locale === "sl" ? "Ta žival je že našla nov dom." : "This animal has already found a home.")).toBeTruthy();
      return;
    }
    const link = screen.getByRole("link", { name: label });
    expect(link.getAttribute("href")).toBe(href);
    expect(link.getAttribute("target")).toBeNull();
    expect(link.getAttribute("rel")).toBeNull();
    expect(link.querySelector("svg")).toBeNull();
  });

  it.each(["available", "adopted"] as const)("keeps the external original listing for a %s animal", (status) => {
    render(
      <I18nProvider locale="sl">
        <ShelterBlock animal={{ ...REX, status }} logos={{}} reference={REFERENCE} />
      </I18nProvider>,
    );
    const link = screen.getByRole("link", { name: "Odpri objavo pri zavetišču" });
    expect(link.getAttribute("href")).toBe(REX.source!.sourceUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(link.querySelector("svg")).not.toBeNull();
  });
});
