// @vitest-environment jsdom

import type { Animal } from "@posvoji/schema";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalPoster, headlineStep } from "./animal-poster";

afterEach(cleanup);

// The dataset's own build time, which is what the sheet prints its date from
// and what every age and wait on it is measured against.
const GENERATED_AT = "2026-08-30T15:48:57.480Z";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "horjul:9220",
    source: {
      providerId: "horjul",
      sourceAnimalId: "9220",
      sourceUrl: "https://example.test/nina",
      fetchedAt: GENERATED_AT,
      firstSeenAt: GENERATED_AT,
      lastSeenAt: GENERATED_AT,
    },
    shelter: { id: "horjul", name: "Zavetišče Horjul", city: "Horjul" },
    name: "Nina",
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče Horjul",
    ...overrides,
  };
}

const CACHED: Animal["images"] = [
  {
    sourceUrl: "https://example.test/nina.jpg",
    cachedUrl: "/media/animals/d88319db16f1135f.webp",
    rights: "cache-permitted",
  },
];

const HOTLINKED: Animal["images"] = [
  {
    sourceUrl: "https://example.test/nina.jpg",
    rights: "display-permitted",
  },
];

function poster(props: Partial<Parameters<typeof AnimalPoster>[0]> = {}) {
  return render(
    <AnimalPoster
      animal={animal()}
      locale="sl"
      generatedAt={GENERATED_AT}
      logos={{}}
      phones={{}}
      {...props}
    />,
  );
}

describe("the photo sheet", () => {
  it("prints our cached copy, uncropped, over a blurred fill of itself", () => {
    const { container } = poster({ animal: animal({ images: CACHED }) });

    const images = [...container.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/media/animals/d88319db16f1135f.webp",
      "/media/animals/d88319db16f1135f.webp",
    ]);
    // Print wants the one largest file. A srcset would invite the printer to
    // pick a thumbnail off the ladder.
    expect(images.every((image) => image.getAttribute("srcset") === null)).toBe(
      true,
    );
    // The fill is the same photo behind the photo and says nothing.
    expect(images[0]?.getAttribute("alt")).toBe("");
    expect(images[1]?.getAttribute("alt")).toBe("Nina");
    expect(images[1]?.className).toContain("poster-photo-image");
  });

  it("says the animal's name, its shelter and its town", () => {
    poster({ animal: animal({ images: CACHED }) });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Nina");
    expect(screen.getByText("išče dom")).toBeTruthy();
    expect(screen.getByText("Zavetišče Horjul")).toBeTruthy();
    expect(screen.getByText("Horjul")).toBeTruthy();
  });

  it("carries the QR code for the animal's own page, not for the sheet", () => {
    const { container } = poster({ animal: animal({ images: CACHED }) });

    const qr = container.querySelector('svg[role="img"]');
    expect(qr).toBeTruthy();
    expect(qr?.getAttribute("aria-label")).toContain("Nina");
    // Printed beside the code so a reader without a phone can type it, and
    // the same address the code carries. The <wbr>s between the segments are
    // break opportunities and carry no text, so the line still reads as one
    // address.
    expect(container.querySelector(".poster-url")?.textContent).toMatch(
      /^posvoji\.si\/zival\/nina-[0-9a-f]{6}\/horjul\/horjul$/,
    );
  });

  it("dates the paper from the dataset, not from the print", () => {
    poster({ animal: animal({ images: CACHED }) });
    expect(screen.getByText("stanje 30. 8. 2026")).toBeTruthy();
  });
});

describe("the typographic sheet", () => {
  it("draws no photo at all for an animal with none", () => {
    const { container } = poster();

    expect(container.querySelector("img")).toBeNull();
    // The species mark stands where the photo would have been. It is
    // decoration, so it is hidden from the accessibility tree; the QR code
    // beside it is the one svg with a role.
    expect(container.querySelector(".poster-mark svg")).toBeTruthy();
    // And it says nothing about the photo that is not there.
    expect(container.textContent).not.toMatch(/fotografij/i);
  });

  it("draws no photo for one we may only link to", () => {
    // display-permitted is the shelter's file on the shelter's server:
    // permission to show it in a browser is not permission to print it.
    const { container } = poster({ animal: animal({ images: HOTLINKED }) });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".poster-mark svg")).toBeTruthy();
  });

  it("still says the name, the shelter and the code", () => {
    const { container } = poster();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Nina");
    expect(screen.getByText("Zavetišče Horjul")).toBeTruthy();
    expect(container.querySelector('svg[role="img"]')).toBeTruthy();
  });
});

