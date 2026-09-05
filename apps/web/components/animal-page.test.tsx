// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { animalPathParts, posterPath } from "@/lib/animal-path";
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
const { ANIMAL_NO_PHOTO, ANIMAL_UNNAMED, ANIMAL_WITH_PHOTO } = vi.hoisted(() => {
  // Named parameters rather than a partial-override merge: merging a literal
  // base with a loosely typed override widens every field the override could
  // touch (id, name, images) back to a bare string/array, and AnimalFields
  // wants species and status to stay their own literal unions.
  function animal(
    id: string,
    // Undefined for an animal the shelter never named. The register carries a
    // few, and the page has to say something in place of a name.
    name: string | undefined,
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
    ANIMAL_UNNAMED: animal("zonzani:3", undefined, []),
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
    animals: [ANIMAL_NO_PHOTO, ANIMAL_UNNAMED, ANIMAL_WITH_PHOTO],
    generatedAt: "2026-01-01T00:00:00.000Z",
  }),
}));
vi.mock("@/lib/shelter-logos", () => ({
  getShelterLogos: () => ({}),
}));
// Every animal the two client components were handed. What a client component
// is given is what the page serializes into its flight payload, whether or not
// anything is rendered from it, so this is the only place the cost is visible:
// the rendered page looks the same either way.
const handedOver = vi.hoisted(
  () => [] as { to: string; animal: Record<string, unknown> }[],
);

vi.mock("@/components/animal-dialog/animal-facts", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/animal-dialog/animal-facts")
    >();
  return {
    AnimalFacts: (props: Parameters<typeof actual.AnimalFacts>[0]) => {
      handedOver.push({ to: "AnimalFacts", animal: props.animal });
      return <actual.AnimalFacts {...props} />;
    },
  };
});

vi.mock("@/components/animal-dialog/shelter-block", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/animal-dialog/shelter-block")
    >();
  return {
    ShelterBlock: (props: Parameters<typeof actual.ShelterBlock>[0]) => {
      handedOver.push({ to: "ShelterBlock", animal: props.animal });
      return <actual.ShelterBlock {...props} />;
    },
  };
});

afterEach(() => {
  cleanup();
  handedOver.length = 0;
});

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

describe("the animal page's breadcrumb", () => {
  it("names an unnamed animal the way the heading does", () => {
    const { container } = render(
      <AnimalPage locale="sl" slug={animalPathParts(ANIMAL_UNNAMED).animal} />,
    );

    // The fallback used to be the page's own "Vse živali", which is the root
    // crumb's label word for word, so the trail read "Vse živali > Vse
    // živali" on the page and in the JSON-LD with it.
    const page = container.querySelector('[data-slot="breadcrumb-page"]');
    expect(page?.textContent).toBe("Brez imena");
    expect(container.querySelector("h1")?.textContent).toBe("Brez imena");

    const jsonLd = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(jsonLd?.textContent).toContain("Brez imena");
  });

  it("still uses the animal's own name when it has one", () => {
    const { container } = render(
      <AnimalPage locale="sl" slug={animalPathParts(ANIMAL_NO_PHOTO).animal} />,
    );

    expect(
      container.querySelector('[data-slot="breadcrumb-page"]')?.textContent,
    ).toBe("Muri");
  });
});

describe("the animal page's way to a printed sheet", () => {
  it("links to the animal's own poster, drawn like the link beside it", () => {
    render(
      <AnimalPage locale="sl" slug={animalPathParts(ANIMAL_NO_PHOTO).animal} />,
    );

    const poster = screen.getByRole("link", { name: "Natisni plakat" });
    expect(poster.getAttribute("href")).toBe(
      posterPath(ANIMAL_NO_PHOTO, "sl"),
    );

    // The same quiet grammar as "Poglej vse živali", down to the focus ring
    // and the tap target: this is a second way on, not a second call to
    // action. The one call to action is on the shelter block above.
    const finder = screen.getByRole("link", { name: /Poglej vse živali/ });
    expect(poster.className).toBe(finder.className);
  });
});

describe("what the animal page hands its client components", () => {
  it("keeps the animal's photos on the server side of the boundary", () => {
    const { container } = render(
      <AnimalPage
        locale="sl"
        slug={animalPathParts(ANIMAL_WITH_PHOTO).animal}
      />,
    );

    expect(handedOver.map(({ to }) => to).sort()).toEqual([
      "AnimalFacts",
      "ShelterBlock",
    ]);
    for (const { to, animal } of handedOver) {
      // Neither component reads a photo: both are typed against AnimalFields,
      // which is the animal without them. Handed the whole animal they
      // serialized every image into this page's payload, source URL, rights
      // and base64 placeholder included, about 3KB a page over 1006 pages.
      expect({ to, images: "images" in animal }).toEqual({
        to,
        images: false,
      });
      // Everything they do read is still there.
      expect(animal.name).toBe("Fant");
      expect(animal.attribution).toBe("Test fixture");
    }

    // And the gallery, which is server-rendered here, still has its photo.
    expect(
      container.querySelector('[data-slot="photo-frame"] img'),
    ).toBeTruthy();
  });
});
