import { describe, expect, it } from "vitest";
import { ProviderPolicy } from "@posvoji/schema";
import type { Animal, AnimalImage } from "@posvoji/schema";
import {
  applyPublicationPolicy,
  excerptDescription,
  EXCERPT_MAX_CHARS,
} from "./publication-policy";

const PROVIDER = "macja-hisa";
const ATTRIBUTION = "Vir: Zavetišče Mačja hiša";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: `${PROVIDER}:luna`,
    source: {
      providerId: PROVIDER,
      sourceUrl: "https://example.si/muce/luna",
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: PROVIDER, name: "Zavetišče", city: "Celje" },
    species: "cat",
    status: "available",
    images: [],
    attribution: ATTRIBUTION,
    ...overrides,
  };
}

function policy(overrides: Record<string, unknown> = {}): ProviderPolicy {
  return ProviderPolicy.parse({
    providerId: PROVIDER,
    source: "https://example.si/muce",
    enabled: true,
    ingestion: "scrape",
    images: "cache-permitted",
    descriptions: "full-permitted",
    permission: { status: "granted", date: "2026-08-18" },
    attribution: ATTRIBUTION,
    crawl: { intervalHours: 12 },
    ...overrides,
  });
}

function policies(overrides: Record<string, unknown> = {}) {
  return new Map([[PROVIDER, policy(overrides)]]);
}

// One image with a full run of caching grafted on, the shape a carried-over
// record holds.
const cached: AnimalImage = {
  sourceUrl: "https://example.si/media/luna.jpg",
  cachedUrl: "/media/animals/abc123.webp",
  width: 1200,
  height: 900,
  widths: [400, 800, 1200],
  avif: true,
  blurDataURL: "data:image/webp;base64,AAAA",
  rights: "cache-permitted",
};

describe("excerptDescription", () => {
  it("returns a text already inside the limit untouched", () => {
    const short = "Luna je mirna muca, ki išče miren dom.";
    expect(excerptDescription(short)).toBe(short);
  });

  it("cuts at the last whole sentence that fits", () => {
    const sentence = "Luna je mirna muca, ki isce miren dom. ";
    const text = sentence.repeat(10);

    // Five sentences fit inside the limit, the sixth does not.
    expect(excerptDescription(text)).toBe(`${sentence.repeat(5).trimEnd()}…`);
  });

  it("cuts at a word boundary when no sentence fits", () => {
    const text = `${"beseda ".repeat(60)}konec.`;
    const excerpt = excerptDescription(text);

    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS + 1);
    expect(excerpt.endsWith("beseda…")).toBe(true);
  });

  it("ignores a sentence boundary too near the start to be an excerpt", () => {
    // "Dr." is a sentence end as far as a regex is concerned, and cutting
    // there would publish two characters instead of an excerpt.
    const text = `Dr. ${"beseda ".repeat(60)}konec.`;
    expect(excerptDescription(text)).not.toBe("Dr.…");
  });

  it("appends one ellipsis and no more", () => {
    const text = `Luna je mirna muca… ${"x".repeat(EXCERPT_MAX_CHARS * 2)}`;
    const excerpt = excerptDescription(text);

    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.endsWith("……")).toBe(false);
  });

  it("is idempotent on its own output", () => {
    const once = excerptDescription("a ".repeat(400));
    expect(excerptDescription(once)).toBe(once);
  });
});