describe("what the sheet says about the animal", () => {
  it("names an animal the shelter left unnamed the way the site does", () => {
    poster({ animal: animal({ name: undefined }) });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Brez imena",
    );
  });

  it("prints the shelter's town and its number, the number on its own", () => {
    const { container } = poster({ phones: { horjul: "01 754 32 10" } });
    expect(container.querySelector(".poster-shelter-city")?.textContent).toBe(
      "Horjul",
    );
    // A phone number is the one thing a passer-by copies off a wall, so it is
    // its own line at the shelter's own size rather than a tail on the town's.
    expect(container.querySelector(".poster-shelter-phone")?.textContent).toBe(
      "01 754 32 10",
    );
  });

  it("says nothing where the register has no number", () => {
    const { container } = poster();
    expect(container.querySelector(".poster-shelter-phone")).toBeNull();
  });

  it("states a short stay as a tile and a long one as the dialog's plea", () => {
    const { container: short } = poster({
      animal: animal({ intakeDate: "2026-06-25" }),
    });
    expect(tiles(short)).toContain("V zavetišču: 2 meseca");
    expect(short.querySelector(".poster-tile--wait")).toBeTruthy();
    expect(short.querySelector(".poster-plea")).toBeNull();
    cleanup();

    // Past LONG_STAY_MONTHS the site makes a plea instead of stating a fact,
    // and the sheet follows that one decision rather than making its own. The
    // plea says the same number, so the tile yields to it.
    const { container: long } = poster({
      animal: animal({ intakeDate: "2020-01-10" }),
    });
    expect(long.querySelector(".poster-plea")?.textContent).toContain("Nina");
    expect(long.querySelector(".poster-tile--wait")).toBeNull();
  });

  it("says nothing about a wait it cannot measure", () => {
    const { container } = poster();
    expect(container.querySelector(".poster-tile--wait")).toBeNull();
    expect(container.querySelector(".poster-plea")).toBeNull();
  });
});

/** Every tile on the sheet, in the order it is printed. */
function tiles(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".poster-tile")].map(
    (tile) => tile.textContent ?? "",
  );
}

describe("the fact tiles", () => {
  it("prints what the shelter recorded and nothing it did not", () => {
    const { container } = poster({
      animal: animal({
        sex: "female",
        size: "medium",
        approximateAgeMonths: 24,
        medical: { vaccinated: true },
      }),
    });

    expect(tiles(container)).toEqual([
      "Mačka",
      "Samica",
      "2 leti",
      "Srednja",
      "Cepljenje",
    ]);
    // No sex, no age, no size and no health record on this one, and the sheet
    // says so by saying nothing. "Ni znano" would spend a tile on a fact the
    // shelter has not looked into. A sex the shelter did not record reads as
    // "unknown", which is the same silence.
    cleanup();
    const { container: bare } = poster({
      animal: animal({ sex: "unknown", name: "MAMBA", species: "dog" }),
    });
    expect(tiles(bare)).toEqual(["Pes"]);
    expect(bare.textContent).not.toMatch(/ni znano|not known/i);
  });

  it("gives the health record the filter green and identity the neutral", () => {
    const { container } = poster({
      animal: animal({
        sex: "female",
        size: "small",
        medical: { neutered: true, microchipped: true, fiv: "negative" },
      }),
    });

    const green = [...container.querySelectorAll(".poster-tile--health")].map(
      (tile) => tile.textContent,
    );
    expect(green).toEqual(["Sterilizacija", "Čip", "Brez FIV"]);
    const grey = [...container.querySelectorAll(".poster-tile--identity")].map(
      (tile) => tile.textContent,
    );
    expect(grey).toEqual(["Mačka", "Samica", "Majhna"]);
  });

  it("prints a health tile only where the record says yes", () => {
    // An untested cat is "unknown", and a tile would sell that maybe as an
    // all-clear on the one question these facts exist to answer.
    const { container } = poster({
      animal: animal({
        medical: { vaccinated: false, neutered: true, fiv: "unknown" },
      }),
    });
    const green = [...container.querySelectorAll(".poster-tile--health")].map(
      (tile) => tile.textContent,
    );
    expect(green).toEqual(["Sterilizacija"]);
  });

  it("prints a household answer only where it is a yes", () => {
    const { container } = poster({
      animal: animal({
        sex: "female",
        goodWith: { kids: "yes", dogs: "no", cats: "unknown" },
        apartmentOk: "yes",
      }),
    });
    expect(tiles(container)).toEqual([
      "Mačka",
      "Samica",
      "Se razume z otroki",
      "Primeren za stanovanje",
    ]);
    // A "no" is a fair thing to say beside the sentence that explains it on
    // the animal's own page. It is not a thing to print in letters big enough
    // to read across a room.
    expect(container.textContent).not.toContain("Raje brez psov");
  });

  it("draws the age filter's own sprout, shrub and tree", () => {
    const { container } = poster({
      animal: animal({ approximateAgeMonths: 3 }),
    });
    // The stage marks are Motion components on screen, so the sheet reads
    // their geometry from the module both of them share
    // (components/filters/age-stage-paths.ts). Three paths is the sprout.
    const age = container.querySelectorAll('[data-fact="age"] svg path');
    expect(age.length).toBe(3);
    cleanup();

    // And a tree for an animal past the adult bucket.
    const { container: old } = poster({
      animal: animal({ approximateAgeMonths: 140 }),
    });
    expect(
      old.querySelectorAll('[data-fact="age"] svg path'),
    ).toHaveLength(2);
  });
});

