import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { loadFixture } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  fullSizeSrc,
  parseApproximateAgeMonths,
  parseDetail,
  parseList,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);
const dogList = loadFixture(import.meta.url, "list-dogs.html");
const catList = loadFixture(import.meta.url, "list-cats.html");
const dogDetail = loadFixture(import.meta.url, "detail-dog.html");
const catDetail = loadFixture(import.meta.url, "detail-cat.html");
const dogDetailWrapped = loadFixture(import.meta.url, "detail-dog-wrapped.html");

describe("policy.yaml", () => {
  it("matches the enabled provider and records granted permission", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission).toMatchObject({
      status: "granted",
      date: "2026-08-20",
    });
    expect(policy.descriptions).toBe("full-permitted");
    expect(policy.images).toBe("cache-permitted");
    // Private-owner listings stay out of the crawl whatever the grant says.
    expect(policy.crawl.excludePaths).toContain("/privat-oddaja/");
  });
});

describe("parseList", () => {
  it("reads the numeric WordPress post id and rejects private or external URLs", () => {
    expect(parseList(dogList)).toEqual([
      {
        sourceAnimalId: "1131",
        sourceUrl: "https://zavetisce-malahisa.si/psi_za_oddajo/lajka/",
      },
      {
        sourceAnimalId: "1148",
        sourceUrl: "https://zavetisce-malahisa.si/psi_za_oddajo/mamba/",
      },
    ]);
  });

  it("supports the official cat post type", () => {
    expect(parseList(catList)).toEqual([
      {
        sourceAnimalId: "1400",
        sourceUrl: "https://zavetisce-malahisa.si/muce_za_oddajo/mici/",
      },
    ]);
  });
});

describe("fullSizeSrc", () => {
  it("prefers the unsized or unsuffixed candidate over a derived WxH size", () => {
    expect(
      fullSizeSrc(
        "https://zavetisce-malahisa.si/wp-content/uploads/2026/03/lajka-1-184x300.jpg",
        "https://zavetisce-malahisa.si/wp-content/uploads/2026/03/lajka-1-184x300.jpg 184w, https://zavetisce-malahisa.si/wp-content/uploads/2026/03/lajka-1-scaled.jpg 1572w",
      ),
    ).toBe("https://zavetisce-malahisa.si/wp-content/uploads/2026/03/lajka-1-scaled.jpg");
  });

  it("falls back to the widest derived size when nothing is unsuffixed", () => {
    expect(
      fullSizeSrc(undefined, "a-100x100.jpg 100w, a-300x300.jpg 300w"),
    ).toBe("a-300x300.jpg");
  });
});

describe("detail facts", () => {
  it("extracts conservative facts, the featured photo and the description from a dog article", () => {
    expect(parseDetail(dogDetail)).toEqual({
      sourceAnimalId: "1131",
      name: "LAJKA",
      species: "dog",
      sex: "female",
      breed: "belgijska ovčarka",
      approximateAgeMonths: 84,
      size: undefined,
      status: "available",
      description:
        "Nov dom išče psička Lajka, stara 7 let, svetlo rjave barve.\n\nJe belgijska ovčarka. Zelo rada je v družbi ljudi in se dobro razume z drugimi psi.",
      imageUrls: [
        "https://zavetisce-malahisa.si/wp-content/uploads/2026/03/lajka-1-scaled.jpg",
      ],
    });
  });

  it("never reads the previous/next post-navigation photo as this animal's own", () => {
    // Lajka's fixture links to Bobi's photo in its nav; only Lajka's own
    // featured image may appear.
    expect(parseDetail(dogDetail).imageUrls).toHaveLength(1);
  });

  it("recognizes the cat article type", () => {
    expect(parseDetail(catDetail)).toEqual({
      sourceAnimalId: "1400",
      name: "MICI",
      species: "cat",
      sex: "female",
      breed: undefined,
      approximateAgeMonths: 4,
      size: "small",
      status: "available",
      description: "Mucka Mici je stara 4 mesece in je majhne rasti.",
      imageUrls: [
        "https://zavetisce-malahisa.si/wp-content/uploads/2026/04/mici.jpg",
      ],
    });
  });

  it("does not collapse published age ranges into a guessed integer", () => {
    expect(parseApproximateAgeMonths("star približno 8–10 let")).toBeUndefined();
    expect(parseApproximateAgeMonths("stara približno 5-6 mesecev")).toBeUndefined();
    expect(parseApproximateAgeMonths("10-letni srnin pinč")).toBe(120);
  });

  it("does not read a dog as male from a sentence about a male cat companion", () => {
    const html = `<article class="post-9 psi_za_oddajo type-psi_za_oddajo status-publish">
      <header class="entry-header"><h2 class="page-title">REX</h2></header>
      <div class="entry-content">
        <div>Rex ne mara, kadar mačji samec pride blizu njegove skodelice.</div>
      </div>
    </article>`;
    expect(parseDetail(html).sex).toBeUndefined();
  });

  it("stays undefined when both sexes are mentioned, e.g. littermates", () => {
    const html = `<article class="post-10 muce_za_oddajo type-muce_za_oddajo status-publish">
      <header class="entry-header"><h2 class="page-title">SORODNIKA</h2></header>
      <div class="entry-content">
        <div>V leglu sta bila samička in samec, oba enako igriva.</div>
      </div>
    </article>`;
    expect(parseDetail(html).sex).toBeUndefined();
  });

  it("throws a clear error instead of falling back to the slug when the post id is missing", () => {
    const html = `<article class="psi_za_oddajo type-psi_za_oddajo status-publish">
      <header class="entry-header"><h2 class="page-title">BREZ ID-JA</h2></header>
      <div class="entry-content"><div dir="auto">Manjka post-{ID} razred.</div></div>
    </article>`;
    expect(() => parseDetail(html)).toThrow(/post id/i);
  });

  it("reads a paragraph pasted from Facebook once, ignores the emoji image, and keeps only this animal's photo", () => {
    const facts = parseDetail(dogDetailWrapped);
    expect(facts.sourceAnimalId).toBe("1103");
    expect(facts.description).toBe(
      "Roki je kuža, ki je že bil posvojen, a se je vrnil v zavetišče. Danes je vesel in uživa v crkljanju.\n\nRoki je star približno 8 let in je majhne rasti.",
    );
    expect(facts.imageUrls).toEqual([
      "https://zavetisce-malahisa.si/wp-content/uploads/2026/01/roki.jpg",
    ]);
    expect(facts.sex).toBe("male");
    expect(facts.size).toBe("small");
    expect(facts.approximateAgeMonths).toBe(96);
  });
});

