import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { animalPath, animalPathParts } from "@/lib/animal-path";
import { animalDescription, animalTitle } from "@/lib/animal-share";

const REFERENCE = new Date("2026-08-19T06:00:00Z");

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "muri:16836",
    source: {
      providerId: "muri",
      sourceUrl: "https://example.test/animals/16836",
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: "muri", name: "Zavod Muri", city: "Maribor" },
    species: "dog",
    sex: "female",
    status: "available",
    birthDate: "2022-08-10",
    images: [],
    attribution: "Vir: Zavod Muri",
    name: "Čoko-Lina",
    ...overrides,
  };
}

describe("animalPath", () => {
  it("reads as an address, in each language", () => {
    const parts = animalPathParts(animal());
    expect(parts.animal).toMatch(/^coko-lina-[0-9a-f]{6}$/);
    expect(animalPath(animal(), "sl")).toBe(
      `/zival/${parts.animal}/maribor/muri`,
    );
    expect(animalPath(animal(), "en")).toBe(
      `/en/animal/${parts.animal}/maribor/muri`,
    );
  });

  it("keeps two animals of the same name apart", () => {
    const one = animalPathParts(animal({ id: "muri:1" }));
    const two = animalPathParts(animal({ id: "muri:2" }));
    expect(one.animal).not.toBe(two.animal);
  });
});

describe("animalTitle", () => {
  it("names the animal, what it is, how old and whose it is", () => {
    expect(animalTitle(animal(), "sl", REFERENCE)).toBe(
      "Čoko-Lina · Pes · 4 leta · Zavod Muri",
    );
    expect(animalTitle(animal(), "en", REFERENCE)).toBe(
      "Čoko-Lina · Dog · 4 years · Zavod Muri",
    );
  });

  it("skips what the dataset does not know", () => {
    const unknown = animal({ name: undefined, birthDate: undefined });
    expect(animalTitle(unknown, "sl", REFERENCE)).toBe("Pes · Zavod Muri");
  });
});

describe("animalDescription", () => {
  it("is built from the fields, not from the shelter's own text", () => {
    const described = animal({
      shortDescription: "Čoko-Lina je najlepša psička na svetu.",
    });
    const description = animalDescription(described, "sl", REFERENCE);

    expect(description).toContain("Čoko-Lina · Pes · samica · 4 leta.");
    expect(description).toContain("Zavod Muri, Maribor");
    expect(description).not.toContain("najlepša");
  });

  it("says so when the animal is no longer waiting", () => {
    const adopted = animal({ status: "adopted" });
    expect(animalDescription(adopted, "sl", REFERENCE)).toContain(
      "Status: posvojeno.",
    );
    expect(animalDescription(adopted, "en", REFERENCE)).toContain(
      "Status: adopted.",
    );
  });

  it("still reads as a sentence for an unnamed animal", () => {
    const unnamed = animal({ name: undefined });
    expect(animalDescription(unnamed, "en", REFERENCE)).toBe(
      "Dog · female · 4 years. Waiting for a home at Zavod Muri, Maribor. " +
        "Details and the shelter's own listing on Posvoji.si.",
    );
  });
});
