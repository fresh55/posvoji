import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  adjacentImages,
  MAX_PHOTO_DOTS,
  permittedPhotos,
  photoAvifUrl,
  photoDotWindow,
  photoSrcSet,
  posterPhoto,
  printAspect,
  subjectPosition,
  thumbnailUrl,
} from "./animal-images";

describe("photoDotWindow", () => {
  it("draws one dot per photo while they all fit", () => {
    expect(photoDotWindow(3, 0)).toEqual({ start: 0, count: 3 });
    expect(photoDotWindow(3, 2)).toEqual({ start: 0, count: 3 });
    expect(photoDotWindow(MAX_PHOTO_DOTS, 4)).toEqual({
      start: 0,
      count: MAX_PHOTO_DOTS,
    });
  });

  it("caps a long gallery and centres the window on the active photo", () => {
    // Middle of a 14-photo gallery: two dots either side of the active one.
    expect(photoDotWindow(14, 7)).toEqual({ start: 5, count: 5 });
  });

  it("stops the window at either end instead of running off it", () => {
    // Near the start the window cannot slide left, so the active dot walks
    // across a window that stays put.
    expect(photoDotWindow(14, 0)).toEqual({ start: 0, count: 5 });
    expect(photoDotWindow(14, 1)).toEqual({ start: 0, count: 5 });
    // And the same at the far end: start never exceeds total - count, so the
    // last dot is always the last photo.
    expect(photoDotWindow(14, 13)).toEqual({ start: 9, count: 5 });
    expect(photoDotWindow(14, 12)).toEqual({ start: 9, count: 5 });
  });

  it("never returns a negative start for a gallery with no photos", () => {
    expect(photoDotWindow(0, 0)).toEqual({ start: 0, count: 0 });
  });
});

describe("thumbnailUrl", () => {
  it("derives the thumb sibling of a cached copy", () => {
    expect(thumbnailUrl("/media/animals/0123456789abcdef.webp")).toBe(
      "/media/animals/0123456789abcdef.thumb.webp",
    );
  });

  it("leaves a remote source url alone", () => {
    expect(thumbnailUrl("https://shelter.example/luna.jpg")).toBe(
      "https://shelter.example/luna.jpg",
    );
  });

  it("does not derive a thumb of a thumb", () => {
    expect(thumbnailUrl("/media/animals/0123456789abcdef.thumb.webp")).toBe(
      "/media/animals/0123456789abcdef.thumb.webp",
    );
  });
});

describe("adjacentImages", () => {
  it("returns the previous and next images with wraparound", () => {
    expect(adjacentImages(["one", "two", "three"], 0)).toEqual([
      "three",
      "two",
    ]);
  });

  it("does not return the same adjacent image twice", () => {
    expect(adjacentImages(["one", "two"], 0)).toEqual(["two"]);
    expect(adjacentImages(["one"], 0)).toEqual([]);
  });

  it("folds a two-photo gallery's neighbours by identity, not by url", () => {
    // The gallery hands this whole photos now. In a pair both neighbours are
    // the same entry, and only object identity says so.
    const photos = [{ src: "/media/animals/one.webp" }, { src: "/media/animals/two.webp" }];
    expect(adjacentImages(photos, 0)).toEqual([photos[1]]);
  });
});

