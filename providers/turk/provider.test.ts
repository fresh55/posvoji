import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { loadFixture } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  listUrl,
  parseApproximateAgeMonths,
  parseDetail,
  parseList,
  parseMedical,
  parseSex,
  parseSize,
  parseTotalPages,
  stripContact,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);

const dogsPage1 = loadFixture(import.meta.url, "list-dogs-page-1.json");
const dogsPage2 = loadFixture(import.meta.url, "list-dogs-page-2.json");
const cats = loadFixture(import.meta.url, "list-cats.json");
const detailDog = loadFixture(import.meta.url, "detail-dog.json");
const detailLostAndFound = loadFixture(
  import.meta.url,
  "detail-lost-and-found.json",
);

const LIST_URLS = {
  dogsPage1: listUrl(policy.source, 4, 1),
  dogsPage2: listUrl(policy.source, 4, 2),
  cats: listUrl(policy.source, 10, 1),
};

describe("policy.yaml", () => {
  it("records all granted content permissions", () => {
    expect(policy.providerId).toBe(provider.id);
    expect(policy.enabled).toBe(true);
    expect(policy.permission.status).toBe("granted");
    expect(policy.permission.date).toBe("2026-08-19");
    expect(policy.images).toBe("cache-permitted");
    expect(policy.descriptions).toBe("full-permitted");
    expect(policy.ingestion).toBe("api");
  });
});

describe("listUrl", () => {
  it("asks for a full page in a stable order", () => {
    expect(LIST_URLS.dogsPage1).toBe(
      "https://zavetisceturk.com/wp-json/wp/v2/posts" +
        "?categories=4&per_page=100&page=1&orderby=id&order=asc" +
        "&_fields=id,slug,link,title,content,categories",
    );
  });
});

describe("parseTotalPages", () => {
  it.each([
    [{ "x-wp-totalpages": "3" }, 3],
    [{ "x-wp-totalpages": ["2"] }, 2],
    [{ "x-wp-totalpages": "many" }, undefined],
    [{}, undefined],
  ])("%o → %s", (headers, expected) => {
    expect(parseTotalPages(headers)).toBe(expected);
  });
});

describe("parseList", () => {
  it("keys animals by post id and drops the query string the site adds", () => {
    expect(parseList(dogsPage1)).toEqual([
      {
        sourceAnimalId: "4162",
        sourceUrl: "https://zavetisceturk.com/index.php/2026/07/18/lana/",
      },
    ]);
  });

  it("drops a post moved to 'V novem domu' without losing its adoption category", () => {
    expect(parseList(dogsPage1).map((r) => r.sourceAnimalId)).not.toContain("3117");
  });

  it("drops a lost-and-found notice cross-filed into an adoption category", () => {
    expect(parseList(dogsPage2).map((r) => r.sourceAnimalId)).toEqual(["2692"]);
  });

  it("rejects a payload that is not a list of posts", () => {
    expect(() => parseList("{}")).toThrow(/not an array of posts/);
    expect(() => parseList("<html>")).toThrow(/not JSON/);
  });
});

describe("parseApproximateAgeMonths", () => {
  it.each([
    ["stara cca 1 leto išče dom", 12],
    // The trailing half of "1,5 leta" is not the age.
    ["Ocenjena starost je 1,5 leta", 18],
    ["stara 2.5 leti", 30],
    ["Stara cca 1,5 meseca", 2],
    ["Mešanka stara 3 leta, tehta 22kg", 36],
    ["Star je cca 2 leti, je kastriran", 24],
    ["Ocenjena starost je 6 let", 72],
    ["odrasla mešanka, cca 3 leta stara", 36],
    ["Stara cca 9 mesecev", 9],
    // No number, and a stay length is not an age.
    ["odrasel in živel na prostem več let", undefined],
    ["V zavetišču je že 3 leta", undefined],
    ["Prijazen večji kuža", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseApproximateAgeMonths(input)).toBe(expected);
  });
});

describe("parseSex", () => {
  it.each([
    ["Prijazna mešanka večje rasti, stara cca 1 leto", "female"],
    ["mešanček večje rasti, star cca 1 leto", "male"],
    ["Odrasla psica, čaka jo še sterilizacija", "female"],
    ["Dom išče odrasel mačkon, sprejet nekastriran", "male"],
    ["Ocenjena starost je 2 leti, že sterilizirana", "female"],
    // Generic plurals say nothing about this animal.
    ["pri nas lepo sprejme tudi druge muce", undefined],
    ["Veterinarsko urejen čaka na posvojitelje", undefined],
    // "kuža" is the plain word for a dog of either sex, not a sex marker, so
    // naming only other dogs generically settles nothing about this one.
    ["Klif je kuža, odlovljen skupaj z dvema drugima psoma", undefined],
    // Caught alongside a female sibling: the listing names both sexes.
    ["Klif je samček, odlovljen skupaj s psičko", "unknown"],
  ])("%s → %s", (input, expected) => {
    expect(parseSex(input)).toBe(expected);
  });
});

