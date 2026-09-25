// @vitest-environment jsdom

import type { Animal, Species } from "@posvoji/schema";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalGrid } from "./animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";

// jsdom ships no matchMedia, and the filter sheet asks it for the breakpoint
// as soon as it mounts.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

function animal(id: string, species: Species): Animal {
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
  };
}

const ANIMALS = animalsForClient([
  animal("dog-one", "dog"),
  animal("cat-one", "cat"),
  animal("dog-two", "dog"),
  animal("rabbit-one", "rabbit"),
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
});

describe("AnimalGrid hydration of a filtered link", () => {
  it("keeps the pre-hydration mark on until the cards are the filtered ones", async () => {
    // What the export serves for every address: markup written with no query,
    // so the unfiltered list.
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Page />);
    expect(cardNames(container).sort()).toEqual([
      "cat-one",
      "dog-one",
      "dog-two",
      "rabbit-one",
    ]);

    // The address the link opened, and the mark the layout's script puts on
    // for it before anything paints.
    window.history.replaceState(null, "", "/?vrsta=pes");
    document.documentElement.dataset.filtering = "";

    // The cards as they stand when the mark comes off. The observer's callback
    // runs once the task that took the mark off is done and before the next
    // one, which in a browser is before the next paint, so this is what the
    // first frame without the mark shows.
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

    // Outside act, on the scheduler the page has. act() would run hydration,
    // the render that reads the address and the deferred one that filters the
    // cards in a single pass, and the order between those three is what this
    // test is about.
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

    // Hydrated rather than rendered over, so the first client pass did read
    // the server's empty query and the order above really was the one tested.
    expect(recovered).toEqual([]);
    // The dogs, from the first frame the results are shown in. Taken off after
    // hydration, the mark let the unfiltered four through under a pressed Psi
    // tab until the deferred render caught up.
    expect(atRelease?.toSorted()).toEqual(["dog-one", "dog-two"]);
    expect(cardNames(container)).toEqual(atRelease);

    root.unmount();
  }, 20_000);
});
