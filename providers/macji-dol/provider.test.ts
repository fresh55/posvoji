import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadFixture, PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  parseDetail,
  parseEnergy,
  parseIntakeBy,
  parseIntakeDate,
  parseList,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);

// Every listing is a WooCommerce product container; parseDetail refuses a
// page without one. No stock flag here, so the status reading stays with
// normalize() as it did before.
const listing = (body: string) =>
  `<div class="product type-product">${body}</div>`;

describe("policy.yaml", () => {
  it("records permission for descriptions and cacheable photos", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission.status).toBe("granted");
    expect(policy.permission.date).toBe("2026-08-19");
    expect(policy.images).toBe("cache-permitted");
    expect(policy.descriptions).toBe("full-permitted");
  });
});

describe("parseList", () => {
  it("extracts product cards and ignores duplicates, filters, and off-site links", () => {
    expect(parseList(loadFixture(import.meta.url, "list.html"))).toEqual([
      {
        sourceAnimalId: "3031",
        sourceUrl: "https://www.macji-dol.si/mucki-iscejo-dom/misa/",
      },
      {
        sourceAnimalId: "2635",
        sourceUrl: "https://www.macji-dol.si/mucki-iscejo-dom/lejla/",
      },
    ]);
  });
});

describe("parseEnergy", () => {
  it.each([
    // Every distinct "Živahnost" / "Energetičnost" value seen on a saved
    // detail page, mapped by the rules above.
    ["Zelo igriva, z vmesnimi dolgimi počitki", undefined],
    ["Srednje živahna, občasno zelo igriva", "balanced"],
    ["srednje živahen, občasno igriv", "balanced"],
    ["Igriv kot mladiček, a rad tudi počiva", undefined],
    ["Bolj mirna fanta", "calm"],
    ["Srednje živahna", "balanced"],
    ["precej igrivi, športni plezalci", undefined],
    ["Umirjen", "calm"],
    ["Igriv, rada se stiska v naročje", undefined],
    ["Mirna, občasno igriva", "calm"],
    ["Miren poba, rad se stiska v naročje", "calm"],
    ["Zelo energična, strastna lovka", "lively"],
    ["bolj mirna gospodična", "calm"],
    ["bolj mirna gospodična, občasno igriva", "calm"],
    // Not seen on a saved page, but the rules must still hold: a negated row
    // says what the animal is not, and a row naming both a calm and a lively
    // word with no "srednje" marker contradicts itself. Both stay unmapped.
    ["Ni miren, precej živahen", undefined],
    ["Miren, a živahen na sprehodu", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseEnergy(input)).toBe(expected);
  });
});

describe("parseIntakeDate", () => {
  it.each([
    ["V zavetišče je prišla 7. 5. 2025.", "2025-05-07"],
    ["Sprejet je bil dne 29. 10. 2019.", "2019-10-29"],
    ["V zavetišču je od maja 2025.", undefined],
    ["Sprejeta sta bila pozimi 2022.", undefined],
    ["V letu 2019 je bil sprejet kot mladič.", undefined],
    ["Sprejet je bil 32. 13. 2025.", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseIntakeDate(input)).toBe(expected);
  });
});