describe("parseSize", () => {
  it.each([
    ["mešanka večje rasti (26kg)", "large"],
    ["Odrasel mešanec srednje rasti. Srednje rasti.", "medium"],
    ["mešanka manjše rasti, begosumna", "small"],
    ["je manjše-srednje rasti", undefined],
    ["Prijazen večji kuža", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseSize(input)).toBe(expected);
  });
});

describe("parseMedical", () => {
  it.each([
    ["Mešanka stara 3 leta, sterilizirana", { neutered: true }],
    ["Star je cca 2 leti, je kastriran", { neutered: true }],
    ["Veterinarsko urejena, vodljiva", undefined],
    // Pending and on-arrival states are not statements about the animal now.
    ["Čaka jo še sterilizacija, sicer veterinarsko urejena", undefined],
    ["V zavetišče sprejet shujšan, nekastriran, pretepen", undefined],
    ["Veterinarsko urejena. FIV-/FELV-", { fiv: "negative", felv: "negative" }],
    ["veterinarsko urejen, aids+", { fiv: "positive" }],
  ])("%s → %o", (input, expected) => {
    expect(parseMedical(input)).toEqual(expected);
  });
});

describe("stripContact", () => {
  it("cuts the mailbox, the mobile number and the Facebook link", () => {
    expect(
      stripContact(
        "Mešanka stara 3 leta, je veterinarsko urejena. " +
          "Resni posvojitelji nam napišite mail na zavetisce@example.org " +
          "https://www.facebook.com/reel/1 " +
          "Za več info pokliče na 070 000 000.",
      ),
    ).toBe("Mešanka stara 3 leta, je veterinarsko urejena.");
  });

  it("returns nothing when a listing is only boilerplate", () => {
    expect(stripContact("Resni posvojitelji nam napišite mail.")).toBeUndefined();
  });
});

describe("parseDetail", () => {
  it("reads the facts a listing states and nothing more", () => {
    expect(parseDetail(detailDog)).toEqual({
      name: "Byorn",
      species: "dog",
      sex: "male",
      approximateAgeMonths: 12,
      size: "large",
      medical: undefined,
      description:
        "Dom išče Byorn, mešanček večje rasti (27kg), star cca 1 leto. " +
        "Prijazen in rad z ljudmi. Veterinarsko urejen.",
      imageUrls: [],
    });
  });

  it("keeps only on-site upload images and drops their query strings", () => {
    const lana = parseDetail(JSON.stringify(JSON.parse(dogsPage1)[0]));
    expect(lana.imageUrls).toEqual([
      "https://zavetisceturk.com/wp-content/uploads/2026/07/lana.jpg",
    ]);
  });

  it("separates <br>-broken sentences so only the contact line is cut", () => {
    const pupa = parseDetail(JSON.stringify(JSON.parse(dogsPage2)[0]));
    expect(pupa).toMatchObject({
      sex: "female",
      approximateAgeMonths: 36,
      // "manjše-srednje" straddles two buckets.
      size: undefined,
      medical: { neutered: true },
    });
    // Without the block break the whole paragraph reads as one sentence, and
    // the phone number at the end takes the animal's description with it.
    expect(pupa.description).toBe(
      "Pupa je bila ujeta na lovilko. Zaenkrat še ne socializirana. " +
        "Ocenjena starost je 3 leta, manjše-srednje rasti, že sterilizirana.",
    );
  });

  it("leaves photo captions out of the description", () => {
    const pupa = parseDetail(JSON.stringify(JSON.parse(dogsPage2)[0]));
    expect(pupa.description).not.toContain("Penelope");
  });

  it("rejects a post cross-filed into a lost-and-found category", () => {
    // parsePosts already keeps posts like this out of the list. This is the
    // single-post payload the fallback fetch reads directly, and it carries
    // no such filter of its own, so parseDetail has to enforce it too rather
    // than hand back a full listing (description included) for a notice that
    // can carry a private phone number.
    expect(() => parseDetail(detailLostAndFound)).toThrow(
      /post 2500 is not in an adoptable category/,
    );
  });
});

