import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadFixture, PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  parseAgeMonths,
  parseDetail,
  parseList,
  parseSlovenianDate,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);

const detailHtml = loadFixture(import.meta.url, "detail.html");

const raw = {
  ref: {
    sourceAnimalId: "3187",
    sourceUrl: "https://www.macjahisa.si/posvojitev/muce/3187",
  },
  fetchedAt: "2026-08-16T06:00:00Z",
  data: parseDetail(detailHtml),
};

describe("policy.yaml", () => {
  it("matches the provider and records the granted permission", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission.status).toBe("granted");
  });
});

describe("parseList", () => {
  it("extracts animal refs and skips duplicates, off-site links and non-detail hrefs", () => {
    const refs = parseList(loadFixture(import.meta.url, "list.html"));
    expect(refs).toEqual([
      {
        sourceAnimalId: "4304",
        sourceUrl: "https://www.macjahisa.si/posvojitev/muce/4304",
      },
      {
        sourceAnimalId: "4966",
        sourceUrl: "https://www.macjahisa.si/posvojitev/muce/4966",
      },
    ]);
  });
});

describe("parseAgeMonths", () => {
  it.each([
    ["3 leta", 36],
    ["1 leto", 12],
    ["10 mesecev", 10],
    ["1 mesec", 1],
    ["7 let in 1 mesec", 85],
    ["1,5 leta", undefined],
    ["2-3 leta", undefined],
    ["neznana", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseAgeMonths(input)).toBe(expected);
  });
});

describe("parseSlovenianDate", () => {
  it.each([
    ["29. 10. 2019", "2019-10-29"],
    ["31. 8. 2023", "2023-08-31"],
    ["32. 13. 2019", undefined],
    ["kmalu", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseSlovenianDate(input)).toBe(expected);
  });
});

describe("parseDetail", () => {
  it("extracts facts, photos and vet status", () => {
    expect(parseDetail(detailHtml)).toEqual({
      name: "Dimitri",
      species: "cat",
      sex: "male",
      approximateAgeMonths: 85,
      intakeDate: "2019-10-29",
      description:
        "Dimitri je razigran muc, ki obožuje mačjo družbo.\n\nNajden je bil oktobra 2019 v Viševku.",
      medical: {
        neutered: true,
        microchipped: true,
        vaccinated: true,
        felv: "negative",
        fiv: "negative",
      },
      imageUrls: [
        "https://www.macjahisa.si/files/oglasi_muce/3187__1_large.jpeg",
        "https://www.macjahisa.si/files/oglasi_muce/3187__2_large.jpeg",
      ],
    });
  });

  it("degrades to undefined rather than fabricating values on a sparse page", () => {
    const facts = parseDetail(
      loadFixture(import.meta.url, "detail-minimal.html"),
    );
    expect(facts).toEqual({
      name: undefined,
      species: "cat",
      // Two labels in one <p> separated by <br>, colon inside the <strong>
      // for the intake row — labelValue must still split them correctly.
      sex: "female",
      approximateAgeMonths: 24,
      intakeDate: undefined,
      description: undefined,
      medical: undefined,
      imageUrls: [],
    });
  });

  it("recognises a dog explicitly labelled on the cat listing", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-dog.html")),
    ).toMatchObject({
      name: "Medo",
      species: "dog",
      sex: "male",
      approximateAgeMonths: 161,
    });
  });

  it.each([
    ["Pes: Medo"],
    ["PES - Medo"],
    ["pes Medo"],
  ])("recognises the dog prefix in %s", (heading) => {
    expect(
      parseDetail(`<div class="with-bootstrap"><h1>${heading}</h1></div>`),
    ).toMatchObject({
      name: "Medo",
      species: "dog",
    });
  });

  it("classifies as a dog with no name when the heading is only the prefix", () => {
    expect(
      parseDetail('<div class="with-bootstrap"><h1>Pes</h1></div>'),
    ).toMatchObject({
      name: undefined,
      species: "dog",
    });
  });
});

describe("normalize", () => {
  const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };

  it("produces a schema-valid Animal with cacheable images and description", async () => {
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.id).toBe("macja-hisa:3187");
    expect(animal.species).toBe("cat");
    expect(animal.status).toBe("available");
    expect(animal.images).toEqual([
      {
        sourceUrl: "https://www.macjahisa.si/files/oglasi_muce/3187__1_large.jpeg",
        rights: "cache-permitted",
      },
      {
        sourceUrl: "https://www.macjahisa.si/files/oglasi_muce/3187__2_large.jpeg",
        rights: "cache-permitted",
      },
    ]);
    expect(animal.shortDescription).toContain("Dimitri je razigran muc");
    expect(animal.attribution).toBe(policy.attribution);
  });

  it("preserves a dog classification from the detail page", async () => {
    const dogRaw = {
      ...raw,
      ref: {
        sourceAnimalId: "4812",
        sourceUrl: "https://www.macjahisa.si/posvojitev/muce/4812",
      },
      data: parseDetail(loadFixture(import.meta.url, "detail-dog.html")),
    };
    const animal = Animal.parse(await provider.normalize(ctx, dogRaw));

    expect(animal.name).toBe("Medo");
    expect(animal.species).toBe("dog");
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

  it("drops images and description when the policy does not permit them", async () => {
    const restricted = {
      ...policy,
      enabled: false,
      images: "none" as const,
      descriptions: "facts-only" as const,
      permission: { status: "none" as const },
    };
    const animal = Animal.parse(
      await provider.normalize({ ...ctx, policy: restricted }, raw),
    );
    expect(animal.images).toEqual([]);
    expect(animal.shortDescription).toBeUndefined();
  });
});
