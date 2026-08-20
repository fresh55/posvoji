import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { loadFixture } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  parseAgeMonths,
  parseDetail,
  parseList,
  parseSlovenianDate,
  resolveAgeMonths,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);
const catHtml = loadFixture(import.meta.url, "detail-cat.html");
const dogHtml = loadFixture(import.meta.url, "detail-dog.html");
const historyHtml = loadFixture(import.meta.url, "detail-history.html");

describe("policy.yaml", () => {
  it("matches the enabled provider and records granted permission", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission).toMatchObject({
      status: "granted",
      date: "2026-08-18",
    });
    expect(policy.descriptions).toBe("full-permitted");
    expect(policy.images).toBe("cache-permitted");
  });
});

describe("parseList", () => {
  it("uses WordPress post ids and canonical same-site detail URLs", () => {
    expect(parseList(loadFixture(import.meta.url, "list.html"))).toEqual([
      {
        sourceAnimalId: "9220",
        sourceUrl: "https://www.zavetisce-horjul.net/renamed-nina/",
      },
      {
        sourceAnimalId: "9035",
        sourceUrl: "https://www.zavetisce-horjul.net/aisha/",
      },
    ]);
  });
});

describe("fact parsers", () => {
  it.each([
    ["25. 6. 2026", "2026-06-25"],
    ["9. 6. 2026", "2026-06-09"],
    ["31. 2. 2026", undefined],
    ["junij 2026", undefined],
  ])("parses date %s conservatively", (input, expected) => {
    expect(parseSlovenianDate(input)).toBe(expected);
  });

  it.each([
    ["2 leti", 24],
    ["1,5 let", 18],
    ["7 let in 2 meseca", 86],
    ["5 mesecev", 5],
    ["8 tednov", 2],
    ["9 tednov", 2],
    ["Mlada odrasla", undefined],
    ["Nekaj ur", undefined],
  ])("parses intake age %s conservatively", (input, expected) => {
    expect(parseAgeMonths(input)).toBe(expected);
  });
});

describe("parseDetail", () => {
  it("extracts labeled cat facts, combined tests and the carousel image", () => {
    expect(parseDetail(catHtml)).toEqual({
      sourceAnimalId: "9220",
      name: "Nina",
      species: "cat",
      sex: "female",
      intakeAgeMonths: undefined,
      size: "medium",
      status: "available",
      intakeDate: "2026-06-25",
      originMunicipality: "Hrpelje – Kozina",
      medical: {
        neutered: true,
        vaccinated: true,
        microchipped: true,
        felv: "negative",
        fiv: "negative",
      },
      description: undefined,
      imageUrls: [
        "https://www.zavetisce-horjul.net/wp-content/uploads/2026/08/NinaT.jpg",
      ],
    });
  });

  it("extracts dog facts but does not treat 'Lastniški' as a municipality", () => {
    expect(parseDetail(dogHtml)).toMatchObject({
      sourceAnimalId: "9035",
      name: "Aisha",
      species: "dog",
      intakeAgeMonths: 18,
      intakeDate: "2026-04-22",
      originMunicipality: undefined,
      status: "available",
    });
  });

  it("extracts a week-based intake age and full-size journal galleries", () => {
    expect(parseDetail(historyHtml)).toMatchObject({
      sourceAnimalId: "862",
      name: "Klopka",
      species: "cat",
      intakeAgeMonths: 2,
      intakeDate: "2016-07-25",
      imageUrls: [
        "https://www.zavetisce-horjul.net/wp-content/uploads/2024/08/klopka09-2.jpg",
        "https://www.zavetisce-horjul.net/wp-content/uploads/2024/08/Klopka12.jpg",
        "https://www.zavetisce-horjul.net/wp-content/uploads/2024/08/Klopka13.jpg",
      ],
    });
  });
});

describe("journal descriptions", () => {
  it("takes the newest journal entry and drops the questionnaire line", () => {
    expect(parseDetail(historyHtml).description).toBe(
      "Klopka je FeLV in FIV negativna, sterilizirana, cepljena, čipirana in " +
        "išče dom. Oddaja se izključno za notranje bivanje.",
    );
  });

  it("ignores older entries that describe an animal she no longer is", () => {
    // Klopka's 2018 entry still describes the nine-week-old kitten who
    // arrived in 2016.
    expect(parseDetail(historyHtml).description).not.toContain("9 tednov");
  });

  it("has no description when a listing carries no journal", () => {
    expect(parseDetail(dogHtml).description).toBeUndefined();
  });
});

describe("resolveAgeMonths", () => {
  it("ages a numeric intake age forward to the crawl date", () => {
    expect(
      resolveAgeMonths(
        { intakeAgeMonths: 18, intakeDate: "2026-04-22" },
        "2026-08-18T08:00:00.000Z",
      ),
    ).toBe(21);
  });

  it("ages an intake age converted from weeks across the animal's stay", () => {
    expect(
      resolveAgeMonths(
        { intakeAgeMonths: 2, intakeDate: "2016-07-25" },
        "2026-08-18T08:00:00.000Z",
      ),
    ).toBe(122);
  });
});

describe("provider", () => {
  it("discovers the configured page through the supplied polite client", async () => {
    const get = vi.fn().mockResolvedValue({
      status: 200,
      body: loadFixture(import.meta.url, "list.html"),
    });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(get).toHaveBeenCalledWith(
      "https://www.zavetisce-horjul.net/iscejo-dom/",
    );
    expect(refs).toHaveLength(2);
  });

  it("rejects a detail page whose WordPress post id changed", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, body: catHtml });
    await expect(
      provider.fetch(
        { client: { get } as never, policy },
        {
          sourceAnimalId: "9999",
          sourceUrl: "https://www.zavetisce-horjul.net/nina-2/",
        },
      ),
    ).rejects.toThrow("detail identity mismatch");
  });

  it("normalizes to the strict schema with cacheable image rights", async () => {
    const ref = {
      sourceAnimalId: "9035",
      sourceUrl: "https://www.zavetisce-horjul.net/aisha/",
    };
    const animal = await provider.normalize(
      { client: {} as never, policy },
      {
        ref,
        fetchedAt: "2026-08-18T08:00:00.000Z",
        data: parseDetail(dogHtml),
      },
    );
    expect(Animal.parse(animal)).toMatchObject({
      id: "horjul:9035",
      shelter: { id: "horjul", name: "Zavetišče Horjul", city: "Horjul" },
      species: "dog",
      approximateAgeMonths: 21,
      status: "available",
      images: [{ rights: "cache-permitted" }],
    });
    // Aisha's listing carries no journal, so there is nothing to describe her
    // with. JSON.stringify drops the key on the way into the dataset.
    expect(animal.shortDescription).toBeUndefined();
  });
});
