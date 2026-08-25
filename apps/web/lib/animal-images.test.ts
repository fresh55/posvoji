import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import {
  adjacentImageUrls,
  MAX_PHOTO_DOTS,
  permittedImageUrls,
  photoDotWindow,
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

describe("permittedImageUrls", () => {
  it("returns every permitted image in source order", () => {
    expect(
      permittedImageUrls([
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
      ] satisfies Animal["images"]),
    ).toEqual([
      "/media/animals/luna-1.webp",
      "https://shelter.example/luna-2.jpg",
    ]);
  });

  it("falls back to the source while a cacheable image is not cached", () => {
    expect(
      permittedImageUrls([
        {
          sourceUrl: "https://shelter.example/luna.jpg",
          rights: "cache-permitted",
        },
      ] satisfies Animal["images"]),
    ).toEqual(["https://shelter.example/luna.jpg"]);
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

describe("adjacentImageUrls", () => {
  it("returns the previous and next images with wraparound", () => {
    expect(adjacentImageUrls(["one", "two", "three"], 0)).toEqual([
      "three",
      "two",
    ]);
  });

  it("does not return the same adjacent image twice", () => {
    expect(adjacentImageUrls(["one", "two"], 0)).toEqual(["two"]);
    expect(adjacentImageUrls(["one"], 0)).toEqual([]);
  });
});
