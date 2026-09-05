// @vitest-environment jsdom

import type { Animal } from "@posvoji/schema";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalPoster } from "./animal-poster";

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

  it("prints the shelter's number when the register has one", () => {
    poster({ phones: { horjul: "01 754 32 10" } });
    expect(screen.getByText("Horjul · 01 754 32 10")).toBeTruthy();
  });

  it("states a short stay plainly and a long one as the dialog does", () => {
    const { container: short } = poster({
      animal: animal({ intakeDate: "2026-06-25" }),
    });
    expect(short.querySelector(".poster-stay")?.textContent).toBe(
      "V zavetišču: 2 meseca",
    );
    expect(short.querySelector(".poster-wait")).toBeNull();
    cleanup();

    // Past LONG_STAY_MONTHS the site makes a plea instead of stating a fact,
    // and the sheet follows that one decision rather than making its own.
    const { container: long } = poster({
      animal: animal({ intakeDate: "2020-01-10" }),
    });
    expect(long.querySelector(".poster-wait")?.textContent).toContain("Nina");
    expect(long.querySelector(".poster-stay")).toBeNull();
  });

  it("says nothing about a wait it cannot measure", () => {
    const { container } = poster();
    expect(container.querySelector(".poster-stay")).toBeNull();
    expect(container.querySelector(".poster-wait")).toBeNull();
  });

  it("prints the card's facts on one line", () => {
    const { container } = poster({
      animal: animal({ size: "medium", approximateAgeMonths: 24 }),
    });
    // Species from the "Vse" tab's pair, size from the species tab's: a sheet
    // of A4 has room for both and they are the same facts.
    expect(container.querySelector(".poster-meta")?.textContent).toBe(
      "Mačka · 2 leti · srednja",
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