describe("parseIntakeBy", () => {
  it.each([
    ["Iris in Melisa sta v zavetišču od maja 2025, lahko gresta tudi posamič.", "2025-05-31"],
    ["Miša je v zavetišče prišla septembra 2022.", "2022-09-30"],
    ["Turk je bil najden konec septembra 2025 na območju Breznice.", "2025-09-30"],
    ["Pončo je v Mačjem dolu od jeseni 2024.", "2024-11-30"],
    ["Poleti 2022 je bila najdena pred pekarno v Železnikih.", "2022-08-31"],
    ["V letu 2019 je bil z bratom sprejet v zavetišče kot malček.", "2019-12-31"],
    // Winter may run into the next year, and only its end is a safe floor.
    ["Igor in Vladimir sta bila sprejeta pozimi 2022 kot skoraj odrasla.", "2023-02-28"],
    ["Pozimi 2023 je bila sprejeta.", "2024-02-29"],
    // The nearest period to the arrival word, not the first in the sentence.
    ["Rojena spomladi 2020, sprejeta jeseni 2021.", "2021-11-30"],
  ])("%s → %s", (input, expected) => {
    expect(parseIntakeBy(input)).toBe(expected);
  });

  it.each([
    // A date for a birth, with the arrival word in another sentence.
    "Mama Demetra je za 1. maj 2023 skotila na mrzlem betonu. Malčki so bili komaj živi, ko so bili najdeni.",
    // A cat that came back: the date belongs to the first stay.
    "Mira je v zavetišče prišla kot dudarka v maju 2014. Sedaj je zopet pri nas.",
    "V zavetišče je bil ta plahi fant sprejet z lokacije ob glavni cesti.",
    "Rodila se je maja 2024 in je zelo igriva.",
  ])("%s → undefined", (input) => {
    expect(parseIntakeBy(input)).toBeUndefined();
  });
});

