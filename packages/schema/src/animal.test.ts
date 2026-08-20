import { describe, expect, it } from "vitest";
import { Animal } from "./animal";

const validAnimal = {
  id: "macja-hisa:luna",
  source: {
    providerId: "macja-hisa",
    sourceAnimalId: "luna",
    sourceUrl: "https://www.macjahisa.si/posvojitev/muce/luna",
    fetchedAt: "2026-08-15T06:00:00Z",
    firstSeenAt: "2026-08-01T06:00:00Z",
    lastSeenAt: "2026-08-15T06:00:00Z",
  },
  shelter: {
    id: "macja-hisa",
    name: "Zavetišče Mačja hiša",
    city: "Celje",
  },
  name: "Luna",
  species: "cat",
  sex: "female",
  approximateAgeMonths: 24,
  status: "available",
  medical: {
    vaccinated: true,
    neutered: true,
    microchipped: true,
  },
  images: [],
  attribution: "Vir: Zavetišče Mačja hiša",
};

describe("Animal", () => {
  it("accepts a valid animal", () => {
    expect(Animal.parse(validAnimal)).toMatchObject({ name: "Luna" });
  });

  it("rejects unknown fields such as a microchip number", () => {
    const result = Animal.safeParse({
      ...validAnimal,
      microchipNumber: "705000000000000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects personal-data-shaped fields", () => {
    const result = Animal.safeParse({
      ...validAnimal,
      ownerPhone: "041 000 000",
    });
    expect(result.success).toBe(false);
  });

  it("requires attribution", () => {
    const { attribution: _attribution, ...withoutAttribution } = validAnimal;
    expect(Animal.safeParse(withoutAttribution).success).toBe(false);
  });

  it("accepts a root-relative cachedUrl from the image cache", () => {
    const result = Animal.safeParse({
      ...validAnimal,
      images: [
        {
          sourceUrl: "https://www.macjahisa.si/media/luna.jpg",
          cachedUrl: "/media/animals/0123456789abcdef.webp",
          rights: "cache-permitted",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a goodWith block with a partial answer", () => {
    const result = Animal.safeParse({
      ...validAnimal,
      goodWith: { kids: "yes", dogs: "unknown" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an animal without goodWith", () => {
    expect(Animal.safeParse(validAnimal).success).toBe(true);
  });

  it("rejects a goodWith value outside yes/no/unknown", () => {
    const result = Animal.safeParse({
      ...validAnimal,
      goodWith: { kids: "maybe" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown group inside goodWith", () => {
    const result = Animal.safeParse({
      ...validAnimal,
      goodWith: { birds: "yes" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a cachedUrl that is neither a URL nor root-relative", () => {
    const result = Animal.safeParse({
      ...validAnimal,
      images: [
        {
          sourceUrl: "https://www.macjahisa.si/media/luna.jpg",
          cachedUrl: "media/animals/luna.webp",
          rights: "cache-permitted",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts every apartmentOk answer", () => {
    for (const answer of ["yes", "no", "unknown"]) {
      const result = Animal.safeParse({ ...validAnimal, apartmentOk: answer });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an apartmentOk value outside yes/no/unknown", () => {
    const result = Animal.safeParse({ ...validAnimal, apartmentOk: "maybe" });
    expect(result.success).toBe(false);
  });

  it("accepts a specialNeeds flag", () => {
    expect(
      Animal.safeParse({ ...validAnimal, specialNeeds: true }).success,
    ).toBe(true);
    expect(
      Animal.safeParse({ ...validAnimal, specialNeeds: false }).success,
    ).toBe(true);
  });

  it("rejects a specialNeeds value that is not a boolean", () => {
    const result = Animal.safeParse({ ...validAnimal, specialNeeds: "yes" });
    expect(result.success).toBe(false);
  });

  it("accepts an animal with a calm energy level", () => {
    const result = Animal.safeParse({ ...validAnimal, energy: "calm" });
    expect(result.success).toBe(true);
  });

  it("rejects an energy level outside calm/balanced/lively", () => {
    const result = Animal.safeParse({ ...validAnimal, energy: "hyper" });
    expect(result.success).toBe(false);
  });
});
