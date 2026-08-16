import { describe, expect, it } from "vitest";
import type { Animal } from "@posvoji/schema";
import { adjacentImageUrls, permittedImageUrls } from "./animal-images";

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
