// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimalCard } from "@/components/animal-card";
import { I18nProvider } from "@/components/i18n-provider";
import { resetLastVisitStore } from "@/hooks/use-last-visit";
import {
  resetNearbyOriginStore,
  usePublishNearbyOrigin,
} from "@/hooks/use-nearby-origin";
import { animalsForClient } from "@/lib/dataset";
import { cityAt } from "@/lib/geo";
import { LAST_VISIT_KEY } from "@/lib/last-visit";

// What a new origin and a returning visitor's threshold cost the grid.
//
// The card is memoised because sixty of them draw together, and the two
// things added to it here both arrive after hydration, from outside the card:
// the point the location picker publishes and the visit read from storage.
// Each is drawn by a component of its own (ShelterDistance, NewListingMark),
// so what renders again is the number or the mark and not the card. The
// gallery is the probe: the card renders it with no memo boundary between
// them, so one render of the card is one render of this.
const probe = vi.hoisted(() => ({ card: 0 }));

vi.mock("@/components/photo-gallery", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/photo-gallery")>();
  return {
    ...actual,
    PhotoGallery(props: ComponentProps<typeof actual.PhotoGallery>) {
      probe.card += 1;
      return <actual.PhotoGallery {...props} />;
    },
  };
});

const NOW = new Date("2026-01-01T00:00:00.000Z");

const LUNA = animalsForClient([
  {
    id: "luna",
    source: {
      providerId: "test-shelter",
      sourceUrl: "https://example.test/animals/luna",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2025-12-28T10:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Maribor" },
    name: "Luna",
    species: "cat",
    status: "available",
    images: [],
    attribution: "Foto: Zavetišče Test",
  } satisfies Animal,
])[0]!;

const onOpen = () => undefined;

// A picker stand-in whose place can be changed with a press, so the origin
// moves while the card stays mounted.
function Page() {
  const [city, setCity] = useState("Ljubljana");
  usePublishNearbyOrigin({ at: cityAt(city)!, source: "typed", label: city });
  return (
    <>
      <button type="button" onClick={() => setCity("Celje")}>
        Celje
      </button>
      <AnimalCard
        animal={LUNA}
        reference={NOW}
        order="name"
        onOpen={onOpen}
        showShelter
      />
    </>
  );
}

function km() {
  return document.querySelector('[data-slot="shelter-km"]')?.textContent;
}

beforeEach(() => {
  probe.card = 0;
  localStorage.clear();
  sessionStorage.clear();
  resetLastVisitStore();
  resetNearbyOriginStore();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  resetLastVisitStore();
  resetNearbyOriginStore();
});

describe("AnimalCard renders", () => {
  it("draws a new distance without drawing the card again", () => {
    render(
      <I18nProvider locale="sl">
        <Page />
      </I18nProvider>,
    );
    const first = km();
    const drawn = probe.card;
    expect(first).toMatch(/km$/);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Celje" }));
    });

    expect(km()).not.toBe(first);
    expect(probe.card).toBe(drawn);
  });

  it("draws the Novo mark without drawing the card again", () => {
    localStorage.setItem(LAST_VISIT_KEY, "2025-12-20T00:00:00.000Z");
    render(
      <I18nProvider locale="sl">
        <AnimalCard
          animal={LUNA}
          reference={NOW}
          order="name"
          onOpen={onOpen}
        />
      </I18nProvider>,
    );

    // The mark arrived after the first commit, and the card was drawn once.
    expect(screen.getByText("Novo")).toBeTruthy();
    expect(probe.card).toBe(1);
  });
});
