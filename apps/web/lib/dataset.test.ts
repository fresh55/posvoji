import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { animalsForClient } from "./dataset";

const BLUR = "data:image/webp;base64,UklGRg==";

function animal(images: Animal["images"]): Animal {
  return {
    id: "macja-hisa:luna",
    species: "cat",
    status: "available",
    images,
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
  } as Animal;
}

// Every field the schema allows, so the key sets below are read off a
// projection that had the chance to ship all of them.
function complete(): Animal {
  return {
    id: "macja-hisa:luna",
    source: {
      providerId: "macja-hisa",
      sourceAnimalId: "luna-42",
      sourceUrl: "https://www.macjahisa.si/posvojitev/muce/luna",
      fetchedAt: "2026-08-01T00:00:00.000Z",
      firstSeenAt: "2026-07-02T00:00:00.000Z",
      lastSeenAt: "2026-08-01T00:00:00.000Z",
    },
    shelter: {
      id: "macja-hisa",
      name: "Mačja hiša",
      city: "Ljubljana",
    },
    name: "Luna",
    species: "cat",
    sex: "female",
    breed: "domača kratkodlaka",
    birthDate: "2021-04-01",
    approximateAgeMonths: 52,
    size: "small",
    energy: "calm",
    status: "available",
    intakeDate: "2022-01-15",
    foundDate: "2022-01-10",
    originMunicipality: "Ljubljana",
    medical: {
      vaccinated: true,
      neutered: true,
      microchipped: true,
      fiv: "negative",
      felv: "negative",
    },
    goodWith: { kids: "yes", dogs: "unknown", cats: "yes" },
    apartmentOk: "yes",
    specialNeeds: false,
    images: [
      {
        sourceUrl: "https://shelter.example/luna-1.jpg",
        cachedUrl: "/media/animals/luna-1.webp",
        blurDataURL: BLUR,
        rights: "cache-permitted",
      },
    ],
    shortDescription: "Luna je mirna muca.",
    attribution: "Foto in opis: Mačja hiša",
  };
}

