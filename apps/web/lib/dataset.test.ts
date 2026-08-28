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

describe("animalsForClient", () => {
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
    expect(projected!.images[0]).toEqual({
      src: "/media/animals/luna-1.webp",
      width: 600,
      height: 400,
      widths: [320, 480, 600],
      avif: true,
      blurDataURL: BLUR,
    });
    // Strict, because a key standing for an absent field is not free: React
    // ships an undefined value as "$undefined".
    expect(projected!.images[1]).toStrictEqual({
      src: "/media/animals/luna-2.webp",
      width: 600,
      height: 400,
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
