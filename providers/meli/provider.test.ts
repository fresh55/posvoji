import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadFixture, PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  parseApproximateAgeMonths,
  parseDetail,
  parseList,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);

describe("policy.yaml", () => {
  it("records all granted content permissions", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission.status).toBe("granted");
    expect(policy.permission.date).toBe("2026-08-19");
    expect(policy.images).toBe("cache-permitted");
    expect(policy.descriptions).toBe("full-permitted");
  });
});

describe("parseList", () => {
  it("extracts canonical portfolio links and ignores duplicates and off-site links", () => {
    expect(parseList(loadFixture(import.meta.url, "list.html"))).toEqual([
      {
        sourceAnimalId: "lina-isce-nov-dom",
        sourceUrl:
          "https://www.meli-center.si/portfolio/lina-isce-nov-dom/",
      },
      {
        sourceAnimalId: "tom-in-lady-isceta-nove-domove",
        sourceUrl:
          "https://www.meli-center.si/portfolio/tom-in-lady-isceta-nove-domove/",
      },
    ]);
  });
});

describe("parseApproximateAgeMonths", () => {
  it.each([
    ["približno leto dni stara", 12],
    ["6-letni mešanček", 72],
    ["star 3 leta", 36],
    ["stara sta 18 mesecev", 18],
    ["mlad pes", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseApproximateAgeMonths(input)).toBe(expected);
  });
});

describe("parseDetail", () => {
  it("parses a dog and stops before contact boilerplate", () => {
    expect(parseDetail(loadFixture(import.meta.url, "detail-dog.html"))).toEqual({
      name: "LINA",
      species: "dog",
      sex: "female",
      approximateAgeMonths: 12,
      description:
        "Lina je približno leto dni stara psička. Je mlada, radovedna in prijazna.",
      imageUrls: [
        "https://www.meli-center.si/wp-content/uploads/2026/06/lina.jpg",
      ],
    });
  });

  it("keeps a mixed-sex pair as one listing with unknown sex", () => {
    expect(parseDetail(loadFixture(import.meta.url, "detail-pair.html"))).toMatchObject({
      name: "TOM in LADY",
      species: "cat",
      sex: "unknown",
      approximateAgeMonths: 18,
    });
  });
});

describe("normalize", () => {
  const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };
  const ref = parseList(loadFixture(import.meta.url, "list.html"))[0]!;
  const raw = {
    ref,
    fetchedAt: "2026-08-19T10:00:00Z",
    data: parseDetail(loadFixture(import.meta.url, "detail-dog.html")),
  };

  it("produces a schema-valid animal with permitted content", async () => {
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.id).toBe("meli:lina-isce-nov-dom");
    expect(animal.species).toBe("dog");
    expect(animal.status).toBe("available");
    expect(animal.images[0]).toEqual({
      sourceUrl:
        "https://www.meli-center.si/wp-content/uploads/2026/06/lina.jpg",
      rights: "cache-permitted",
    });
    expect(animal.shortDescription).not.toContain("Za več informacij");
  });

  it("keeps the shelter block in sync with data/shelters.yaml", async () => {
    const registry = parse(
      readFileSync(
        new URL("../../data/shelters.yaml", import.meta.url),
        "utf8",
      ),
    ) as { shelters: Array<{ id: string; name: string; city: string }> };
    const entry = registry.shelters.find((s) => s.id === provider.id);
    expect(entry).toBeDefined();

    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.shelter).toEqual({
      id: entry!.id,
      name: entry!.name,
      city: entry!.city,
    });
  });
});
