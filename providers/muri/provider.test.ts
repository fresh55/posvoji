import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadFixture, PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  fullSizeSrc,
  parseAgeMonths,
  parseCompatibility,
  parseDetail,
  parseEnergy,
  parseList,
  parseSlovenianDate,
  resolveAgeMonths,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);

const listHtml = loadFixture(import.meta.url, "list.html");
const detailHtml = loadFixture(import.meta.url, "detail.html");
const minimalHtml = loadFixture(import.meta.url, "detail-minimal.html");
const carouselHtml = loadFixture(import.meta.url, "detail-carousel.html");
const ownerSurrenderHtml = loadFixture(
  import.meta.url,
  "detail-owner-surrender.html",
);

const raw = {
  ref: {
    sourceAnimalId: "16120",
    sourceUrl: "https://zavodmuri.si/Project/archie",
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
  it("keeps adoptable cards and skips sponsorship-only, adopted, duplicate, off-site and id-less ones", () => {
    expect(parseList(listHtml)).toEqual([
      {
        sourceAnimalId: "16836",
        sourceUrl: "https://zavodmuri.si/Project/coko-lina",
      },
      {
        sourceAnimalId: "16120",
        sourceUrl: "https://zavodmuri.si/Project/archie",
      },
    ]);
  });

  // The theme renders up to 100 cards per page with no pagination below that,
  // so a page that fills the cap could be silently truncating the catalogue.
  // A fixture with 100 real cards is impractical, so this generates the
  // smallest markup that still counts: bare article.project elements.
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

describe("parseAgeMonths", () => {
  it.each([
    ["15 let", 180],
    ["3 leta", 36],
    ["1 leto", 12],
    ["3 mesece", 3],
    ["10 mesecev", 10],
    ["7 let in 1 mesec", 85],
    ["1 leto in pol", 18],
    ["2 meseca in pol", 2],
    ["manj kot 1 leto", undefined],
    ["1,5 leta", undefined],
    ["neznana", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseAgeMonths(input)).toBe(expected);
  });
});

describe("parseSlovenianDate", () => {
  it.each([
    ["21.7.2025", "2025-07-21"],
    ["31.07.2026", "2026-07-31"],
    ["11.6..2025", "2025-06-11"],
    ["29. 10. 2019", "2019-10-29"],
    ["27/10/2025", "2025-10-27"],
    [" 19-11-2025. ", "2025-11-19"],
    ["32.13.2026", undefined],
    ["objavljeno 21.7.2025", undefined],
    ["2025-07-21", undefined],
    ["kmalu", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseSlovenianDate(input)).toBe(expected);
  });
});

describe("parseCompatibility", () => {
  it.each([
    ["ok", "yes"],
    ["Ok", "yes"],
    ["da", "yes"],
    ["DA", "yes"],
    ["ne", "no"],
    ["ni preverjeno", undefined],
    ["neznano", undefined],
    ["", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseCompatibility(input)).toBe(expected);
  });
});

describe("parseEnergy", () => {
  it.each([
    ["miren", "calm"],
    ["Umirjena", "calm"],
    ["zelo aktiven in poskočen", "lively"],
    ["živahna, radovedna", "lively"],
    // Adjectives that describe something other than tempo.
    ["prijazen", undefined],
    ["radoveden in prijazen", undefined],
    // Restless is not calm, and shares no whole word with it.
    ["nemiren", undefined],
    // A negated row says what the animal is not.
    ["ni miren", undefined],
    ["ne preveč živahen", undefined],
    // Both tempos at once is a contradiction, not a level.
    ["miren doma, živahen na sprehodu", undefined],
    ["", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseEnergy(input)).toBe(expected);
  });
});

describe("fullSizeSrc", () => {
  const original = "https://x.si/a/IMG_1.jpeg";
  const derived = "https://x.si/a/IMG_1-820x1093.jpeg";

  it("prefers the unsized original when src already is one", () => {
    expect(fullSizeSrc(original, `${original} 738w, ${derived} 820w`)).toBe(original);
  });

  it("finds the original in the srcset when src is a derived size", () => {
    expect(fullSizeSrc(derived, `${derived} 820w, ${original} 1200w`)).toBe(original);
  });

  it("falls back to the widest derived size when no original is offered", () => {
    expect(
      fullSizeSrc(
        "https://x.si/a/IMG_1-580x773.jpeg",
        "https://x.si/a/IMG_1-580x773.jpeg 580w, https://x.si/a/IMG_1-1160x1547.jpeg 1160w",
      ),
    ).toBe("https://x.si/a/IMG_1-1160x1547.jpeg");
  });

  it("uses src alone when there is no srcset, and gives up when there is neither", () => {
    expect(fullSizeSrc(derived, undefined)).toBe(derived);
    expect(fullSizeSrc(undefined, undefined)).toBeUndefined();
  });
});

describe("parseDetail", () => {
  it("extracts facts, photos and vet status from a gallery-format dog page", () => {
    expect(parseDetail(detailHtml)).toEqual({
      name: "Archie",
      species: "dog",
      status: "available",
      sex: "male",
      // The sidebar's current age wins over the stale "starost 13 let" tag.
      ageMonths: 180,
      intakeAgeMonths: undefined,
      intakeDate: "2025-07-21",
      foundPlace: undefined,
      description:
        "Archie je seniorček majhne rasti, ki je zelo aktiven in poskočen.\n\n" +
        "Navkljub dejstvu, da ima neozdravljivo bolezen – levkemijo, je pravzaprav pravi fenomen.\n\n" +
        "Vajen je bivanja z mucami in drugimi psi.",
      medical: {
        vaccinated: true,
        microchipped: true,
        neutered: true,
        fiv: "negative",
        felv: "negative",
      },
      goodWith: { cats: "yes", dogs: "yes" },
      // "Značaj: prijazen" describes the animal but not its tempo, so no
      // level is read even though the description elsewhere says "aktiven".
      energy: undefined,
      imageUrls: [
        "https://zavodmuri.si/wp-content/uploads/2025/07/1000057076.jpg",
        "https://zavodmuri.si/wp-content/uploads/2025/07/1000026680-scaled.jpg",
      ],
    });
  });

  it("reads an energy level when Značaj states one outright", () => {
    const html = detailHtml.replace(
      ">prijazen<",
      ">prijazen, umirjen in ubogljiv<",
    );
    expect(parseDetail(html).energy).toBe("calm");
  });

  it("reads the intake-age layout of a standard-format cat page and drops the boilerplate appeals", () => {
    expect(parseDetail(minimalHtml)).toEqual({
      name: "Mercedes",
      species: "cat",
      status: "available",
      sex: "female",
      // "starost manj kot 1 leto" is an upper bound, not an age.
      ageMonths: undefined,
      intakeAgeMonths: 3,
      intakeDate: "2026-07-31",
      foundPlace: "Vransko",
      description:
        "Mercedes je trimesečna muca, ki je k nam prišla po nenavadnem in nevarnem pripetljaju.\n\n" +
        "POSEBNOSTI:\n\n– mlada, trimesečna muca\n\n– igriva in radovedna",
      medical: undefined,
      goodWith: undefined,
      imageUrls: [
        "https://zavodmuri.si/wp-content/uploads/2026/08/MERCEDES-LUNA.jpg",
      ],
    });
  });

  it("maps the explicit owner-surrender date to the shelter intake date", () => {
    expect(parseDetail(ownerSurrenderHtml)).toEqual({
      name: "Lucky",
      species: "cat",
      status: "available",
      sex: "male",
      ageMonths: undefined,
      intakeAgeMonths: 48,
      intakeDate: "2025-10-27",
      foundPlace: undefined,
      description: undefined,
      medical: undefined,
      goodWith: undefined,
      imageUrls: [],
    });
  });

  it("normalizes cosmetic label changes and falls back from an invalid preferred value", () => {
    const html = `
      <article class="project pj-categs-isce-dom pj-categs-macke">
        <h2 class="cmsms_project_title">Testna muca</h2>
        <div class="project_features_item">
          <div class="project_features_item_title"> Spol: </div>
          <div class="project_features_item_desc"> samica </div>
        </div>
        <div class="project_features_item">
          <div class="project_features_item_title">Datum   sprejema :</div>
          <div class="project_features_item_desc">ni znano</div>
        </div>
        <div class="project_features_item">
          <div class="project_features_item_title">
            Datum oddaje   s strani lastnikov:
          </div>
          <div class="project_features_item_desc">27 / 10 / 2025.</div>
        </div>
      </article>`;

    const facts = parseDetail(html);
    expect(facts.sex).toBe("female");
    expect(facts.intakeDate).toBe("2025-10-27");
  });

  it("never treats an unrelated page date as an intake date", () => {
    const html = `
      <article class="project pj-categs-isce-dom pj-categs-macke">
        <div class="project_features_item">
          <div class="project_features_item_title">Datum objave</div>
          <div class="project_features_item_desc">21. 7. 2025</div>
        </div>
      </article>`;

    expect(parseDetail(html).intakeDate).toBeUndefined();
  });

  it("reads carousel photos that no lightbox anchor links, at full size", () => {
    const facts = parseDetail(carouselHtml);
    expect(facts.name).toBe("Čoko-Lina");
    expect(facts.species).toBe("dog");
    expect(facts.intakeDate).toBe("2025-11-19");
    expect(facts.imageUrls).toEqual([
      // src was already the original.
      "https://zavodmuri.si/wp-content/uploads/2025/12/IMG_8451.jpeg",
      // The original came from the srcset, not from the derived src.
      "https://zavodmuri.si/wp-content/uploads/2025/12/20251222_104236.jpg",
      // No srcset to improve on, so the derived src stands.
      "https://zavodmuri.si/wp-content/uploads/2025/12/IMG_7917-820x1093.jpeg",
    ]);
  });

  it("lets v_novem_domu win over a leftover išče-dom tag", () => {
    const html =
      '<article class="project pj-categs-isce-dom pj-categs-macke pj-categs-v_novem_domu"></article>';
    expect(parseDetail(html).status).toBe("adopted");
  });

  it("maps only the recognized Mačja/Pasja družba values and drops a hedged one", () => {
    const html = `
      <article class="project pj-categs-isce-dom pj-categs-macke">
        <div class="project_features_item">
          <div class="project_features_item_title">Mačja družba</div>
          <div class="project_features_item_desc">ni preverjeno</div>
        </div>
        <div class="project_features_item">
          <div class="project_features_item_title">Pasja družba</div>
          <div class="project_features_item_desc">ne</div>
        </div>
      </article>`;

    expect(parseDetail(html).goodWith).toEqual({ dogs: "no" });
  });

  it("omits goodWith entirely when the page carries no compatibility rows", () => {
    expect(parseDetail(carouselHtml).goodWith).toBeUndefined();
  });

  it("degrades to unknown without any status signal", () => {
    expect(parseDetail('<article class="project pj-categs-macke"></article>').status).toBe(
      "unknown",
    );
  });
});

describe("resolveAgeMonths", () => {
  it.each([
    // A stated current age always wins.
    [{ ageMonths: 180, intakeAgeMonths: 3, intakeDate: "2026-07-31" }, "2026-08-16T06:00:00Z", 180],
    // Intake age plus the full months elapsed since intake.
    [{ intakeAgeMonths: 3, intakeDate: "2026-07-31" }, "2026-08-16T06:00:00Z", 3],
    [{ intakeAgeMonths: 3, intakeDate: "2026-07-31" }, "2026-11-05T06:00:00Z", 6],
    // A crawl date before the intake date clamps instead of de-aging.
    [{ intakeAgeMonths: 3, intakeDate: "2026-07-31" }, "2026-07-01T06:00:00Z", 3],
    [{ intakeAgeMonths: 3 }, "2026-08-16T06:00:00Z", undefined],
    [{}, "2026-08-16T06:00:00Z", undefined],
  ])("%o at %s → %s", (facts, fetchedAt, expected) => {
    expect(resolveAgeMonths(facts, fetchedAt)).toBe(expected);
  });
});

describe("discover", () => {
  it("crawls both species pages off the policy source and merges refs by post id", async () => {
    const fetched: string[] = [];
    const client = {
      get: async (url: string) => {
        fetched.push(url);
        return { status: 200, body: listHtml, notModified: false, headers: {} };
      },
    } as unknown as PoliteClient;
    const refs = await provider.discover({ client, policy });
    expect(fetched).toEqual([
      "https://zavodmuri.si/posvojitev/iscejo-dom/psi",
      "https://zavodmuri.si/posvojitev/iscejo-dom/muce",
    ]);
    // The same fixture served twice must not double the animals.
    expect(refs).toEqual(parseList(listHtml));
  });
});

describe("normalize", () => {
  const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };

  it("produces a schema-valid Animal with cacheable images and description", async () => {
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal.id).toBe("muri:16120");
    expect(animal.species).toBe("dog");
    expect(animal.status).toBe("available");
    expect(animal.approximateAgeMonths).toBe(180);
    expect(animal.images).toEqual([
      {
        sourceUrl: "https://zavodmuri.si/wp-content/uploads/2025/07/1000057076.jpg",
        rights: "cache-permitted",
      },
      {
        sourceUrl:
          "https://zavodmuri.si/wp-content/uploads/2025/07/1000026680-scaled.jpg",
        rights: "cache-permitted",
      },
    ]);
    expect(animal.shortDescription).toContain("Archie je seniorček");
    expect(animal.attribution).toBe(policy.attribution);
    expect(animal.goodWith).toEqual({ cats: "yes", dogs: "yes" });
  });

  it("ages an intake-age-only animal forward to the crawl date", async () => {
    const minimalRaw = {
      ref: {
        sourceAnimalId: "18248",
        sourceUrl: "https://zavodmuri.si/Project/mercedes",
      },
      fetchedAt: "2026-11-05T06:00:00Z",
      data: parseDetail(minimalHtml),
    };
    const animal = Animal.parse(await provider.normalize(ctx, minimalRaw));
    expect(animal.species).toBe("cat");
    expect(animal.approximateAgeMonths).toBe(6);
    expect(animal.intakeDate).toBe("2026-07-31");
    expect(animal.originMunicipality).toBe("Vransko");
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
