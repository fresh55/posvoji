import { describe, expect, it } from "vitest";
import { Dataset } from "@posvoji/schema";
import type { Animal } from "@posvoji/schema";
import { buildChangeSet } from "./changes";
import { withCachedUrls, type ImageCacheManifest } from "./cache-images";
import { reuseAnimal } from "./incremental-crawl";

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

  it("reports nothing for an animal whose detail page was not re-read", () => {
    // The whole point of the incremental crawl: an animal the run skipped is
    // republished from the previous dataset with a new lastSeenAt, and that
    // must not read as an update. The image fields go the same round trip they
    // would on a crawled animal: reuseAnimal takes off what the last run's
    // cache grafted, and cacheImages grafts it back from the manifest.
    const previous = asWritten(withCachedUrls([animal()], MANIFEST));
    const reused = reuseAnimal(previous[0]!, "2026-08-28T06:00:00.000Z");
    const current = Dataset.parse({
      generatedAt: GENERATED_AT,
      animals: withCachedUrls([reused], MANIFEST),
    }).animals;

    expect(current[0]!.source.lastSeenAt).toBe("2026-08-28T06:00:00.000Z");
    expect(current[0]!.source.fetchedAt).toBe(previous[0]!.source.fetchedAt);
    expect(
      buildChangeSet({ generatedAt: GENERATED_AT, previous, current }),
    ).toMatchObject({ added: [], updated: [], removed: [] });
  });

  it("reports a skipped animal as updated when its cached photo went away", () => {
    // The reason reuseAnimal strips the cache fields rather than republishing
    // them: a source photo that has since 404'd leaves the manifest, the sweep
    // deletes the file, and the record must stop pointing at it.
    const previous = asWritten(withCachedUrls([animal()], MANIFEST));
    const reused = reuseAnimal(previous[0]!, "2026-08-28T06:00:00.000Z");
    const current = Dataset.parse({
      generatedAt: GENERATED_AT,
      animals: withCachedUrls([reused], { entries: {} }),
    }).animals;

    expect(current[0]!.images[0]!.cachedUrl).toBeUndefined();
    expect(
      buildChangeSet({ generatedAt: GENERATED_AT, previous, current }).updated,
    ).toHaveLength(1);
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
