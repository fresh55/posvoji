import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { loadFixture } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  parseApproximateAgeMonths,
  parseDetail,
  parseList,
  parseSlovenianDate,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);
const listHtml = loadFixture(import.meta.url, "list.html");
const catHtml = loadFixture(import.meta.url, "detail-cat.html");
const dogHtml = loadFixture(import.meta.url, "detail-dog.html");

describe("policy.yaml", () => {
  it("records full permission and enables the provider", () => {
    expect(policy).toMatchObject({
      providerId: provider.id,
      enabled: true,
      images: "cache-permitted",
      descriptions: "full-permitted",
      permission: { status: "granted", date: "2026-08-19" },
    });
  });
});

describe("parseList", () => {
  it("discovers unique numeric IDs and rejects links outside the catalogue", () => {
    expect(parseList(listHtml)).toEqual([
      {
        sourceAnimalId: "61",
        sourceUrl: "https://zavetisce-mb.si/zival/?animal_id=61",
      },
      {
        sourceAnimalId: "33",
        sourceUrl: "https://zavetisce-mb.si/zival/?animal_id=33",
      },
    ]);
  });
});

describe("detail facts", () => {
  it.each([
    ["14. 11. 2023", "2023-11-14"],
    ["V zavetišču od: 3. 2. 2026 (197 dni)", "2026-02-03"],
    ["31. 2. 2026", undefined],
  ])("parses %s conservatively", (value, expected) => {
    expect(parseSlovenianDate(value)).toBe(expected);
  });

  it.each([
    ["8 let", 96],
    ["1 leto", 12],
    ["4 mesece", 4],
    ["star 3 leta", 36],
    // The trailing half of "1,5 leta" is not the age.
    ["1,5 leta", 18],
    ["2.5 leti", 30],
    ["1,5 meseca", 2],
    // A number with no unit is not an age.
    ["10,5", undefined],
    ["mlad", undefined],
  ])("maps age %s to months", (value, expected) => {
    expect(parseApproximateAgeMonths(value)).toBe(expected);
  });

  it("reads the cat page without inventing a breed", () => {
    expect(parseDetail(catHtml)).toEqual({
      name: "Sid",
      species: "cat",
      sex: "male",
      breed: undefined,
      approximateAgeMonths: 60,
      size: "medium",
      status: "available",
      intakeDate: "2026-02-03",
      medical: { microchipped: true },
      description: "Odrasel muc, ima rad svoj mir.",
      imageUrls: [
        "https://zavetisce-mb.si/wp-content/uploads/2026/02/sid-768x1024.jpg",
      ],
    });
  });

  it("reads labeled dog facts, full-size gallery photos, and health flags", () => {
    expect(parseDetail(dogHtml)).toEqual({
      name: "Lajka",
      species: "dog",
      sex: "female",
      breed: "N. ovčarka / mešanka",
      approximateAgeMonths: 96,
      size: "large",
      status: "available",
      intakeDate: "2023-11-14",
      medical: {
        vaccinated: true,
        neutered: true,
        microchipped: true,
      },
      description: "Lajka je ljubezniva in prijazna do ljudi.",
      imageUrls: [
        "https://zavetisce-mb.si/wp-content/uploads/2025/12/lajka.jpg",
        "https://zavetisce-mb.si/wp-content/uploads/2025/12/lajka-2.jpg",
      ],
    });
  });
});

describe("provider", () => {
  it("discovers through the supplied polite client", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, body: listHtml });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(get).toHaveBeenCalledWith(policy.source);
    expect(refs).toHaveLength(2);
  });

  it("normalizes permitted descriptions and cacheable photos", async () => {
    const ref = parseList(listHtml)[1]!;
    const animal = Animal.parse(
      await provider.normalize(
        { client: {} as never, policy },
        { ref, fetchedAt: "2026-08-19T10:00:00Z", data: parseDetail(dogHtml) },
      ),
    );
    expect(animal).toMatchObject({
      id: "maribor:33",
      shelter: {
        id: "maribor",
        name: "Zavetišče Maribor (Snaga)",
        city: "Maribor",
      },
      species: "dog",
      sex: "female",
      breed: "N. ovčarka / mešanka",
      approximateAgeMonths: 96,
      size: "large",
      status: "available",
      intakeDate: "2023-11-14",
      images: [
        {
          sourceUrl: "https://zavetisce-mb.si/wp-content/uploads/2025/12/lajka.jpg",
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://zavetisce-mb.si/wp-content/uploads/2025/12/lajka-2.jpg",
          rights: "cache-permitted",
        },
      ],
      shortDescription: "Lajka je ljubezniva in prijazna do ljudi.",
    });
  });

  it("keeps the shelter block synchronized with data/shelters.yaml", () => {
    const registry = parse(
      readFileSync(new URL("../../data/shelters.yaml", import.meta.url), "utf8"),
    ) as { shelters: Array<{ id: string; name: string; city: string }> };
    expect(registry.shelters.find(({ id }) => id === provider.id)).toMatchObject({
      id: "maribor",
      name: "Zavetišče Maribor (Snaga)",
      city: "Maribor",
    });
  });
});
