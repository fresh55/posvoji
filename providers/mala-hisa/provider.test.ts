import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { loadFixture } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  parseApproximateAgeMonths,
  parseDetail,
  parseList,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);
const dogList = loadFixture(import.meta.url, "list-dogs.html");
const catList = loadFixture(import.meta.url, "list-cats.html");
const dogDetail = loadFixture(import.meta.url, "detail-dog.html");
const catDetail = loadFixture(import.meta.url, "detail-cat.html");

describe("policy.yaml", () => {
  it("keeps the provider disabled until permission is recorded", () => {
    expect(policy).toMatchObject({
      providerId: provider.id,
      enabled: false,
      images: "none",
      descriptions: "facts-only",
      permission: { status: "none" },
    });
    expect(policy.crawl.excludePaths).toContain("/privat-oddaja/");
  });
});

describe("parseList", () => {
  it("deduplicates official dog links and rejects private or external URLs", () => {
    expect(parseList(dogList)).toEqual([
      {
        sourceAnimalId: "psi_za_oddajo:lajka",
        sourceUrl: "https://zavetisce-malahisa.si/psi_za_oddajo/lajka/",
      },
    ]);
  });

  it("supports the official cat post type", () => {
    expect(parseList(catList)[0]).toEqual({
      sourceAnimalId: "muce_za_oddajo:mici",
      sourceUrl: "https://zavetisce-malahisa.si/muce_za_oddajo/mici/",
    });
  });
});

describe("detail facts", () => {
  it("extracts conservative facts from a dog article", () => {
    expect(parseDetail(dogDetail)).toEqual({
      name: "LAJKA",
      species: "dog",
      sex: "female",
      breed: "belgijska ovčarka",
      approximateAgeMonths: 84,
      size: undefined,
      status: "available",
    });
  });

  it("recognizes the cat article type", () => {
    expect(parseDetail(catDetail)).toEqual({
      name: "MICI",
      species: "cat",
      sex: "female",
      breed: undefined,
      approximateAgeMonths: 4,
      size: "small",
      status: "available",
    });
  });

  it("does not collapse published age ranges into a guessed integer", () => {
    expect(parseApproximateAgeMonths("star približno 8–10 let")).toBeUndefined();
    expect(parseApproximateAgeMonths("stara približno 5-6 mesecev")).toBeUndefined();
    expect(parseApproximateAgeMonths("10-letni srnin pinč")).toBe(120);
  });
});

describe("provider", () => {
  it("discovers both official adoption sections through the polite client", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: dogList })
      .mockResolvedValueOnce({ status: 200, body: catList });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "https://zavetisce-malahisa.si/psi-za-oddajo/",
      "https://zavetisce-malahisa.si/muce-za-oddajo/",
    ]);
    expect(refs).toHaveLength(2);
  });

  it("normalizes facts without descriptions or photographs", async () => {
    const ref = parseList(dogList)[0]!;
    const animal = await provider.normalize(
      { client: {} as never, policy },
      {
        ref,
        fetchedAt: "2026-08-19T10:00:00.000Z",
        data: parseDetail(dogDetail),
      },
    );
    expect(Animal.parse(animal)).toMatchObject({
      id: "mala-hisa:psi_za_oddajo:lajka",
      shelter: {
        id: "mala-hisa",
        name: "Zavetišče Mala hiša",
        city: "Moravske Toplice",
      },
      species: "dog",
      sex: "female",
      approximateAgeMonths: 84,
      status: "available",
      images: [],
    });
    expect(animal).not.toHaveProperty("shortDescription");
  });

  it("matches the shelter registry", () => {
    const registry = parse(
      readFileSync(new URL("../../data/shelters.yaml", import.meta.url), "utf8"),
    ) as { shelters: Array<{ id: string; name: string; city: string }> };
    expect(registry.shelters.find(({ id }) => id === provider.id)).toMatchObject({
      id: "mala-hisa",
      name: "Zavetišče Mala hiša",
      city: "Moravske Toplice",
    });
  });
});