describe("a status the sheet has to name", () => {
  it("says the site's own word beside the name, in amber", () => {
    const { container } = poster({ animal: animal({ status: "reserved" }) });
    expect(container.querySelector(".poster-status")?.textContent).toBe(
      "rezervirano",
    );
    // Beside the name, not inside it: the heading is still the animal.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Nina");
    // And the sheet stops claiming the animal is looking, because it is not.
    expect(container.querySelector(".poster-seeking")).toBeNull();
  });

  it("names a hold the same way", () => {
    const { container } = poster({ animal: animal({ status: "hold" }) });
    expect(container.querySelector(".poster-status")?.textContent).toBe(
      "ni za posvojitev",
    );
  });

  it("says nothing for an animal that is simply available", () => {
    const { container } = poster();
    expect(container.querySelector(".poster-status")).toBeNull();
    expect(container.querySelector(".poster-seeking")?.textContent).toBe(
      "išče dom",
    );
  });
});

describe("the headline", () => {
  it("steps down by the name's length, counted and never measured", () => {
    // A static export has no browser to ask, and a headline that resized
    // itself after hydration would print differently from its own preview.
    expect(headlineStep("Nina")).toBe("l");
    expect(headlineStep("Božanska družina")).toBe("m");
    expect(headlineStep("brezrepa tritačka Luna")).toBe("s");
    expect(headlineStep("Rolf, nemški ovčar, 8 let")).toBe("xs");
  });

  it("wears the step it was given", () => {
    const { container } = poster();
    expect(
      container.querySelector("h1")?.className,
    ).toContain("poster-headline--l");
    cleanup();

    const { container: long } = poster({
      animal: animal({ name: "Rolf, nemški ovčar, 8 let" }),
    });
    expect(
      long.querySelector("h1")?.className,
    ).toContain("poster-headline--xs");
  });
});

describe("the colophon", () => {
  it("carries the site's own mark, inked for a printer", () => {
    const { container } = poster();

    const mark = container.querySelector(".poster-brand-mark");
    expect(mark).toBeTruthy();
    expect(mark?.getAttribute("viewBox")).toBe("0 0 128 120.8");
    // One explicit fill, so the sheet prints ink rather than whatever colour
    // scheme the preview happens to be in.
    expect(mark?.getAttribute("fill")).toBe("#111111");
    expect(mark?.querySelector("path")).toBeTruthy();
    expect(container.querySelector(".poster-wordmark")?.textContent).toBe(
      "posvoji.si",
    );
  });
});

describe("the English sheet", () => {
  it("is in English, and points at the English page", () => {
    const { container } = poster({
      locale: "en",
      animal: animal({ images: CACHED }),
    });

    expect(screen.getByText("is looking for a home")).toBeTruthy();
    expect(screen.getByText("as of 30 August 2026")).toBeTruthy();
    expect(
      container.querySelector(".poster-url")?.textContent,
    ).toMatch(/^posvoji\.si\/en\/animal\//);
  });
});