describe("parseDetail", () => {
  it("preserves a multi-cat title without inferring a joint adoption", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-pair-separate.html")),
    ).toEqual({
      name: "Iris in Melisa",
      // WooCommerce marks the product in stock, which is the site saying the
      // cats are still to be had.
      status: "available",
      sex: "female",
      energy: undefined,
      adoptionRequirements: undefined,
      intakeDate: undefined,
      intakeBy: "2025-05-31",
      description:
        "Iris in Melisa sta v zavetišču od maja 2025. Ni nujno, da odideta v skupen dom.",
      // "Mačke" maps; the hedged "verjetno tudi psi" does not.
      goodWith: { cats: "yes" },
      imageUrls: [
        "https://www.macji-dol.si/wp-content/uploads/example/iris-melisa.jpg",
      ],
    });
  });

  it("reads the stock flag WooCommerce writes on the product", () => {
    const html = loadFixture(import.meta.url, "detail-no-terms.html");

    expect(parseDetail(html).status).toBe("available");
    // The one state the live site was never seen in. A cat marked out of
    // stock is not to be had, which is "hold": nothing here claims it was
    // adopted, only that it is not on offer.
    expect(parseDetail(html.replace(/\binstock\b/, "outofstock")).status).toBe(
      "hold",
    );
    // A container with no flag leaves the reading to normalize().
    expect(parseDetail(html.replace(/\binstock\b/, "")).status).toBeUndefined();
  });

  it("also preserves a title whose text explicitly requires adoption together", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-pair-together.html")),
    ).toMatchObject({
      name: "Igor in Vladimir",
      sex: "male",
      intakeDate: undefined,
      intakeBy: "2023-02-28",
      description: "Sprejeta sta bila pozimi 2022. Oddajamo ju skupaj.",
      // "Brez mačk" and bare "psi" are both exact, unqualified terms.
      goodWith: { cats: "no", dogs: "yes" },
    });
  });

  it("omits goodWith entirely when the page has no Družabnost field", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-no-terms.html"))
        .goodWith,
    ).toBeUndefined();
  });

  it("never substring-matches a qualified term", () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>DRUŽABNOST:</strong> Ljudje, z določenimi mačkami, poznani mačji prijatelji</p>
      </div></article></div>`);
    expect(parseDetail(html).goodWith).toBeUndefined();
  });

  it("refuses a page that carries no product container", () => {
    expect(() =>
      parseDetail("<!doctype html><html><body><h1>Vzdrževanje</h1></body></html>"),
    ).toThrow("detail page has no product container");
  });

  it("reads Energetičnost when the page has no Živahnost row", () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>ENERGETIČNOST:</strong> srednje živahen, občasno igriv</p>
      </div></article></div>`);
    expect(parseDetail(html).energy).toBe("balanced");
  });

  it("prefers Živahnost when both rows are present", () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>ŽIVAHNOST:</strong> Umirjen</p>
        <p><strong>ENERGETIČNOST:</strong> Zelo energična, strastna lovka</p>
      </div></article></div>`);
    expect(parseDetail(html).energy).toBe("calm");
  });
});

describe("adoptionRequirements", () => {
  it("reads a stated indoor environment as an indoor-only requirement", () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>BIVANJE:</strong> v notranjem okolju, zunaj le na povodcu</p>
      </div></article></div>`);
    expect(parseDetail(html).adoptionRequirements).toEqual({
      indoorOnly: true,
    });
  });

  it("leaves it unset when the row offers an alternative rather than a requirement", () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>BIVANJE:</strong> V notranjem okolju ali z izhodi v varno okolje</p>
      </div></article></div>`);
    expect(parseDetail(html).adoptionRequirements).toBeUndefined();
  });

  it("leaves it unset when the indoor environment comes with outings", () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>BIVANJE:</strong> v notranjem okolju, izhodi v varno okolje</p>
      </div></article></div>`);
    expect(parseDetail(html).adoptionRequirements).toBeUndefined();
  });

  it("leaves it unset when the row never states an indoor environment", () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>BIVANJE:</strong> Z izhodi v varno okolje</p>
      </div></article></div>`);
    expect(parseDetail(html).adoptionRequirements).toBeUndefined();
  });

  it("is absent when the page has no Bivanje row", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-no-terms.html"))
        .adoptionRequirements,
    ).toBeUndefined();
  });
});

describe("normalize", () => {
  const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };
  const raw = {
    ref: {
      sourceAnimalId: "2635",
      sourceUrl: "https://www.macji-dol.si/mucki-iscejo-dom/lejla/",
    },
    fetchedAt: "2026-08-19T06:00:00Z",
    data: parseDetail(
      loadFixture(import.meta.url, "detail-pair-separate.html"),
    ),
  };

  it("produces one schema-valid listing with the permitted content", async () => {
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.id).toBe("macji-dol:2635");
    expect(animal.name).toBe("Iris in Melisa");
    expect(animal.species).toBe("cat");
    expect(animal.status).toBe("available");
    expect(animal.intakeDate).toBeUndefined();
    expect(animal.intakeBy).toBe("2025-05-31");
    expect(animal.images).toEqual([
      {
        sourceUrl:
          "https://www.macji-dol.si/wp-content/uploads/example/iris-melisa.jpg",
        rights: "cache-permitted",
      },
    ]);
    expect(animal.shortDescription).toContain(
      "Ni nujno, da odideta v skupen dom.",
    );
    expect(animal.goodWith).toEqual({ cats: "yes" });
  });

  it("keeps intakeBy no later than the day the page was read", async () => {
    const html = listing(`
      <div class="summary"><div class="entry-content">
        <h2>Opis</h2><p>Sprejeta je bila jeseni 2026.</p>
      </div></div>`);
    const animal = Animal.parse(
      await provider.normalize(ctx, { ...raw, data: parseDetail(html) }),
    );
    expect(animal.intakeBy).toBe("2026-08-19");
  });

  it("leaves intakeBy out beside an exact intake date", async () => {
    const data = { ...raw.data, intakeDate: "2025-05-07" };
    const animal = Animal.parse(await provider.normalize(ctx, { ...raw, data }));
    expect(animal.intakeDate).toBe("2025-05-07");
    expect(animal.intakeBy).toBeUndefined();
  });

  it("carries energy and the indoor-only requirement through to the listing", async () => {
    const html = listing(`
      <div class="summary"><article><div class="entry-content">
        <p><strong>ŽIVAHNOST:</strong> Umirjen</p>
        <p><strong>BIVANJE:</strong> V notranjem okolju</p>
      </div></article></div>`);
    const animal = Animal.parse(
      await provider.normalize(ctx, { ...raw, data: parseDetail(html) }),
    );
    expect(animal.energy).toBe("calm");
    expect(animal.adoptionRequirements).toEqual({ indoorOnly: true });
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