describe("permittedPhotos", () => {
  it("returns every permitted image in source order", () => {
    expect(
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna-1.jpg",
          cachedUrl: "/media/animals/luna-1.webp",
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-2.jpg",
          rights: "display-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-private.jpg",
          rights: "unknown",
        },
      ] satisfies Animal["images"]).map((photo) => photo.src),
    ).toEqual([
      "/media/animals/luna-1.webp",
      "https://shelter.example/luna-2.jpg",
    ]);
  });

  it("falls back to the source while a cacheable image is not cached", () => {
    expect(
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"]).map((photo) => photo.src),
    ).toEqual(["https://shelter.example/luna.jpg"]);
  });

  // Some shelters list the same picture twice, and two sources can cache to
  // the same copy. A file is drawn once, in the place it first appears.
  it("draws a file once however many times the listing names it", () => {
    expect(
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna-1.jpg",
          cachedUrl: "/media/animals/luna.webp",
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-2.jpg",
          rights: "display-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-1-again.jpg",
          cachedUrl: "/media/animals/luna.webp",
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-2.jpg",
          rights: "display-permitted",
        },
      ] satisfies Animal["images"]).map((photo) => photo.src),
    ).toEqual([
      "/media/animals/luna.webp",
      "https://shelter.example/luna-2.jpg",
    ]);
  });

  it("carries the derived fields a surface draws with", () => {
    expect(
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          cachedUrl: "/media/animals/luna.webp",
          width: 800,
          height: 600,
          widths: [320, 480, 640, 800],
          avif: true,
          blurDataURL: "data:image/webp;base64,UklGRg==",
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"]),
    ).toStrictEqual([
      {
        src: "/media/animals/luna.webp",
        widths: [320, 480, 640, 800],
        avif: true,
        blurDataURL: "data:image/webp;base64,UklGRg==",
      },
    ]);
  });

  it("carries the subject box with the shape the crop needs", () => {
    // A 3:2 photo: `aspect` calls it 4:3 for the print, and the crop has to
    // know it is 1.5 to keep the box in a square.
    expect(
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          cachedUrl: "/media/animals/luna.webp",
          width: 900,
          height: 600,
          subject: { x: 0.18, y: 0.08, w: 0.36, h: 0.82 },
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"]),
    ).toStrictEqual([
      {
        src: "/media/animals/luna.webp",
        subject: [20, 10, 35, 80],
        ratio: 1.5,
      },
    ]);
  });

  it("leaves the intrinsic size behind", () => {
    // Nothing on a page reads it: every photo is drawn into a box the caller
    // sizes, and the ladder photoSrcSet needs is `widths` alone. Ingest keeps
    // width and height in its manifest, and they stop there.
    const [photo] = permittedPhotos([
      {
        sourceUrl: "https://shelter.example/luna.jpg",
        cachedUrl: "/media/animals/luna.webp",
        width: 800,
        height: 600,
        widths: [320, 480, 640, 800],
        rights: "cache-permitted",
      },
    ] satisfies Animal["images"]);

    expect(photo).not.toHaveProperty("width");
    expect(photo).not.toHaveProperty("height");
  });

  it("carries no key for a field ingest never derived", () => {
    // These photos are serialized into the page for the client components
    // that draw them, and React writes an undefined value out as "$undefined",
    // so an absent field has to be an absent key rather than an empty one.
    expect(
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          cachedUrl: "/media/animals/luna.webp",
          width: 800,
          height: 600,
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"]),
    ).toStrictEqual([{ src: "/media/animals/luna.webp" }]);
  });

  it("leaves a hotlinked photo with nothing but its source", () => {
    // A cache-permitted image whose cache attempt failed is served from the
    // shelter, where none of our siblings exist. Carrying the derived fields
    // across would promise a ladder that was never written.
    expect(
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://shelter.example/bine.jpg",
          rights: "display-permitted",
        },
      ] satisfies Animal["images"]),
    ).toEqual([
      { src: "https://shelter.example/luna.jpg" },
      { src: "https://shelter.example/bine.jpg" },
    ]);
  });

  it("carries the shape of a photo that is not 4:3, clamped to a print", () => {
    const shaped = (width: number, height: number) =>
      permittedPhotos([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          cachedUrl: "/media/animals/luna.webp",
          width,
          height,
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"])[0].aspect;

    // A portrait phone photo keeps its shape.
    expect(shaped(600, 800)).toBe(0.75);
    expect(shaped(800, 800)).toBe(1);
    // Wider than 4:3 is still drawn at 4:3, so 3:2 says nothing new.
    expect(shaped(900, 600)).toBeUndefined();
    // Taller than 3:4 is cropped to 3:4, which is what the value says.
    expect(shaped(300, 800)).toBe(0.75);
    expect(printAspect(0, 800)).toBeUndefined();
  });
});

