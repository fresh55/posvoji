import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadFixture, PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, { parseDetail, parseList } from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);

describe("policy.yaml", () => {
  it("is valid and disabled until permission is granted", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(false);
  });
});

describe("parseList", () => {
  it("extracts animal refs from the list page", () => {
    const refs = parseList(loadFixture(import.meta.url, "list.html"));
    expect(refs).toEqual([
      {
        sourceAnimalId: "rex",
        sourceUrl: "https://example-shelter.si/zivali/rex",
      },
      {
        sourceAnimalId: "luna",
        sourceUrl: "https://example-shelter.si/zivali/luna",
      },
    ]);
  });
});

describe("parseDetail", () => {
  it("extracts facts by label", () => {
    const facts = parseDetail(loadFixture(import.meta.url, "detail.html"));
    expect(facts).toEqual({
      name: "Rex",
      species: "dog",
      sex: "male",
      approximateAgeMonths: 48,
      intakeDate: "2025-03-12",
      status: "available",
    });
  });

  it("keeps a decimal age whole", () => {
    const html = loadFixture(import.meta.url, "detail.html").replace(
      "4 leta",
      "1,5 leta",
    );
    expect(parseDetail(html).approximateAgeMonths).toBe(18);
  });
});

describe("normalize", () => {
  it("produces a schema-valid Animal", async () => {
    const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };
    const raw = {
      ref: {
        sourceAnimalId: "rex",
        sourceUrl: "https://example-shelter.si/zivali/rex",
      },
      fetchedAt: "2026-08-15T06:00:00Z",
      data: parseDetail(loadFixture(import.meta.url, "detail.html")),
    };
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.id).toBe("template:rex");
    expect(animal.attribution).toBe(policy.attribution);
    expect(animal.images).toEqual([]);
    expect(animal.intakeDate).toBe("2025-03-12");
  });
});
