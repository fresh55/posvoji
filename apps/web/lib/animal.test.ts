import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { animalFields } from "./animal";

const BLUR = "data:image/webp;base64,UklGRg==";

function animal(): Animal {
  return {
    id: "macja-hisa:luna",
    name: "Luna",
    species: "cat",
    status: "available",
    images: [
      {
        sourceUrl: "https://shelter.example/luna-1.jpg",
        cachedUrl: "/media/animals/luna-1.webp",
        blurDataURL: BLUR,
        rights: "cache-permitted",
      },
    ],
    shelter: {
      id: "macja-hisa",
      name: "Mačja hiša",
      city: "Ljubljana",
    },
    source: {
      providerId: "macja-hisa",
      sourceUrl: "https://www.macjahisa.si/posvojitev/muce/luna",
      fetchedAt: "2026-08-01T00:00:00.000Z",
      firstSeenAt: "2026-08-01T00:00:00.000Z",
      lastSeenAt: "2026-08-01T00:00:00.000Z",
    },
    attribution: "Foto in opis: Mačja hiša",
  } as Animal;
}

describe("animalFields", () => {
  it("drops the photos and keeps everything else", () => {
    const source = animal();
    const fields = animalFields(source);

    // Dropped, not blanked: an explicit undefined still ships as a key, and
    // the point of this is what crosses the client boundary.
    expect("images" in fields).toBe(false);
    expect(fields).toEqual({
      id: source.id,
      name: source.name,
      species: source.species,
      status: source.status,
      shelter: source.shelter,
      source: source.source,
      attribution: source.attribution,
    });
  });

  it("leaves the animal it was given alone", () => {
    const source = animal();
    animalFields(source);

    // The page still renders its gallery from these.
    expect(source.images).toHaveLength(1);
  });
});