describe("discover", () => {
  function client(pages: Record<string, { body: string; totalPages?: number }>) {
    return vi.fn(async (url: string) => {
      const page = pages[url];
      if (!page) return { status: 404, body: null, notModified: false, headers: {} };
      return {
        status: 200,
        body: page.body,
        notModified: false,
        headers:
          page.totalPages === undefined
            ? {}
            : { "x-wp-totalpages": String(page.totalPages) },
      };
    });
  }

  it("follows X-WP-TotalPages through every category", async () => {
    const get = client({
      [LIST_URLS.dogsPage1]: { body: dogsPage1, totalPages: 2 },
      [LIST_URLS.dogsPage2]: { body: dogsPage2, totalPages: 2 },
      [LIST_URLS.cats]: { body: cats, totalPages: 1 },
    });
    const refs = await provider.discover({ client: { get } as never, policy });

    expect(get.mock.calls.map(([url]) => url)).toEqual([
      LIST_URLS.dogsPage1,
      LIST_URLS.dogsPage2,
      LIST_URLS.cats,
    ]);
    // The second dog page is where the animals a first-page-only reader loses
    // would be: without it Pupa never reaches the dataset.
    expect(refs.map((r) => r.sourceAnimalId)).toEqual([
      "4162",
      "2692",
      "4159",
      "3909",
    ]);
  });

  it("stops after one page when the API reports one", async () => {
    const get = client({
      [LIST_URLS.dogsPage1]: { body: dogsPage1, totalPages: 1 },
      [LIST_URLS.cats]: { body: cats, totalPages: 1 },
    });
    await provider.discover({ client: { get } as never, policy });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      LIST_URLS.dogsPage1,
      LIST_URLS.cats,
    ]);
  });

  it("fails loudly rather than returning a partial catalogue", async () => {
    const get = client({});
    await expect(
      provider.discover({ client: { get } as never, policy }),
    ).rejects.toThrow(/list fetch failed with HTTP 404/);
  });

  // A page of exactly per_page posts, which is what the API returns whenever
  // another page follows. Built here rather than saved as a fixture: only the
  // count matters, and a hundred real listings is a page mirror.
  const fullPage = JSON.stringify(
    Array.from({ length: 100 }, (_, index) => ({
      id: 5000 + index,
      link: `https://zavetisceturk.com/index.php/2026/07/18/pes-${index}/`,
      title: { rendered: `Pes ${index}` },
      content: { rendered: "<p>Mešanec, star cca 2 leti.</p>" },
      categories: [4],
    })),
  );

  it("refuses a full page whose X-WP-TotalPages header went missing", async () => {
    // A proxy stripping the header used to default the count to one page,
    // which cuts a 150-animal catalogue at 100 quietly enough for the removal
    // guard downstream to accept the loss as adoptions.
    const get = client({ [LIST_URLS.dogsPage1]: { body: fullPage } });
    await expect(
      provider.discover({ client: { get } as never, policy }),
    ).rejects.toThrow(
      /returned a full page without a usable X-WP-TotalPages header/,
    );
  });

  it("keeps reading a full page that does carry the header", async () => {
    const get = client({
      [LIST_URLS.dogsPage1]: { body: fullPage, totalPages: 1 },
      [LIST_URLS.cats]: { body: cats, totalPages: 1 },
    });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(refs).toHaveLength(102);
  });

  it("treats a short page without the header as the only page", async () => {
    const get = client({
      [LIST_URLS.dogsPage1]: { body: dogsPage1 },
      [LIST_URLS.cats]: { body: cats },
    });
    const refs = await provider.discover({ client: { get } as never, policy });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      LIST_URLS.dogsPage1,
      LIST_URLS.cats,
    ]);
    expect(refs.map((r) => r.sourceAnimalId)).toEqual(["4162", "4159", "3909"]);
  });

  it("refuses a 200 body that is not a list of posts", async () => {
    const get = client({
      [LIST_URLS.dogsPage1]: { body: "{}", totalPages: 1 },
    });
    await expect(
      provider.discover({ client: { get } as never, policy }),
    ).rejects.toThrow(/not an array of posts/);
  });
});

