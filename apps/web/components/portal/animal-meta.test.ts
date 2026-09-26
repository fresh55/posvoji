import { describe, expect, it } from "vitest";
import {
  hasMissingSearchableFields,
  missingSearchableFields,
  needsReview,
  withPublished,
} from "@/components/portal/animal-meta";
import type { PortalAnimal, PortalPublished } from "@/lib/portal-api";

const NOTHING_PUBLISHED: PortalPublished = {
  size: null,
  energy: null,
  goodWithKids: null,
  goodWithDogs: null,
  goodWithCats: null,
  apartmentOk: null,
};

function animal(over: Partial<PortalAnimal> = {}): PortalAnimal {
  return {
    id: "testno:1",
    species: "dog",
    status: "available",
    name: "Rex",
    breed: null,
    sex: null,
    birthDate: null,
    approximateAgeMonths: null,
    size: null,
    energy: null,
    goodWithKids: null,
    goodWithDogs: null,
    goodWithCats: null,
    apartmentOk: null,
    specialNeeds: null,
    shortDescription: null,
    thumbnailUrl: null,
    overrides: {},
    ...over,
  };
}

describe("the answers the public site shows", () => {
  it("fills in what the crawl left empty", () => {
    const view = withPublished(
      animal({ published: { ...NOTHING_PUBLISHED, goodWithCats: "yes" } }),
    );

    expect(view.goodWithCats).toBe("yes");
    expect(view.goodWithKids).toBeNull();
  });

  // The public site is built from the published dataset, so where it and the
  // crawl disagree, it is the published answer adopters see.
  it("puts the published answer over the crawl's", () => {
    const view = withPublished(
      animal({ size: "medium", published: { ...NOTHING_PUBLISHED, size: "large" } }),
    );

    expect(view.size).toBe("large");
  });

  it("keeps the crawl's where nothing is published", () => {
    const view = withPublished(
      animal({ size: "medium", published: NOTHING_PUBLISHED }),
    );

    expect(view.size).toBe("medium");
  });

  it("puts the shelter's own answer over both", () => {
    const view = withPublished(
      animal({
        energy: "calm",
        overrides: { energy: "calm" },
        published: { ...NOTHING_PUBLISHED, energy: "lively" },
      }),
    );

    expect(view.energy).toBe("calm");
    expect(view.overrides).toEqual({ energy: "calm" });
  });

  it("leaves an animal with nothing published, or an older API's, as it is", () => {
    const plain = animal();
    const unpublished = animal({ published: null });

    expect(withPublished(plain)).toBe(plain);
    expect(withPublished(unpublished)).toBe(unpublished);
  });
});

describe("what is still missing", () => {
  const PUBLISHED_ALL: PortalPublished = {
    size: "small",
    energy: "calm",
    goodWithKids: "yes",
    goodWithDogs: "no",
    goodWithCats: "yes",
    apartmentOk: "no",
  };

  it("does not count an answer the public site already shows", () => {
    const record = animal({
      energy: "lively",
      published: { ...NOTHING_PUBLISHED, goodWithCats: "yes", goodWithDogs: "no" },
    });

    expect(
      missingSearchableFields(withPublished(record)).map((field) => field.key),
    ).toEqual(["goodWithKids", "apartmentOk"]);
    expect(hasMissingSearchableFields(withPublished(record))).toBe(true);
  });

  it("leaves an animal out of the review queue once the status is confirmed", () => {
    const record = animal({
      overrides: { status: "available" },
      published: PUBLISHED_ALL,
    });

    expect(hasMissingSearchableFields(withPublished(record))).toBe(false);
    expect(needsReview(withPublished(record))).toBe(false);
    // The same record without what is published is still waiting.
    expect(needsReview(withPublished({ ...record, published: null }))).toBe(true);
  });
});