describe("photoSrcSet", () => {
  it("names every rung but the last, which is the cached copy itself", () => {
    expect(
      photoSrcSet({
        src: "/media/animals/0123456789abcdef.webp",
        widths: [320, 480, 640, 800],
      }),
    ).toBe(
      "/media/animals/0123456789abcdef-320.webp 320w, " +
        "/media/animals/0123456789abcdef-480.webp 480w, " +
        "/media/animals/0123456789abcdef-640.webp 640w, " +
        "/media/animals/0123456789abcdef.webp 800w",
    );
  });

  it("follows the ladder rather than assuming the standard rungs", () => {
    // A photo the shelter published at 400px has one rung under it, and 480
    // and 640 were never written. Nothing may name them.
    expect(
      photoSrcSet({
        src: "/media/animals/small.webp",
        widths: [320, 400],
      }),
    ).toBe("/media/animals/small-320.webp 320w, /media/animals/small.webp 400w");
  });

  it("has nothing to offer without a ladder", () => {
    expect(photoSrcSet({ src: "/media/animals/luna.webp" })).toBeUndefined();
    // One rung is the cached copy on its own, which the src already says.
    expect(
      photoSrcSet({ src: "/media/animals/luna.webp", widths: [300] }),
    ).toBeUndefined();
  });

  it("leaves a photo served from the shelter alone", () => {
    expect(
      photoSrcSet({
        src: "https://shelter.example/luna.jpg",
        widths: [320, 800],
      }),
    ).toBeUndefined();
  });
});

describe("photoAvifUrl", () => {
  it("names the avif sibling of a cached copy", () => {
    expect(
      photoAvifUrl({ src: "/media/animals/luna.webp", avif: true }),
    ).toBe("/media/animals/luna.avif");
  });

  it("stays quiet where ingest derived none", () => {
    expect(photoAvifUrl({ src: "/media/animals/luna.webp" })).toBeUndefined();
    expect(
      photoAvifUrl({ src: "https://shelter.example/luna.jpg", avif: true }),
    ).toBeUndefined();
  });
});

