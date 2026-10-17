import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
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
const listHtml = loadFixture(import.meta.url, "list.html");

function mockClient(body: string) {
  const get = vi.fn().mockResolvedValue({ status: 200, body });
  return { get, client: { get } as unknown as PoliteClient };
}

// A listing page always carries the "Osnovni podatki" card; parseDetail
// refuses a page without it. Synthetic headings are wrapped in an empty one.
const listing = (body: string) =>
  `<div class="with-bootstrap">${body}` +
  '<div class="card"><div class="card-header"><strong>Osnovni podatki</strong>' +
  "</div></div></div>";

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
    const refs = parseList(listHtml);
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

describe("discover", () => {
  it("discovers through the supplied polite client", async () => {
    const { client, get } = mockClient(listHtml);
    expect(await provider.discover({ client, policy })).toEqual(parseList(listHtml));
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(policy.source);
  });

  it.each([
    "<h1>Vzdrževanje</h1>",
    '<div class="seznam-muc-list"><a class="seznam-muc-list-item" href="#">Muca</a></div>',
  ])("refuses an absent or malformed catalogue", async (html) => {
    const { client } = mockClient(html);
    await expect(provider.discover({ client, policy })).rejects.toThrow("catalogue is absent or malformed");
  });

  it("distinguishes a genuinely empty list wrapper from a missing catalogue", async () => {
    const { client } = mockClient('<div class="seznam-muc-list"></div>');
    await expect(provider.discover({ client, policy })).resolves.toEqual([]);
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
    ["2 - 3 leta", undefined],
    ["2–3 leta", undefined],
    ["2 — 3 leta", undefined],
    ["2 do 3 leta", undefined],
    ["med 2 in 3 leta", undefined],
    ["2 leti ali 3 leta", undefined],
    ["1 leto in 2-3 mesece", undefined],
    ["1 leto in 2,5 meseca", undefined],
    ["1 leto in pol", undefined],
    ["2/3 leta", undefined],
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
    ["psička: Medo"],
    ["PSIČKA - Medo"],
  ])("recognises the dog prefix in %s", (heading) => {
    expect(parseDetail(listing(`<h1>${heading}</h1>`))).toMatchObject({
      name: "Medo",
      species: "dog",
    });
  });

  it("classifies as a dog with no name when the heading is only the prefix", () => {
    expect(parseDetail(listing("<h1>Pes</h1>"))).toMatchObject({
      name: undefined,
      species: "dog",
    });
  });

  it("recognises the current psička heading without inferring from prose", () => {
    expect(parseDetail(listing("<h1>psička Nutella</h1>"))).toMatchObject({
      name: "Nutella",
      species: "dog",
    });
    expect(parseDetail(listing("<h1>Peska</h1>"))).toMatchObject({
      name: "Peska",
      species: "cat",
    });
  });

  it("keeps an explicit species label ahead of a heading prefix", () => {
    const facts = parseDetail(listing(
      '<h1>psička Nutella</h1><p><strong>Vrsta</strong>: mačka</p>',
    ));
    expect(facts.species).toBe("cat");
  });

  it("keeps dog procedures but does not read feline tests from their template", () => {
    const facts = parseDetail(detailHtml.replace("Dimitri</h1>", "psička Nutella</h1>"));
    expect(facts.species).toBe("dog");
    expect(facts.medical).toEqual({
      neutered: true,
      microchipped: true,
      vaccinated: true,
    });
  });

  it("does not assume a positive feline result from an unconfirmed icon", () => {
    const facts = parseDetail(detailHtml.replace(/fa-minus/g, "fa-plus"));
    expect(facts.medical).toMatchObject({ fiv: "unknown", felv: "unknown" });
  });

  it("keeps visible paragraphs while excluding non-visible description content", () => {
    const facts = parseDetail(listing(
      '<div class="content-body"><p>Prijazen muc.</p>' +
      '<script>script text</script><style>style text</style>' +
      '<template>template text</template><noscript>fallback text</noscript>' +
      '<p>Išče dom.</p></div>',
    ));
    expect(facts.description).toBe("Prijazen muc.\n\nIšče dom.");
  });

  it("refuses a page that is not a listing", () => {
    expect(() =>
      parseDetail(
        '<div class="with-bootstrap"><h1>Stran ni na voljo</h1></div>',
      ),
    ).toThrow("detail page has no Osnovni podatki card");
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
