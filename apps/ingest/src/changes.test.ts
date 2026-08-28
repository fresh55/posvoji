import { describe, expect, it } from "vitest";
import { Dataset } from "@posvoji/schema";
import type { Animal } from "@posvoji/schema";
import { buildChangeSet } from "./changes";
import { withCachedUrls, type ImageCacheManifest } from "./cache-images";

const GENERATED_AT = "2026-08-28T06:00:00Z";
const SOURCE_URL = "https://img.si/luna.jpg";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "macja-hisa:luna",
    source: {
      providerId: "macja-hisa",
      sourceUrl: "https://example.si/luna",
      fetchedAt: "2026-08-27T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-27T06:00:00Z",
    },
    shelter: { id: "macja-hisa", name: "Zavetišče", city: "Celje" },
    species: "cat",
    name: "Luna",
    status: "available",
    images: [{ sourceUrl: SOURCE_URL, rights: "cache-permitted" }],
    attribution: "Vir: Zavetišče",
    ...overrides,
  };
}

const MANIFEST: ImageCacheManifest = {
  entries: {
    [SOURCE_URL]: {
      file: "abc0123456789def.webp",
      width: 800,
      height: 600,
      widths: [320, 480, 640, 800],
      blurDataURL: "data:image/webp;base64,AAAA",
      avif: true,
      fetchedAt: "2026-08-20T06:00:00Z",
    },
  },
};

// What the last run wrote to animals.json and this run reads back.
function asWritten(animals: Animal[]): Animal[] {
  const written = JSON.stringify(
    Dataset.parse({ generatedAt: GENERATED_AT, animals }),
  );
  return Dataset.parse(JSON.parse(written)).animals;
}

describe("buildChangeSet", () => {
  it("reports nothing for an unchanged animal with a cached image", () => {
    const cached = withCachedUrls([animal()], MANIFEST);
    const previous = asWritten(cached);
    // Exactly what the export does: parse once, diff and write the same value.
    const current = Dataset.parse({
      generatedAt: GENERATED_AT,
      animals: withCachedUrls([animal()], MANIFEST),
    }).animals;

    const changes = buildChangeSet({
      generatedAt: GENERATED_AT,
      previous,
      current,
    });

    expect(changes).toMatchObject({ added: [], updated: [], removed: [] });
  });

  it("would report it as updated if the current side skipped the schema", () => {
    // The regression this guards: cacheImages appends cachedUrl and the
    // derived fields after rights, the file carries the schema's order, and
    // JSON.stringify follows insertion order. Same data, different string.
    const previous = asWritten(withCachedUrls([animal()], MANIFEST));
    const changes = buildChangeSet({
      generatedAt: GENERATED_AT,
      previous,
      current: withCachedUrls([animal()], MANIFEST),
    });
    expect(changes.updated).toHaveLength(1);
  });

  it("ignores the timestamps every run rewrites", () => {
    const previous = asWritten([animal()]);
    const current = Dataset.parse({
      generatedAt: GENERATED_AT,
      animals: [
        animal({
          source: {
            ...animal().source,
            fetchedAt: "2026-08-28T06:00:00Z",
            lastSeenAt: "2026-08-28T06:00:00Z",
          },
        }),
      ],
    }).animals;

    expect(
      buildChangeSet({ generatedAt: GENERATED_AT, previous, current }).updated,
    ).toEqual([]);
  });

  it("still catches a real change, an arrival and a departure", () => {
    const previous = asWritten([animal(), animal({ id: "macja-hisa:gone" })]);
    const current = Dataset.parse({
      generatedAt: GENERATED_AT,
      animals: [
        animal({ status: "reserved" }),
        animal({ id: "macja-hisa:new" }),
      ],
    }).animals;

    const changes = buildChangeSet({
      generatedAt: GENERATED_AT,
      previous,
      current,
    });

    expect(changes.updated.map((c) => c.id)).toEqual(["macja-hisa:luna"]);
    expect(changes.added.map((c) => c.id)).toEqual(["macja-hisa:new"]);
    expect(changes.removed.map((c) => c.id)).toEqual(["macja-hisa:gone"]);
  });
});
