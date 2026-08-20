import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { loadFixture } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  intakeDateFromDays,
  parseDetail,
  parseList,
  parseSlashDate,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);
const dogList = loadFixture(import.meta.url, "list-dogs.html");
const catList = loadFixture(import.meta.url, "list-cats.html");
const dogDetail = loadFixture(import.meta.url, "detail-dog.html");
const catDetail = loadFixture(import.meta.url, "detail-cat.html");

describe("policy.yaml", () => {
  it("records full permission and enables the provider", () => {
    expect(policy).toMatchObject({
      providerId: provider.id,
      enabled: true,
      images: "cache-permitted",
      descriptions: "full-permitted",
      permission: { status: "granted", date: "2026-08-18" },
    });
  });
});

describe("parseList", () => {
  it("accepts only same-site animal cards and canonicalizes Unicode URLs", () => {
    expect(parseList(dogList)).toEqual([
      {
        sourceAnimalId: "ruby",
        sourceUrl: "https://obalnozavetisce.si/%C5%BEival/ruby/",
      },
    ]);
    expect(parseList(catList)[0]?.sourceAnimalId).toBe("orion");
  });
});

describe("detail facts", () => {
  it.each([
    ["01/07/2025", "2025-07-01"],
    ["5/5/2026", "2026-05-05"],
    ["31/02/2026", undefined],
    ["maj 2026", undefined],
  ])("parses %s conservatively", (value, expected) => {
    expect(parseSlashDate(value)).toBe(expected);
  });

  it("reads labeled dog fields and the rolling shelter-day badge", () => {
    expect(parseDetail(dogDetail)).toEqual({
      name: "Ruby",
      species: "dog",
      sex: "female",
      birthDate: "2025-11-11",
      daysInShelter: 167,
      description: "Ruby je prikupna in zelo igriva psička.",
      imageUrls: [
        "https://obalnozavetisce.si/wp-content/uploads/2026/08/ruby-main-1024x1024.jpg",
        "https://obalnozavetisce.si/wp-content/uploads/2026/08/ruby-gallery.jpg",
      ],
    });
  });

  it("reads a description wrapped in a layout block, without the site boilerplate", () => {
    // Predator's and Vladko's listings nest the text in a div instead of
    // leaving it a direct child, which a direct-child selector loses entirely.
    const facts = parseDetail(
      loadFixture(import.meta.url, "detail-cat-wrapped.html"),
    );
    expect(facts.description).toBe(
      "Predator je približno 7 let star samček. Je igriv in prijeten mucek.",
    );
    // The donation and volunteering panel closes every listing and is never
    // the animal's own text.
    expect(facts.description).not.toContain("Donacije");
    expect(facts.description).not.toContain("prostovoljcev");
    // The sign-off is plain text here, not a mailto link.
    expect(facts.description).not.toContain("example.org");
  });

  it("reads a cat despite whitespace variations", () => {
    expect(parseDetail(catDetail)).toEqual({
      name: "Orion",
      species: "cat",
      sex: "male",
      birthDate: "2026-05-05",
      daysInShelter: 1190,
      description: "Orion je mlad in nekoliko sramežljiv samček.",
      imageUrls: [],
    });
  });
});

describe("intakeDateFromDays", () => {
  it("turns the rolling count into a stable Slovenian-calendar date", () => {
    expect(intakeDateFromDays(82, "2026-08-18T10:00:00.000Z")).toBe("2026-05-28");
  });

  it("handles a stay long enough to cross several years", () => {
    expect(intakeDateFromDays(1190, "2026-08-18T10:00:00.000Z")).toBe("2023-05-16");
  });

  it("uses Ljubljana's date around the UTC boundary", () => {
    expect(intakeDateFromDays(1, "2026-08-17T22:30:00.000Z")).toBe("2026-08-17");
  });
});

describe("provider", () => {
  it("discovers dogs and cats through the supplied polite client", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: dogList })
      .mockResolvedValueOnce({ status: 200, body: catList });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "https://obalnozavetisce.si/iscejo-nov-dom/psi/",
      "https://obalnozavetisce.si/iscejo-nov-dom/macke/",
    ]);
    expect(refs.map(({ sourceAnimalId }) => sourceAnimalId)).toEqual(["ruby", "orion"]);
  });

  it("normalizes the permitted description and cacheable photos", async () => {
    const ref = {
      sourceAnimalId: "ruby",
      sourceUrl: "https://obalnozavetisce.si/%C5%BEival/ruby/",
    };
    const animal = await provider.normalize(
      { client: {} as never, policy },
      { ref, fetchedAt: "2026-08-18T10:00:00.000Z", data: parseDetail(dogDetail) },
    );
    expect(Animal.parse(animal)).toMatchObject({
      id: "obalno:ruby",
      shelter: {
        id: "obalno",
        name: "Obalno zavetišče (Marjetica Koper)",
        city: "Koper",
      },
      species: "dog",
      sex: "female",
      birthDate: "2025-11-11",
      status: "available",
      images: [
        {
          sourceUrl: "https://obalnozavetisce.si/wp-content/uploads/2026/08/ruby-main-1024x1024.jpg",
          rights: "cache-permitted",
        },
        {
          sourceUrl: "https://obalnozavetisce.si/wp-content/uploads/2026/08/ruby-gallery.jpg",
          rights: "cache-permitted",
        },
      ],
      shortDescription: "Ruby je prikupna in zelo igriva psička.",
    });
  });

  it("keeps the shelter block synchronized with data/shelters.yaml", async () => {
    const registry = parse(
      readFileSync(new URL("../../data/shelters.yaml", import.meta.url), "utf8"),
    ) as { shelters: Array<{ id: string; name: string; city: string }> };
    const entry = registry.shelters.find(({ id }) => id === provider.id);
    expect(entry).toMatchObject({
      id: "obalno",
      name: "Obalno zavetišče (Marjetica Koper)",
      city: "Koper",
    });
  });
});