describe("provider", () => {
  it("discovers both official adoption sections through the polite client", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: dogList })
      .mockResolvedValueOnce({ status: 200, body: catList });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "https://zavetisce-malahisa.si/psi-za-oddajo/",
      "https://zavetisce-malahisa.si/muce-za-oddajo/",
    ]);
    expect(refs).toHaveLength(3);
  });

  it("rejects a detail ref whose URL falls outside the two adoption paths", async () => {
    await expect(
      provider.fetch(
        { client: { get: vi.fn() } as never, policy },
        {
          sourceAnimalId: "1",
          sourceUrl: "https://zavetisce-malahisa.si/privat_oddajo/zasebni-pes/",
        },
      ),
    ).rejects.toThrow(/refused non-adoption detail URL/);
  });

  it("rejects a detail page whose own post id does not match the list ref", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, body: dogDetail });
    await expect(
      provider.fetch(
        { client: { get } as never, policy },
        {
          sourceAnimalId: "9999",
          sourceUrl: "https://zavetisce-malahisa.si/psi_za_oddajo/lajka/",
        },
      ),
    ).rejects.toThrow(/detail identity mismatch/);
  });

  it("normalizes facts together with the granted photo and description", async () => {
    const ref = parseList(dogList)[0]!;
    const animal = await provider.normalize(
      { client: {} as never, policy },
      {
        ref,
        fetchedAt: "2026-08-19T10:00:00.000Z",
        data: parseDetail(dogDetail),
      },
    );
    expect(Animal.parse(animal)).toMatchObject({
      id: "mala-hisa:1131",
      shelter: {
        id: "mala-hisa",
        name: "Zavetišče Mala hiša",
        city: "Moravske Toplice",
      },
      species: "dog",
      sex: "female",
      approximateAgeMonths: 84,
      status: "available",
      images: [
        {
          sourceUrl:
            "https://zavetisce-malahisa.si/wp-content/uploads/2026/03/lajka-1-scaled.jpg",
          rights: "cache-permitted",
        },
      ],
      shortDescription:
        "Nov dom išče psička Lajka, stara 7 let, svetlo rjave barve.\n\nJe belgijska ovčarka. Zelo rada je v družbi ljudi in se dobro razume z drugimi psi.",
    });
  });

  it("matches the shelter registry", () => {
    const registry = parse(
      readFileSync(new URL("../../data/shelters.yaml", import.meta.url), "utf8"),
    ) as { shelters: Array<{ id: string; name: string; city: string }> };
    expect(registry.shelters.find(({ id }) => id === provider.id)).toMatchObject({
      id: "mala-hisa",
      name: "Zavetišče Mala hiša",
      city: "Moravske Toplice",
    });
  });
});
