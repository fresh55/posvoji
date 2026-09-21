import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { animalsForClient } from "./dataset";
import { INITIAL_CARDS } from "@/components/grid-rendering";
import { sortAnimals } from "./sort";
import { galleryPayload } from "./client-payload";

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
    coatColors: ["black", "white"],
    coatColor: "black",
    coatLength: "short",
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
    adoptionRequirements: {
      indoorOnly: true,
      onlyPet: true,
      bondedPair: true,
      ongoingCare: false,
    },
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
  it("defers permitted secondary photos to the same versioned payload the generator writes", () => {
    const source = complete();
    source.images.push(
      { sourceUrl: "https://shelter.example/private.jpg", rights: "unknown" },
      {
        sourceUrl: "https://shelter.example/second.jpg",
        rights: "display-permitted",
      },
    );
    const client = animalsForClient([source], { deferPhotos: true })[0];
    const payload = galleryPayload(source);
    expect(client.images).toHaveLength(1);
    expect(client.images[0].blurDataURL).toBe(BLUR);
    expect(client.gallery).toEqual({ url: payload.url, count: 2 });
    expect(JSON.parse(payload.json)).toEqual([
      { src: "/media/animals/luna-1.webp" },
      { src: "https://shelter.example/second.jpg" },
    ]);
    source.images[2].sourceUrl = "https://shelter.example/replaced.jpg";
    expect(galleryPayload(source).url).not.toBe(payload.url);
  });
  it("keeps blur only on prerendered cards in default sort order without mutating the dataset", () => {
    const sources = Array.from({ length: INITIAL_CARDS + 5 }, (_, index) => ({
      ...complete(),
      id: `macja-hisa:${index.toString().padStart(3, "0")}`,
      // Reverse the intake order, and leave one date unknown, to distinguish
      // displayed order from input order and exercise the undated tail.
      intakeDate:
        index === 0
          ? undefined
          : `2022-01-${String(30 - index).padStart(2, "0")}`,
    }));
    const expectedIds = new Set(
      sortAnimals(sources)
        .slice(0, INITIAL_CARDS)
        .map(({ id }) => id),
    );
    const projected = animalsForClient(sources);
    expect(projected.map(({ id }) => id)).toEqual(sources.map(({ id }) => id));
    for (const item of projected) {
      expect("blurDataURL" in item.images[0]!).toBe(expectedIds.has(item.id));
    }
    expect(sources.every((item) => item.images[0]!.blurDataURL === BLUR)).toBe(
      true,
    );
    // A shelter page gets its own initial window, even if those animals
    // would have been below the fold in the full index.
    expect(
      animalsForClient(sources.slice(0, 3)).every(
        (item) => item.images[0]!.blurDataURL === BLUR,
      ),
    ).toBe(true);
  });
  it("ships the fields a client component reads and no others", () => {
    const source = complete();
    const [projected] = animalsForClient([source]);

    // The whole key set rather than a sample of it. A field added to the
    // schema crosses the boundary for five hundred animals the day it is
    // added, and this list is the only thing that has to be changed for it to.
    expect(Object.keys(projected!).sort()).toEqual([
      "adoptionRequirements",
      "apartmentOk",
      "approximateAgeMonths",
      "attribution",
      "birthDate",
      "breed",
      "coatColor",
      "coatColors",
      "coatLength",
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
      "specialNeeds",
      "species",
      "status",
    ]);

    // The shelter's own listing, which the dialog and the shelter block link
    // to, and none of the crawl's bookkeeping.
    expect(projected!.source).toBeUndefined();

    // Dropped, not blanked: an explicit undefined still ships as a key.
    // AnimalFacts fetches the shelter's words when a dialog opens.
    expect("shortDescription" in projected!).toBe(false);

    // Sorting needs these, so they cross whole.
    expect(projected!.intakeDate).toBe("2022-01-15");
    expect(projected!.birthDate).toBe("2021-04-01");
    expect(projected!.approximateAgeMonths).toBe(52);
    expect(projected!.adoptionRequirements).toEqual(
      source.adoptionRequirements,
    );

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
