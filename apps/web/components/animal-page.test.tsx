// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { animalPathParts } from "@/lib/animal-path";
import { AnimalPage } from "./animal-page";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// vi.hoisted, because vi.mock below is itself hoisted above every import in
// this file: by the time "@/lib/dataset" is first resolved (as soon as
// animal-page.tsx above is loaded), these two fixtures have to already exist.
const { ANIMAL_NO_PHOTO, ANIMAL_WITH_PHOTO } = vi.hoisted(() => {
  // Named parameters rather than a partial-override merge: merging a literal
  // base with a loosely typed override widens every field the override could
  // touch (id, name, images) back to a bare string/array, and AnimalFields
  // wants species and status to stay their own literal unions.
  function animal(
    id: string,
    name: string,
    images: { sourceUrl: string; cachedUrl: string; width: number; height: number; rights: "display-permitted" }[],
  ) {
    return {
      id,
      source: {
        providerId: "zonzani",
        sourceAnimalId: id,
        sourceUrl: "https://example.test/animals/1",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
      shelter: { id: "zonzani", name: "Zavetišče Zonzani", city: "Dramlje" },
      name,
      species: "cat" as const,
      status: "available" as const,
      medical: {},
      images,
      attribution: "Test fixture",
    };
  }

  return {
    ANIMAL_NO_PHOTO: animal("zonzani:1", "Muri", []),
    ANIMAL_WITH_PHOTO: animal("zonzani:2", "Fant", [
      {
        sourceUrl: "https://example.test/fant.jpg",
        cachedUrl: "/media/animals/fant.jpg",
        width: 800,
        height: 600,
        rights: "display-permitted",
      },
    ]),
  };
});

// The dataset and the logo manifest are both read from disk in production;
// mocked here so the test names exactly the animals it renders rather than
// depending on whatever happens to be checked out in data/dist.
vi.mock("@/lib/dataset", () => ({
  loadDataset: () => ({
    animals: [ANIMAL_NO_PHOTO, ANIMAL_WITH_PHOTO],
    generatedAt: "2026-01-01T00:00:00.000Z",
  }),
}));
vi.mock("@/lib/shelter-logos", () => ({
  getShelterLogos: () => ({}),
}));

afterEach(cleanup);

// The hero grid: `<div class="grid gap-8 ...">` wrapping the gallery (when
// there is one) and the facts column.
function heroGrid(container: HTMLElement): HTMLElement {
  const grid = container.querySelector('main [class*="grid"]');
  if (!grid) throw new Error("hero grid not found");
  return grid as HTMLElement;
}

describe("the animal page's hero", () => {
  it("stays single-column when the animal has no photo", () => {
    const { container } = render(
      <AnimalPage
        locale="sl"
        slug={animalPathParts(ANIMAL_NO_PHOTO).animal}
      />,
    );

    // 14 animals in the live register carry no images at all. The grid used
    // to go two-up at sm regardless, leaving the facts column alone beside an
    // empty half.
    const grid = heroGrid(container);
    expect(grid.className).not.toContain("sm:grid-cols-2");
    // No gallery mounts at all: there is nothing for it to show.
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the two-column layout when the animal has a photo", () => {
    const { container } = render(
      <AnimalPage
        locale="sl"
        slug={animalPathParts(ANIMAL_WITH_PHOTO).animal}
      />,
    );

    const grid = heroGrid(container);
    expect(grid.className).toContain("sm:grid-cols-2");
  });
});
