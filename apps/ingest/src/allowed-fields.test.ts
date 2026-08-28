import { describe, expect, it } from "vitest";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import {
  ANIMAL_FIELDS,
  STRUCTURAL_FIELDS,
  applyAllowedFields,
} from "./allowed-fields";

const PROVIDER_ID = "meli";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: `${PROVIDER_ID}:1`,
    source: {
      providerId: PROVIDER_ID,
      sourceUrl: "https://www.meli-center.si/iscejo-dom/luna/",
      fetchedAt: "2026-08-28T06:00:00Z",
      firstSeenAt: "2026-08-28T06:00:00Z",
      lastSeenAt: "2026-08-28T06:00:00Z",
    },
    shelter: { id: PROVIDER_ID, name: "Meli Center Repče", city: "Trebnje" },
    name: "Luna",
    species: "dog",
    status: "available",
    images: [],
    attribution: "Vir: Meli Center Repče",
    ...overrides,
  };
}

function policies(
  allowedFields: string[] | undefined,
): Map<string, ProviderPolicy> {
  const policy = ProviderPolicy.parse({
    providerId: PROVIDER_ID,
    source: "https://www.meli-center.si/iscejo-dom/",
    enabled: true,
    ingestion: "scrape",
    images: "cache-permitted",
    descriptions: "full-permitted",
    permission: { status: "granted", date: "2026-08-19" },
    ...(allowedFields ? { allowedFields } : {}),
    attribution: "Vir: Meli Center Repče",
    crawl: { intervalHours: 12 },
  });
  return new Map([[PROVIDER_ID, policy]]);
}

describe("ANIMAL_FIELDS", () => {
  it("is read off the Animal schema", () => {
    expect(ANIMAL_FIELDS.has("shortDescription")).toBe(true);
    expect(ANIMAL_FIELDS.has("goodWith")).toBe(true);
    expect(ANIMAL_FIELDS.has("microchipNumber")).toBe(false);
  });

  it("names every structural field", () => {
    for (const field of STRUCTURAL_FIELDS) {
      expect(ANIMAL_FIELDS.has(field)).toBe(true);
    }
  });
});

describe("applyAllowedFields", () => {
  it("leaves a provider that declares no allowedFields alone", () => {
    const before = animal({ breed: "mešanec", shortDescription: "Luna" });

    const { animals, stripped } = applyAllowedFields(
      [before],
      policies(undefined),
    );

    expect(animals[0]).toBe(before);
    expect(stripped).toEqual([]);
  });

  it("keeps a listed field and drops an unlisted one", () => {
    const { animals, stripped } = applyAllowedFields(
      [animal({ breed: "mešanec", shortDescription: "Luna išče dom." })],
      policies(["name", "shortDescription"]),
    );

    const result = animals[0]!;
    expect(result.shortDescription).toBe("Luna išče dom.");
    // The key goes, rather than being set to undefined, so the animal
    // serializes like one that never carried a breed.
    expect("breed" in result).toBe(false);
    expect(stripped).toEqual([{ providerId: PROVIDER_ID, field: "breed", count: 1 }]);
  });

  it("never strips a structural field a policy left out", () => {
    const before = animal();

    const { animals, stripped } = applyAllowedFields(
      [before],
      policies(["name"]),
    );

    // Nothing but the structural fields is set, so the animal comes back
    // untouched rather than rebuilt.
    expect(animals[0]).toBe(before);
    expect(stripped).toEqual([]);
    expect(Animal.safeParse(animals[0]).success).toBe(true);
  });

  it("empties images rather than dropping the key when images is unlisted", () => {
    const { animals, stripped } = applyAllowedFields(
      [
        animal({
          images: [
            {
              sourceUrl: "https://www.meli-center.si/wp-content/uploads/l.jpg",
              rights: "cache-permitted",
            },
          ],
        }),
      ],
      policies(["name"]),
    );

    expect(animals[0]!.images).toEqual([]);
    // Still a valid Animal: images is required by the schema.
    expect(Animal.safeParse(animals[0]).success).toBe(true);
    expect(stripped).toEqual([
      { providerId: PROVIDER_ID, field: "images", count: 1 },
    ]);
  });

  it("does not report an already-empty images as stripped", () => {
    const { stripped } = applyAllowedFields([animal()], policies(["name"]));

    expect(stripped).toEqual([]);
  });

  it("counts one entry per provider and field, not per animal", () => {
    const { stripped } = applyAllowedFields(
      [
        animal({ id: "meli:1", breed: "mešanec", size: "small" }),
        animal({ id: "meli:2", breed: "labrador" }),
        animal({ id: "meli:3" }),
      ],
      policies(["name"]),
    );

    expect(stripped).toEqual([
      { providerId: PROVIDER_ID, field: "breed", count: 2 },
      { providerId: PROVIDER_ID, field: "size", count: 1 },
    ]);
  });

  it("ignores a key that is present but undefined", () => {
    const before = animal({ breed: undefined });

    const { animals, stripped } = applyAllowedFields(
      [before],
      policies(["name"]),
    );

    expect(animals[0]).toBe(before);
    expect(stripped).toEqual([]);
  });

  it("keeps the animal's key order when it rebuilds one", () => {
    const { animals } = applyAllowedFields(
      [animal({ breed: "mešanec", shortDescription: "Luna" })],
      policies(["name", "shortDescription"]),
    );

    expect(Object.keys(animals[0]!)).toEqual([
      "id",
      "source",
      "shelter",
      "name",
      "species",
      "status",
      "images",
      "attribution",
      "shortDescription",
    ]);
  });

  it("leaves an animal whose provider has no policy alone", () => {
    const before = animal({
      id: "turk:1",
      source: {
        providerId: "turk",
        sourceUrl: "https://example.si/1",
        fetchedAt: "2026-08-28T06:00:00Z",
        firstSeenAt: "2026-08-28T06:00:00Z",
        lastSeenAt: "2026-08-28T06:00:00Z",
      },
      breed: "mešanec",
    });

    const { animals, stripped } = applyAllowedFields(
      [before],
      policies(["name"]),
    );

    expect(animals[0]).toBe(before);
    expect(stripped).toEqual([]);
  });
});
