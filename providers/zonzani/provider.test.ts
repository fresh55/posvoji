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
  parseStatus,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);
const dogHtml = loadFixture(import.meta.url, "detail-dog.html");
const catHtml = loadFixture(import.meta.url, "detail-cat.html");
const dogAgeHtml = loadFixture(import.meta.url, "detail-dog-age.html");

describe("policy.yaml", () => {
  it("matches the enabled provider and records granted permission", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission).toMatchObject({
      status: "granted",
      date: "2026-08-18",
    });
  });
});
describe("parseList", () => {
  it("uses evidence numbers, canonicalizes URLs and rejects invalid links", () => {
    expect(parseList(loadFixture(import.meta.url, "list.html"))).toEqual([
      {
        sourceAnimalId: "03975",
        sourceUrl: "https://www.zonzani.si/zivali/03975/",
      },
      {
        sourceAnimalId: "06285",
        sourceUrl: "https://www.zonzani.si/zivali/06285/",
      },
    ]);
  });

  // Same theme as muri: up to 100 cards render per page with no pagination
  // below that, so a page that fills the cap could be silently truncating
  // the catalogue. A fixture with 100 real cards is impractical, so this
  // generates the smallest markup that still counts: bare article.project
  // elements.
  function cardsHtml(count: number): string {
    return `<div>${"<article class=\"project\"></article>".repeat(count)}</div>`;
  }

  it("parses a page just under the card cap without complaint", () => {
    expect(parseList(cardsHtml(99))).toEqual([]);
  });

  it("throws instead of silently truncating a page at or over the card cap", () => {
    expect(() => parseList(cardsHtml(100))).toThrow(
      /page rendered 100 cards.*pagination support/,
    );
  });
});

describe("parseSlovenianDate", () => {
  it.each([
    ["17.6.2022", "2022-06-17"],
    ["07.05.2026", "2026-05-07"],
    ["31.2.2026", undefined],
    ["maj 2026", undefined],
  ])("parses %s conservatively", (input, expected) => {
    expect(parseSlovenianDate(input)).toBe(expected);
  });
});

describe("parseAgeMonths", () => {
  it.each([
    ["4 leta", 48],
    ["1 leto", 12],
    ["7 let in 2 meseca", 86],
    ["5 mesecev", 5],
    ["2-3 leta", undefined],
    ["manj kot 1 leto", undefined],
  ])("parses %s conservatively", (input, expected) => {
    expect(parseAgeMonths(input)).toBe(expected);
  });
});

describe("parseStatus", () => {
  it.each([
    ["EDI", "available"],
    ["FLORA (karantena)", "hold"],
    ["BINE (rezerviran)", "reserved"],
    ["LINA (rezervirana)", "reserved"],
  ])("maps %s to %s", (input, expected) => {
    expect(parseStatus(input)).toBe(expected);
  });
});

describe("parseDetail", () => {
  it("extracts the labeled dog facts and original image", () => {
    expect(parseDetail(dogHtml)).toEqual({
      sourceAnimalId: "03975",
      name: "Lia",
      species: "dog",
      sex: "female",
      breed: "mešanec",
      birthDate: undefined,
      approximateAgeMonths: undefined,
      size: "large",
      status: "available",
      intakeDate: undefined,
      foundDate: "2022-06-17",
      foundPlace: "Velenje",
      imageUrls: [
        "https://www.zonzani.si/wp-content/uploads/2022/07/IMG_0659.jpg",
      ],
    });
  });

  it("maps quarantine to hold and uses the widest listed image fallback", () => {
    expect(parseDetail(catHtml)).toEqual({
      sourceAnimalId: "06294",
      name: "Flora",
      species: "cat",
      sex: "female",
      breed: undefined,
      birthDate: "2026-05-06",
      approximateAgeMonths: undefined,
      size: undefined,
      status: "hold",
      intakeDate: "2026-05-20",
      foundDate: undefined,
      foundPlace: "Šentjur",
      imageUrls: ["https://www.zonzani.si/wp-content/uploads/2026/07/06294.jpg"],
    });
  });

  it("extracts a textual age stated by the shelter", () => {
    expect(parseDetail(dogAgeHtml)).toMatchObject({
      sourceAnimalId: "04538",
      name: "Bono",
      species: "dog",
      approximateAgeMonths: 48,
    });
  });
});

describe("provider", () => {
  it("discovers both species pages through the supplied polite client", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: loadFixture(import.meta.url, "list.html") })
      .mockResolvedValueOnce({ status: 200, body: loadFixture(import.meta.url, "list.html") });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "https://www.zonzani.si/psi/",
      "https://www.zonzani.si/macke/",
    ]);
    expect(refs).toHaveLength(2);
  });

  it("rejects a detail page whose evidence number changed", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, body: dogHtml });
    await expect(
      provider.fetch(
        { client: { get } as never, policy },
        { sourceAnimalId: "99999", sourceUrl: "https://www.zonzani.si/zivali/99999/" },
      ),
    ).rejects.toThrow("detail identity mismatch");
  });

  it("normalizes to the strict Animal schema with display-only image rights", async () => {
    const ref = {
      sourceAnimalId: "03975",
      sourceUrl: "https://www.zonzani.si/zivali/03975/",
    };
    const animal = await provider.normalize(
      { client: {} as never, policy },
      { ref, fetchedAt: "2026-08-18T08:00:00.000Z", data: parseDetail(dogHtml) },
    );
    expect(Animal.parse(animal)).toMatchObject({
      id: "zonzani:03975",
      shelter: { id: "zonzani", name: "Zavetišče Zonzani", city: "Dramlje" },
      species: "dog",
      status: "available",
      images: [{ rights: "cache-permitted" }],
    });
  });
});
