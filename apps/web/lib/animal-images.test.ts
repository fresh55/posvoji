import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  adjacentImages,
  MAX_PHOTO_DOTS,
  permittedPhotos,
  photoAvifUrl,
  photoDotWindow,
  photoSrcSet,
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

  it("carries the derived fields of a cached copy", () => {
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
    ).toEqual([
      {
        src: "/media/animals/luna.webp",
        width: 800,
        height: 600,
        widths: [320, 480, 640, 800],
        avif: true,
        blurDataURL: "data:image/webp;base64,UklGRg==",
      },
    ]);
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
    ).toStrictEqual([
      { src: "/media/animals/luna.webp", width: 800, height: 600 },
    ]);
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
