// @vitest-environment jsdom

import type { Animal, Species } from "@posvoji/schema";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalGrid } from "./animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { resetAnimalDescriptionsStore } from "@/lib/animal-descriptions";
import { animalsForClient } from "@/lib/dataset";
import { stubMatchMedia } from "@/test/grid-stubs";

// A search link shared by hand, /?isci=ovcar, as the static export serves it:
// the unfiltered page, then hydration. The same order animal-grid.hydration
// .test.tsx pins for a filter, with the search in front of the filters.

stubMatchMedia();

// The query's pill arrives in the chips row, and motion measures it by reading
// the scroll position and putting it back, which jsdom cannot do.
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => {},
});

function animal(id: string, species: Species, fields: Partial<Animal>): Animal {
  return {
    id,
    source: {
      providerId: "muri",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "muri", name: "Shelter muri", city: "Ljubljana" },
    name: id,
    species,
    sex: "male",
    size: "medium",
    approximateAgeMonths: 24,
    status: "available",
    medical: {},
    images: [],
    attribution: "Test fixture",
    ...fields,
  };
}

const ANIMALS = animalsForClient([
  animal("rex", "dog", { name: "Rex", breed: "nemški ovčar" }),
  animal("bor", "dog", { name: "Bor" }),
  animal("muri", "cat", { name: "Muri" }),
  animal("ajda", "dog", { name: "Ajda" }),
]);

function Page() {
  return (
    <I18nProvider locale="sl">
      <AnimalGrid animals={ANIMALS} logos={{}} referenceDate="2026-01-01" />
    </I18nProvider>
  );
}

function cardNames(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('[data-slot="results"] article h3'),
    (heading) => heading.textContent?.trim(),
  );
}

afterEach(() => {
  delete document.documentElement.dataset.filtering;
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  resetAnimalDescriptionsStore();
});

describe("AnimalGrid hydration of a shared search", () => {
  it("opens on the cards the query finds, never on the unfiltered list", async () => {
    // The descriptions, held back until the test lets them go.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await held;
        return {
          ok: true,
          json: async () => ({
            bor: { description: "Ovčar po duši." },
            ajda: { description: "Mešanka z ovčarjem." },
          }),
        };
      }),
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<Page />);
    expect(cardNames(container)).toHaveLength(4);

    // Typed without the accent, the way a link is written by hand.
    window.history.replaceState(null, "", "/?isci=ovcar");
    document.documentElement.dataset.filtering = "";

    let atRelease: (string | undefined)[] | undefined;
    const observer = new MutationObserver(() => {
      if (atRelease || document.documentElement.hasAttribute("data-filtering"))
        return;
      atRelease = cardNames(container);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-filtering"],
    });

    // Outside act, on the scheduler the page has (see the filter's own
    // hydration test for why).
    const recovered: unknown[] = [];
    const root = hydrateRoot(container, <Page />, {
      onRecoverableError: (error) => recovered.push(error),
    });
    await vi.waitFor(
      () =>
        expect(
          document.documentElement.hasAttribute("data-filtering"),
        ).toBe(false),
      { timeout: 10_000 },
    );
    observer.disconnect();

    expect(recovered).toEqual([]);
    // The breed answers before the descriptions are in.
    expect(atRelease).toEqual(["Rex"]);

    // Then the descriptions join after it, in the list's own order.
    release();
    await vi.waitFor(
      () => expect(cardNames(container)).toEqual(["Rex", "Ajda", "Bor"]),
      { timeout: 10_000 },
    );

    root.unmount();
  }, 20_000);
});