describe("applyPublicationPolicy", () => {
  it("leaves a record its policy already permits alone", () => {
    const luna = animal({ shortDescription: "Mirna muca." });
    const result = applyPublicationPolicy([luna], policies());

    expect(result.animals[0]).toBe(luna);
    expect(result.dropped).toEqual([]);
    expect(result.adjusted).toEqual([]);
  });

  it("drops a carried-over record under a newly excluded path", () => {
    const privat = animal({
      id: `${PROVIDER}:zasebno`,
      source: {
        ...animal().source,
        sourceUrl: "https://example.si/privat-oddaja/muca",
      },
    });
    const result = applyPublicationPolicy(
      [animal(), privat],
      policies({
        crawl: { intervalHours: 12, excludePaths: ["/privat-oddaja/"] },
      }),
    );

    expect(result.animals).toHaveLength(1);
    expect(result.animals[0]?.id).toBe(`${PROVIDER}:luna`);
    expect(result.dropped).toEqual([
      {
        providerId: PROVIDER,
        count: 1,
        reason:
          'under "/privat-oddaja/", which policy.yaml excludes from the crawl',
      },
    ]);
  });

  it("catches an excluded path a link percent-encoded", () => {
    const privat = animal({
      source: {
        ...animal().source,
        sourceUrl: "https://example.si/privat%2Doddaja/muca",
      },
    });
    const result = applyPublicationPolicy(
      [privat],
      policies({
        crawl: { intervalHours: 12, excludePaths: ["/privat-oddaja/"] },
      }),
    );

    expect(result.animals).toEqual([]);
  });

  it("empties the images of a provider whose grant is now none", () => {
    const luna = animal({ images: [cached] });
    const result = applyPublicationPolicy([luna], policies({ images: "none" }));

    expect(result.animals[0]?.images).toEqual([]);
    expect(result.adjusted).toEqual([
      { providerId: PROVIDER, field: "images", applied: "none", count: 1 },
    ]);
  });

  it("takes the cached copy off a provider narrowed to remote", () => {
    const luna = animal({ images: [cached] });
    const result = applyPublicationPolicy(
      [luna],
      policies({ images: "remote" }),
    );

    expect(result.animals[0]?.images).toEqual([
      { sourceUrl: cached.sourceUrl, rights: "display-permitted" },
    ]);
    expect(result.adjusted[0]?.applied).toBe("remote");
  });

  it("never upgrades image rights", () => {
    const luna = animal({
      images: [{ sourceUrl: cached.sourceUrl, rights: "display-permitted" }],
    });
    const result = applyPublicationPolicy(
      [luna],
      policies({ images: "cache-permitted" }),
    );

    expect(result.animals[0]).toBe(luna);
    expect(result.animals[0]?.images[0]?.rights).toBe("display-permitted");
  });

  it("drops a description a facts-only policy no longer permits", () => {
    const luna = animal({ shortDescription: "Mirna muca." });
    const result = applyPublicationPolicy(
      [luna],
      policies({ descriptions: "facts-only" }),
    );

    const published = result.animals[0];
    expect(published?.shortDescription).toBeUndefined();
    expect(Object.hasOwn(published as object, "shortDescription")).toBe(false);
    expect(result.adjusted).toEqual([
      {
        providerId: PROVIDER,
        field: "descriptions",
        applied: "facts-only",
        count: 1,
      },
    ]);
  });

  it("excerpts a description an excerpt-permitted policy allows quoting", () => {
    const luna = animal({
      shortDescription: `Luna je mirna muca. ${"x".repeat(400)}`,
    });
    const result = applyPublicationPolicy(
      [luna],
      policies({ descriptions: "excerpt-permitted" }),
    );

    expect(result.animals[0]?.shortDescription).toBe("Luna je mirna muca.…");
    expect(result.adjusted[0]?.applied).toBe("excerpt-permitted");
  });

  it("leaves a short description an excerpt-permitted policy whole", () => {
    const luna = animal({ shortDescription: "Luna je mirna muca." });
    const result = applyPublicationPolicy(
      [luna],
      policies({ descriptions: "excerpt-permitted" }),
    );

    expect(result.animals[0]).toBe(luna);
    expect(result.adjusted).toEqual([]);
  });

  it("re-applies the attribution the policy carries now", () => {
    const luna = animal({ attribution: "Vir: staro besedilo" });
    const result = applyPublicationPolicy([luna], policies());

    expect(result.animals[0]?.attribution).toBe(ATTRIBUTION);
    expect(result.adjusted).toEqual([
      {
        providerId: PROVIDER,
        field: "attribution",
        applied: ATTRIBUTION,
        count: 1,
      },
    ]);
  });

  it("counts every narrowing of a provider once per field", () => {
    const animals = [
      animal({ id: `${PROVIDER}:a`, images: [cached] }),
      animal({
        id: `${PROVIDER}:b`,
        images: [cached],
        shortDescription: "Mirna muca.",
      }),
    ];
    const result = applyPublicationPolicy(
      animals,
      policies({ images: "none", descriptions: "facts-only" }),
    );

    expect(result.adjusted).toEqual([
      {
        providerId: PROVIDER,
        field: "descriptions",
        applied: "facts-only",
        count: 1,
      },
      { providerId: PROVIDER, field: "images", applied: "none", count: 2 },
    ]);
  });

  it("leaves a provider with no policy to retainableAnimals", () => {
    const orphan = animal({ id: "gone:luna" });
    const result = applyPublicationPolicy([orphan], new Map());

    expect(result.animals[0]).toBe(orphan);
    expect(result.dropped).toEqual([]);
    expect(result.adjusted).toEqual([]);
  });
});
