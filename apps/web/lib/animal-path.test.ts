import type { Animal } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import {
  animalPath,
  animalPathParts,
  animalSlugFromPath,
  findAnimalBySlug,
  posterPath,
  slugify,
} from "@/lib/animal-path";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "horjul:luna",
    source: {
      providerId: "horjul",
      sourceAnimalId: "luna",
      sourceUrl: "https://example.test/luna",
      fetchedAt: "2026-08-01T00:00:00.000Z",
      firstSeenAt: "2026-08-01T00:00:00.000Z",
      lastSeenAt: "2026-08-01T00:00:00.000Z",
    },
    shelter: {
      id: "zavetisce-horjul",
      name: "Zavetišče Horjul",
      city: "Ljubljana",
    },
    name: "Luna",
    species: "dog",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče Horjul",
    ...overrides,
  };
}

describe("slugify", () => {
  it("folds Slovenian letters to ascii", () => {
    expect(slugify("Zavetišče Črna na Koroškem")).toBe(
      "zavetisce-crna-na-koroskem",
    );
  });

  it("spells out letters that carry no combining mark", () => {
    expect(slugify("Đorđe")).toBe("dorde");
  });

  it("collapses punctuation and trims the edges", () => {
    expect(slugify("  Luna & Max (2)  ")).toBe("luna-max-2");
  });
});

describe("animalPathParts", () => {
  it("names the animal, the town and the shelter", () => {
    const parts = animalPathParts(animal());
    expect(parts.animal).toMatch(/^luna-[0-9a-f]{6}$/);
    expect(parts.city).toBe("ljubljana");
    expect(parts.shelter).toBe("zavetisce-horjul");
  });

  it("gives two animals of the same name different addresses", () => {
    const one = animalPathParts(animal({ id: "horjul:luna-1" }));
    const two = animalPathParts(animal({ id: "horjul:luna-2" }));
    expect(one.animal).not.toBe(two.animal);
  });

  it("keeps the same address for the same animal", () => {
    expect(animalPathParts(animal()).animal).toBe(
      animalPathParts(animal()).animal,
    );
  });

  it("falls back to the species when there is no name", () => {
    const parts = animalPathParts(animal({ name: undefined }));
    expect(parts.animal).toMatch(/^dog-[0-9a-f]{6}$/);
  });

  it("never leaves a segment empty", () => {
    const parts = animalPathParts(
      animal({
        name: "???",
        shelter: { id: "!!!", name: "Zavetišče", city: "???" },
      }),
    );
    expect(parts.animal).toMatch(/^dog-[0-9a-f]{6}$/);
    expect(parts.city).toBe("slovenija");
    expect(parts.shelter).toBe("zavetisce");
  });
});

describe("animalPath", () => {
  it("writes the readable address in both languages", () => {
    const parts = animalPathParts(animal());
    expect(animalPath(animal(), "sl")).toBe(
      `/zival/${parts.animal}/ljubljana/zavetisce-horjul`,
    );
    expect(animalPath(animal(), "en")).toBe(
      `/en/animal/${parts.animal}/ljubljana/zavetisce-horjul`,
    );
  });
});

describe("posterPath", () => {
  it("hangs the sheet off the animal's own address in each language", () => {
    expect(posterPath(animal(), "sl")).toBe(
      `${animalPath(animal(), "sl")}/plakat`,
    );
    expect(posterPath(animal(), "en")).toBe(
      `${animalPath(animal(), "en")}/poster`,
    );
  });

  // The dialog host reads the live location through animalSlugFromPath. A
  // poster's address naming an animal there would have the index open that
  // animal's dialog behind a sheet nobody asked it to.
  it("is not read back as an animal's own page", () => {
    expect(animalSlugFromPath(posterPath(animal(), "sl"))).toBeNull();
    expect(animalSlugFromPath(posterPath(animal(), "en"))).toBeNull();
  });
});

describe("animalSlugFromPath", () => {
  it("reads the animal segment back out of either language's path", () => {
    const parts = animalPathParts(animal());
    expect(animalSlugFromPath(animalPath(animal(), "sl"))).toBe(parts.animal);
    expect(animalSlugFromPath(animalPath(animal(), "en"))).toBe(parts.animal);
  });

  it("accepts a trailing slash, which is what a static export serves", () => {
    expect(animalSlugFromPath("/zival/luna-abc123/ljubljana/horjul/")).toBe(
      "luna-abc123",
    );
  });

  it("ignores paths that are not an animal", () => {
    expect(animalSlugFromPath("/")).toBeNull();
    expect(animalSlugFromPath("/zavetisca/zavetisce-horjul")).toBeNull();
    expect(animalSlugFromPath("/zival/luna-abc123")).toBeNull();
  });
});

describe("findAnimalBySlug", () => {
  const luna = animal();
  const max = animal({ id: "horjul:max", name: "Max" });

  it("finds the animal the path names", () => {
    const slug = animalPathParts(max).animal;
    expect(findAnimalBySlug([luna, max], slug)?.id).toBe("horjul:max");
  });

  // The town and the shelter are for the reader; a shelter that moves must
  // not strand the links it already handed out.
  it("finds it from a path whose town has since changed", () => {
    const stale = `/zival/${animalPathParts(luna).animal}/maribor/staro-ime`;
    const slug = animalSlugFromPath(stale) ?? "";
    expect(findAnimalBySlug([luna, max], slug)?.id).toBe("horjul:luna");
  });

  it("finds nothing for a slug no animal answers to", () => {
    expect(findAnimalBySlug([luna, max], "luna-000000")).toBeUndefined();
  });
});