describe("posterPhoto", () => {
  // The legal rule the printed sheet turns on. display-permitted is a
  // hotlink: the shelter let us show its file in a browser, not print it.
  it("prints our own cached copy of the lead photo", () => {
    expect(
      posterPhoto([
        {
          sourceUrl: "https://shelter.example/luna-1.jpg",
          cachedUrl: "/media/animals/luna-1.webp",
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"])?.src,
    ).toBe("/media/animals/luna-1.webp");
  });

  it("prints nothing for a photo we may only link to", () => {
    expect(
      posterPhoto([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          rights: "display-permitted",
        },
      ] satisfies Animal["images"]),
    ).toBeUndefined();
  });

  // Cacheable but not cached: permittedPhotos hands back the shelter's own
  // URL, which is the file we have no copy of and no right to print.
  it("prints nothing while a cacheable photo has not been cached", () => {
    expect(
      posterPhoto([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"]),
    ).toBeUndefined();
  });

  it("prints nothing for an animal with no images at all", () => {
    expect(posterPhoto([])).toBeUndefined();
  });

  // The lead drawable photo and no other. An animal whose first photo is a
  // hotlink gets the typographic sheet even if a later one is cached, the
  // same way the share card does (photoSourceFor in share-cards.ts).
  it("reads the lead photo and does not look past it", () => {
    expect(
      posterPhoto([
        {
          sourceUrl: "https://shelter.example/luna-1.jpg",
          rights: "display-permitted",
        },
        {
          sourceUrl: "https://shelter.example/luna-2.jpg",
          cachedUrl: "/media/animals/luna-2.webp",
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"]),
    ).toBeUndefined();
  });
});

describe("subjectPosition", () => {
  // A 1.6 photo in a square: the box shows 62% of the width.
  const wide = { subject: [15, 5, 40, 90], ratio: 1.6 } as const;

  it("centres the window on the animal", () => {
    // Subject middle at 0.35 of the width. r = 1.6, so p = (0.35 * 1.6 - 0.5)
    // / 0.6 = 0.1: the window starts 10% of the way along the overflow.
    expect(subjectPosition(wide, 1)).toBe("10% 50%");
  });

  it("stops at the edge when the animal is right beside it", () => {
    expect(subjectPosition({ subject: [0, 0, 20, 100], ratio: 1.6 }, 1)).toBe(
      "0% 50%",
    );
    expect(subjectPosition({ subject: [80, 0, 20, 100], ratio: 1.6 }, 1)).toBe(
      "100% 50%",
    );
  });

  it("is the centre for an animal in the middle", () => {
    expect(subjectPosition({ subject: [30, 10, 40, 80], ratio: 1.6 }, 1)).toBe(
      "50% 50%",
    );
  });

  it("moves along the other axis for a portrait", () => {
    // 3:4 in a square: the box shows 75% of the height. Animal in the top
    // half, its middle at 0.3: p = (0.3 * 4/3 - 0.5) / (1/3) = -0.3, so the
    // window starts at the top.
    expect(subjectPosition({ subject: [10, 5, 80, 50], ratio: 0.75 }, 1)).toBe(
      "50% 0%",
    );
    // Its middle at 0.55: p = (0.55 * 4/3 - 0.5) / (1/3) = 0.7.
    expect(subjectPosition({ subject: [10, 35, 80, 40], ratio: 0.75 }, 1)).toBe(
      "50% 70%",
    );
  });

  it("keeps the head of an animal taller than the window", () => {
    // The box is 90% of the height and the window 75%: centred, the window
    // would start at 12.5% and cut the ears. It starts 5% above the box, at
    // the top of the picture.
    expect(subjectPosition({ subject: [10, 5, 80, 90], ratio: 0.75 }, 1)).toBe(
      "50% 0%",
    );
    // The same for a box starting lower: 5% above it is 15% down, p = 0.6.
    expect(subjectPosition({ subject: [10, 20, 80, 80], ratio: 0.75 }, 1)).toBe(
      "50% 60%",
    );
  });

  it("gives the ears air over a box the window only just holds", () => {
    // 70% tall in a 75% window, starting 20% down. Centred, the window would
    // start at 17.5% and leave the ear tips 2.5% of room, which the rounding
    // to fives can take away; it starts at 15% instead, p = 0.6, and the
    // feet lose the 5%.
    expect(subjectPosition({ subject: [10, 20, 80, 70], ratio: 0.75 }, 1)).toBe(
      "50% 60%",
    );
    // A box that starts low is centred as far as the picture allows.
    expect(subjectPosition({ subject: [10, 30, 80, 70], ratio: 0.75 }, 1)).toBe(
      "50% 100%",
    );
  });

  it("answers for the frame it is asked about", () => {
    // The same 1.6 photo in the fan's 4:3 print is only 1.2 times wider than
    // its box, so the same animal needs less of a shift.
    expect(subjectPosition(wide, 4 / 3)).toBe("0% 50%");
    expect(
      subjectPosition({ subject: [50, 10, 40, 80], ratio: 1.6 }, 4 / 3),
    ).toBe("100% 50%");
  });

  it("says nothing for a photo the frame does not cut", () => {
    expect(
      subjectPosition({ subject: [10, 10, 50, 50], ratio: 1 }, 1),
    ).toBeUndefined();
    expect(
      subjectPosition({ subject: [10, 10, 50, 50], ratio: 1.33 }, 4 / 3),
    ).toBeUndefined();
  });

  it("says nothing without a box", () => {
    expect(subjectPosition({ ratio: 1.6 }, 1)).toBeUndefined();
    expect(subjectPosition({}, 1)).toBeUndefined();
  });
});
