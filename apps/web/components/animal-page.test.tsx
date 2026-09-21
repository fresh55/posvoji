// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { I18nProvider } from "@/components/i18n-provider";
import type { AnimalFields } from "@/lib/animal";
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
    images: { sourceUrl: string; cachedUrl: string; width: number; height: number; rights: "display-permitted" | "unknown" }[],
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
      {
        sourceUrl: "https://example.test/fant.jpg",
        cachedUrl: "/media/animals/fant.jpg",
        width: 800,
        height: 600,
        rights: "display-permitted",
      },
      {
        sourceUrl: "https://example.test/not-permitted.jpg",
        cachedUrl: "/media/animals/not-permitted.jpg",
        width: 800,
        height: 600,
        rights: "unknown",
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
  window.history.replaceState(null, "", "/");
});

// The hero grid: `<div class="grid gap-8 ...">` wrapping the gallery (when
// there is one) and the facts column.
function heroGrid(container: HTMLElement): HTMLElement {
  const grid = container.querySelector('main [class*="grid"]');
  if (!grid) throw new Error("hero grid not found");
  return grid as HTMLElement;
}

describe("the animal page's hero", () => {
  it("clamps shared-photo links against permitted unique photos and shares that same selection", async () => {
    window.history.replaceState(null, "", "?foto=3");
    const { container } = render(
      <AnimalPage locale="sl" slug={animalPathParts(ANIMAL_WITH_PHOTO).animal} />,
    );
    expect(container.querySelector('[data-slot="photo-count"]')).toBeNull();
    expect(container.querySelector('[data-slot="photo-dots"]')).toBeNull();
    expect(container.querySelector('[data-slot="photo-frame"] img')?.getAttribute("src")).toContain("fant.jpg");
    expect(container.querySelector('img[src*="not-permitted"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Deli" }));
    const link = await screen.findByRole("textbox", { name: "Povezava" });
    expect((link as HTMLInputElement).value).not.toContain("?foto=");
  });

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
    // But the absence is named, in the words the card uses for it.
    expect(screen.getByText("Fotografija na strani zavetišča")).toBeTruthy();
  });

  it("says nothing about photographs when the animal has one", () => {
    render(
      <AnimalPage
        locale="sl"
        slug={animalPathParts(ANIMAL_WITH_PHOTO).animal}
      />,
    );

    expect(screen.queryByText("Fotografija na strani zavetišča")).toBeNull();
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

  // A grid item's automatic minimum is its min-content, so the facts column
  // could not narrow past the longest word in the description and the page
  // scrolled sideways: 401px of document inside a 390px viewport at a 150%
  // root font, 533 at 200%.
  it("lets both columns narrow past their longest word", () => {
    const { container } = render(
      <AnimalPage
        locale="sl"
        slug={animalPathParts(ANIMAL_WITH_PHOTO).animal}
      />,
    );

    const columns = [...heroGrid(container).children];
    expect(columns).toHaveLength(2);
    for (const column of columns) {
      expect(column.className).toContain("min-w-0");
    }
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

  // The shelter is the animal's real ancestor and the word this page is
  // searched for. Asserted on the row and in the JSON-LD together, because
  // PageBreadcrumb builds both from one array and a trail that names the
  // shelter on the page but not in the markup is the drift it exists to stop.
  it("names the shelter between the root and the animal", () => {
    const { container } = render(
      <AnimalPage locale="sl" slug={animalPathParts(ANIMAL_NO_PHOTO).animal} />,
    );

    const crumbs = [
      ...container.querySelectorAll('[data-slot="breadcrumb-link"]'),
    ];
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual([
      "Vse živali",
      "Zavetišče Zonzani",
    ]);
    expect(crumbs[1]?.getAttribute("href")).toBe("/zavetisca/zonzani");

    const jsonLd = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(jsonLd?.textContent).toContain("Zavetišče Zonzani");
  });
});

describe("the animal page's onward links", () => {
  it.each([
    { locale: "sl" as const, label: /Poglej vse živali/, href: "/" },
    { locale: "en" as const, label: /View all animals/, href: "/en" },
  ])("returns to the $locale collection without selecting an animal", ({ locale, label, href }) => {
    render(
      <AnimalPage locale={locale} slug={animalPathParts(ANIMAL_NO_PHOTO).animal} />,
    );
    expect(screen.getByRole("link", { name: label }).getAttribute("href"))
      .toBe(href);
  });

  it("links to the animal's own poster, drawn like the link beside it", () => {
    render(
      <AnimalPage locale="sl" slug={animalPathParts(ANIMAL_NO_PHOTO).animal} />,
    );

    const poster = screen.getByRole("link", { name: "Natisni plakat" });
    expect(poster.getAttribute("href")).toBe(
      posterPath(ANIMAL_NO_PHOTO, "sl"),
    );

    // The same quiet grammar as the collection link, down to the focus ring
    // and the tap target: this is a second way on, not a second call to
    // action. The one call to action is on the shelter block above.
    const collection = screen.getByRole("link", { name: /Poglej vse živali/ });
    expect(poster.className).toBe(collection.className);
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

// The box itself, rendered on its own. The page above is one of its two
// callers and the dialog is the other, so what it draws from the register and
// from the animal's own dates is tested here rather than through either.
describe("the shelter box", () => {
  const REFERENCE = new Date("2026-08-18T00:00:00.000Z");

  function block(rest: Partial<AnimalFields> = {}) {
    const animal: AnimalFields = {
      id: "horjul:1",
      source: {
        sourceUrl: "https://example.test/animals/1",
        fetchedAt: "2026-08-17T06:00:00.000Z",
      },
      shelter: { id: "horjul", name: "Zavetišče Horjul", city: "Horjul" },
      name: "Cufi",
      species: "cat",
      status: "available",
      medical: {},
      attribution: "Foto: Zavetišče Horjul",
      ...rest,
    };
    return render(
      <I18nProvider locale="sl">
        <ShelterBlock
          animal={animal}
          logos={{}}
          reference={REFERENCE}
        />
      </I18nProvider>,
    );
  }

  // Arrived at about two months old: the age pill and the plea both say
  // "4 leta", and without the tail the repeated number reads as a bug.
  it("says the long wait was almost the whole life when it was", () => {
    block({ intakeDate: "2022-06-15", approximateAgeMonths: 52 });

    expect(
      screen.getByText(
        "Cufi v zavetišču čaka že 4 leta, skoraj vse svoje življenje.",
      ),
    ).toBeTruthy();
  });

  // Same wait, but the animal was already six when it came in, so the age and
  // the wait are different numbers and there is nothing to explain.
  it("keeps the plain plea for an animal that arrived grown", () => {
    block({ intakeDate: "2022-06-15", approximateAgeMonths: 122 });

    expect(screen.getByText("Cufi v zavetišču čaka že 4 leta.")).toBeTruthy();
  });

  // No age at all: no repeated number, and the plainer sentence is the one
  // that does not claim more than we know.
  it("keeps the plain plea where the age is unknown", () => {
    block({ intakeDate: "2022-06-15" });

    expect(screen.getByText("Cufi v zavetišču čaka že 4 leta.")).toBeTruthy();
  });

  // Under three years the same slot holds the plain fact, so the wait is in
  // one place whichever animal is open.
  it("prints a shorter stay as a quiet line in the same slot", () => {
    block({ intakeDate: "2025-02-01" });

    const quiet = screen.getByText("V zavetišču: 1 leto");
    expect(quiet.parentElement?.className).toContain("text-muted-foreground");
    expect(screen.queryByText(/čaka že/)).toBeNull();
  });

  // The box used to print the register's number under the town. Adoption at
  // the shelters starts with their own form, and a number beside one animal
  // asked for the call they ask people not to make; their page, which the
  // name here links to, holds it, and so does the printed poster.
  it("offers no call of its own", () => {
    const { container } = block();

    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });
});