describe("fetch", () => {
  it("serves an animal from the payload discover already received", async () => {
    const discoverGet = vi.fn(async (url: string) => ({
      status: 200,
      body: url === LIST_URLS.cats ? cats : dogsPage1,
      notModified: false,
      headers: { "x-wp-totalpages": "1" },
    }));
    const refs = await provider.discover({
      client: { get: discoverGet } as never,
      policy,
    });

    const get = vi.fn();
    const raw = await provider.fetch({ client: { get } as never, policy }, refs[0]!);
    expect(get).not.toHaveBeenCalled();
    expect(raw.data).toMatchObject({ name: "Lana", species: "dog", size: "large" });
  });

  it("falls back to the single-post endpoint for an animal it has not seen", async () => {
    const postUrl =
      "https://zavetisceturk.com/wp-json/wp/v2/posts/4145" +
      "?_fields=id,slug,link,title,content,categories";
    const get = vi.fn(async (url: string) => ({
      status: url === postUrl ? 200 : 404,
      body: url === postUrl ? detailDog : null,
      notModified: false,
      headers: {},
    }));
    const raw = await provider.fetch(
      { client: { get } as never, policy },
      {
        sourceAnimalId: "4145",
        sourceUrl: "https://zavetisceturk.com/index.php/2026/07/18/byorn/",
      },
    );
    expect(get.mock.calls.map(([url]) => url)).toEqual([postUrl]);
    expect(raw.data).toMatchObject({ name: "Byorn", sex: "male" });
  });

  it("throws instead of returning a lost-and-found post the fallback fetched directly", async () => {
    const postUrl =
      "https://zavetisceturk.com/wp-json/wp/v2/posts/2500" +
      "?_fields=id,slug,link,title,content,categories";
    const get = vi.fn(async (url: string) => ({
      status: url === postUrl ? 200 : 404,
      body: url === postUrl ? detailLostAndFound : null,
      notModified: false,
      headers: {},
    }));
    await expect(
      provider.fetch(
        { client: { get } as never, policy },
        {
          sourceAnimalId: "2500",
          sourceUrl:
            "https://zavetisceturk.com/index.php/2022/11/03/pogresan-placeholder/",
        },
      ),
    ).rejects.toThrow(/post 2500 is not in an adoptable category/);
  });

  it("leaves the normal cached path unaffected by the fallback's extra check", async () => {
    // Same as the "serves an animal from the payload discover already
    // received" case above: discover() only ever caches posts parsePosts has
    // already kept, so the eligibility check the fallback needs never
    // triggers here.
    const discoverGet = vi.fn(async (url: string) => ({
      status: 200,
      body: url === LIST_URLS.cats ? cats : dogsPage1,
      notModified: false,
      headers: { "x-wp-totalpages": "1" },
    }));
    const refs = await provider.discover({
      client: { get: discoverGet } as never,
      policy,
    });

    const get = vi.fn();
    const raw = await provider.fetch({ client: { get } as never, policy }, refs[0]!);
    expect(get).not.toHaveBeenCalled();
    expect(raw.data).toMatchObject({ name: "Lana", species: "dog" });
  });
});

describe("normalize", () => {
  const raw = {
    ref: {
      sourceAnimalId: "4145",
      sourceUrl: "https://zavetisceturk.com/index.php/2026/07/18/byorn/",
    },
    fetchedAt: "2026-08-19T06:00:00.000Z",
    data: parseDetail(detailDog),
  };

  it("produces a schema-valid Animal carrying only what the listing states", async () => {
    const animal = Animal.parse(
      await provider.normalize({ client: {} as never, policy }, raw),
    );
    expect(animal).toMatchObject({
      id: "turk:4145",
      shelter: { id: "turk", name: "Zavetišče Turk", city: "Novo mesto" },
      name: "Byorn",
      species: "dog",
      sex: "male",
      approximateAgeMonths: 12,
      size: "large",
      status: "available",
      attribution: "Vir: Zavetišče Turk",
    });
    // Permission covers the description, not the mailbox and the Facebook
    // line the listing ends on.
    expect(animal.shortDescription).toBe(
      "Dom išče Byorn, mešanček večje rasti (27kg), star cca 1 leto. " +
        "Prijazen in rad z ljudmi. Veterinarsko urejen.",
    );
    // A publication date is not an intake date.
    expect(animal.intakeDate).toBeUndefined();
  });

  it("marks the listing photos cacheable", async () => {
    const animal = Animal.parse(
      await provider.normalize(
        { client: {} as never, policy },
        {
          ref: {
            sourceAnimalId: "4162",
            sourceUrl: "https://zavetisceturk.com/index.php/2026/07/18/lana/",
          },
          fetchedAt: "2026-08-19T06:00:00.000Z",
          data: parseDetail(JSON.stringify(JSON.parse(dogsPage1)[0])),
        },
      ),
    );
    expect(animal.images).toEqual([
      {
        sourceUrl: "https://zavetisceturk.com/wp-content/uploads/2026/07/lana.jpg",
        rights: "cache-permitted",
      },
    ]);
    expect(animal.sex).toBe("female");
  });

  it("drops photos and descriptions again if the grant is ever narrowed", async () => {
    const narrowed = {
      ...policy,
      images: "none" as const,
      descriptions: "facts-only" as const,
    };
    const animal = Animal.parse(
      await provider.normalize({ client: {} as never, policy: narrowed }, raw),
    );
    expect(animal.images).toEqual([]);
    expect(animal.shortDescription).toBeUndefined();
    // The facts the shelter states survive the narrowing.
    expect(animal).toMatchObject({ sex: "male", approximateAgeMonths: 12 });
  });
});