describe("animalsForClient", () => {
  it("ships the fields a client component reads and no others", () => {
    const source = complete();
    const [projected] = animalsForClient([source]);

    // The whole key set rather than a sample of it. A field added to the
    // schema crosses the boundary for five hundred animals the day it is
    // added, and this list is the only thing that has to be changed for it to.
    expect(Object.keys(projected!).sort()).toEqual([
      "apartmentOk",
      "approximateAgeMonths",
      "attribution",
      "birthDate",
      "breed",
      "energy",
      "foundDate",
      "goodWith",
      "id",
      "images",
      "intakeDate",
      "medical",
      "name",
      "originMunicipality",
      "sex",
      "shelter",
      "size",
      "source",
      "specialNeeds",
      "species",
      "status",
    ]);

    // The shelter's own listing, which the dialog and the shelter block link
    // to, and none of the crawl's bookkeeping.
    expect(Object.keys(projected!.source)).toEqual(["sourceUrl"]);
    expect(projected!.source.sourceUrl).toBe(source.source.sourceUrl);

    // Dropped, not blanked: an explicit undefined still ships as a key.
    // AnimalFacts fetches the shelter's words when a dialog opens.
    expect("shortDescription" in projected!).toBe(false);

    // Sorting needs these, so they cross whole.
    expect(projected!.intakeDate).toBe("2022-01-15");
    expect(projected!.birthDate).toBe("2021-04-01");
    expect(projected!.approximateAgeMonths).toBe(52);

    // The dataset animal is left as ingest wrote it. app/sitemap.ts still
    // reads lastSeenAt off one of these on the server.
    expect(source.source.lastSeenAt).toBe("2026-08-01T00:00:00.000Z");
    expect(source.shortDescription).toBe("Luna je mirna muca.");
  });

  it("adds no key for a field the animal does not have", () => {
    const bare: Animal = {
      id: "macja-hisa:tine",
      source: {
        providerId: "macja-hisa",
        sourceUrl: "https://www.macjahisa.si/posvojitev/muce/tine",
        fetchedAt: "2026-08-01T00:00:00.000Z",
        firstSeenAt: "2026-08-01T00:00:00.000Z",
        lastSeenAt: "2026-08-01T00:00:00.000Z",
      },
      shelter: { id: "macja-hisa", name: "Mačja hiša", city: "Ljubljana" },
      species: "cat",
      status: "available",
      images: [],
      attribution: "Foto in opis: Mačja hiša",
    };
    const [projected] = animalsForClient([bare]);

    // Naming the optional fields one by one to build the projection would put
    // every one of them back as a key standing for nothing, which React ships
    // as "$undefined". Spreading what the animal has is what keeps them off.
    expect(Object.keys(projected!).sort()).toEqual([
      "attribution",
      "id",
      "images",
      "shelter",
      "source",
      "species",
      "status",
    ]);
  });

  it("keeps the placeholder on the photo a card and a dialog open on", () => {
    const [projected] = animalsForClient([
      animal([
        {
          sourceUrl: "https://shelter.example/luna-1.jpg",
          cachedUrl: "/media/animals/luna-1.webp",
          blurDataURL: BLUR,
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-2.jpg",
          cachedUrl: "/media/animals/luna-2.webp",
          blurDataURL: BLUR,
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-3.jpg",
          cachedUrl: "/media/animals/luna-3.webp",
          blurDataURL: BLUR,
          rights: "cache-permitted",
        },
      ]),
    ]);

    expect(projected!.images.map((image) => image.blurDataURL)).toEqual([
      BLUR,
      undefined,
      undefined,
    ]);
    // Dropped, not blanked: an explicit undefined still ships as a key.
    expect("blurDataURL" in projected!.images[1]!).toBe(false);
  });

  it("leads with the first drawable photo, not with images[0]", () => {
    const [projected] = animalsForClient([
      animal([
        {
          sourceUrl: "https://shelter.example/luna-private.jpg",
          blurDataURL: BLUR,
          rights: "unknown",
        },
        {
          sourceUrl: "https://shelter.example/luna-2.jpg",
          cachedUrl: "/media/animals/luna-2.webp",
          blurDataURL: BLUR,
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-3.jpg",
          cachedUrl: "/media/animals/luna-3.webp",
          blurDataURL: BLUR,
          rights: "cache-permitted",
        },
      ]),
    ]);

    // The photo nobody may draw is gone, so the one after it both leads the
    // list and keeps the placeholder.
    expect(projected!.images.map((image) => image.src)).toEqual([
      "/media/animals/luna-2.webp",
      "/media/animals/luna-3.webp",
    ]);
    expect(projected!.images.map((image) => image.blurDataURL)).toEqual([
      BLUR,
      undefined,
    ]);
  });

  it("ships the resolved photo and nothing the server used to resolve it", () => {
    const source = animal([
      {
        sourceUrl: "https://shelter.example/luna-1.jpg",
        cachedUrl: "/media/animals/luna-1.webp",
        width: 600,
        height: 400,
        widths: [320, 480, 600],
        avif: true,
        blurDataURL: BLUR,
        rights: "cache-permitted",
      },
      {
        sourceUrl: "https://shelter.example/luna-2.jpg",
        cachedUrl: "/media/animals/luna-2.webp",
        width: 600,
        height: 400,
        widths: [320, 480, 600],
        blurDataURL: BLUR,
        rights: "cache-permitted",
      },
    ]);
    const [projected] = animalsForClient([source]);

    expect(projected!.id).toBe(source.id);
    // What crosses the boundary is the answer, not the question: no rights, no
    // sourceUrl behind a cached copy, and no cachedUrl beside the src it is.
    expect(projected!.images[0]).toStrictEqual({
      src: "/media/animals/luna-1.webp",
      widths: [320, 480, 600],
      avif: true,
      blurDataURL: BLUR,
    });
    // Strict, because a key standing for an absent field is not free: React
    // ships an undefined value as "$undefined". The intrinsic width and height
    // stay off the wire for the same reason: no surface draws with them.
    expect(projected!.images[1]).toStrictEqual({
      src: "/media/animals/luna-2.webp",
      widths: [320, 480, 600],
    });
    expect(source.images[1]!.blurDataURL).toBe(BLUR);
  });

  it("leaves a hotlinked photo on the shelter's own file", () => {
    const [projected] = animalsForClient([
      animal([
        // Cacheable, but the cache never produced a copy, so the derived
        // fields describe nothing and the shelter's file is what is drawn.
        {
          sourceUrl: "https://shelter.example/luna-1.jpg",
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-2.jpg",
          rights: "display-permitted",
        },
      ]),
    ]);

    expect(projected!.images).toEqual([
      { src: "https://shelter.example/luna-1.jpg" },
      { src: "https://shelter.example/luna-2.jpg" },
    ]);
  });
});
