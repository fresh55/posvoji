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

    expect(projected!.images.map((image) => image.blurDataURL)).toEqual([
      undefined,
      BLUR,
      undefined,
    ]);
  });

  it("leaves every other field alone and does not mutate the input", () => {
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
    expect(projected!.images[1]).toEqual({
      sourceUrl: "https://shelter.example/luna-2.jpg",
      cachedUrl: "/media/animals/luna-2.webp",
      width: 600,
      height: 400,
      widths: [320, 480, 600],
      rights: "cache-permitted",
    });
    expect(source.images[1]!.blurDataURL).toBe(BLUR);
  });
});
