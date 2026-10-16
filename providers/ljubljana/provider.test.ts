import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { loadFixture, PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import provider, {
  parseCmsDate,
  parseDescription,
  parseDetail,
  parseList,
} from "./provider";

const policy = ProviderPolicy.parse(
  parse(readFileSync(new URL("./policy.yaml", import.meta.url), "utf8")),
);
const listHtml = loadFixture(import.meta.url, "list.html");
const rabbitHtml = loadFixture(import.meta.url, "detail-rabbit.html");

describe("policy.yaml", () => {
  it("records the granted facts, photo and description permission", () => {
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
  it("discovers shelter animals and rejects private, malformed and duplicate entries", () => {
    expect(parseList(listHtml)).toEqual([
      {
        sourceAnimalId: "dog-uuid",
        sourceUrl: "https://www.zavetisce-ljubljana.si/zivali/bajsi-26010174",
      },
      {
        sourceAnimalId: "cat-uuid",
        sourceUrl: "https://www.zavetisce-ljubljana.si/zivali/mili",
      },
      {
        sourceAnimalId: "rabbit-uuid",
        sourceUrl: "https://www.zavetisce-ljubljana.si/zivali/peter-26030015",
      },
    ]);
  });

  it("refuses a payload not marked as the shelter catalogue", () => {
    expect(
      parseList(
        '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"page":{"list":{"slug":"oddajo-lastniki"},"pets":[]}}}}</script>',
      ),
    ).toEqual([]);
  });
});

describe("parseCmsDate", () => {
  it.each([
    ["2026-06-22 22:00:00", "2026-06-23"],
    ["2022-02-24 23:00:00", "2022-02-25"],
    ["0202-02-15 22:34:56", undefined],
    ["1899-12-31 23:00:00", undefined],
    ["not a date", undefined],
  ])("%s → %s", (input, expected) => {
    expect(parseCmsDate(input)).toBe(expected);
  });
});

describe("parseDescription", () => {
  it("keeps the Opis text and drops the facts restated beside it", () => {
    expect(
      parseDescription(
        "<p><strong>Opis</strong>: Bajsi je kuža manjše rasti. Je prijazen. </p>" +
          "<p><strong>Datum rojstva</strong>: 19. 3. 2014</p>",
      ),
    ).toBe("Bajsi je kuža manjše rasti. Je prijazen.");
  });

  it("reads the label whether the colon is inside the bold run or after it", () => {
    expect(
      parseDescription("<p><strong>Opis: </strong>Tigrast</p>"),
    ).toBe("Tigrast");
  });

  it("returns nothing when the field carries no Opis paragraph and no prose", () => {
    expect(
      parseDescription(
        "<p><strong>Datum rojstva</strong>: 1. 6. 2026</p><p><strong>Teža: </strong>okoli 20 kg</p>",
      ),
    ).toBeUndefined();
    expect(parseDescription("")).toBeUndefined();
  });

  it("uses the plain prose paragraphs when there is no Opis label at all", () => {
    expect(
      parseDescription(
        "<p><strong>Lex</strong> je starejši pes, ki je bil predan v zavetišče.</p>" +
          "<p>Na povodcu je lepo vodljiv in miren.</p>" +
          "<p><strong>Teža: </strong>okoli 20 kg</p>" +
          "<p><strong>Datum rojstva</strong>: 28. 2. 2015</p>",
      ),
    ).toBe(
      "Lex je starejši pes, ki je bil predan v zavetišče.\n\nNa povodcu je lepo vodljiv in miren.",
    );
  });

  it("keeps the value when the shelter bleeds it into the Opis strong run", () => {
    expect(
      parseDescription("<p><strong>Opis: belo </strong>tigrasta</p>"),
    ).toBe("belo tigrasta");
  });

  it("keeps bold words after the Opis label in the same paragraph", () => {
    expect(
      parseDescription(
        "<p><strong>Opis: bel </strong>pes je <strong>zelo miren</strong> in <strong>prijazen</strong>.</p>",
      ),
    ).toBe("bel pes je zelo miren in prijazen.");
  });

  it("keeps prose paragraphs the shelter tacks on after Opis and drops a trailing label", () => {
    expect(
      parseDescription(
        "<p><strong>Datum rojstva</strong>: 19. 3. 2020</p>" +
          "<p><strong>Opis: </strong>Cezar je star pes.</p>" +
          "<p>Zanj iščemo dom v mirnejšem okolju.</p>" +
          "<p><strong>Teža: </strong>okoli 25 kg</p>",
      ),
    ).toBe("Cezar je star pes.\n\nZanj iščemo dom v mirnejšem okolju.");
  });

  it("drops a label it has never seen but keeps bold words inside prose", () => {
    expect(
      parseDescription(
        "<p><strong>Opis</strong>: Rex je prijazen.</p>" +
          "<p><strong>Čip: 705 123</strong></p>" +
          "<p><strong>Rex</strong> je zelo navezan na ljudi.</p>",
      ),
    ).toBe("Rex je prijazen.\n\nRex je zelo navezan na ljudi.");
  });
});

describe("parseDetail", () => {
  it("does not read a negated care term as the positive claim", () => {
    const negated = [
      ["kastrirana / sterilizirana", "nekastrirana / nesterilizirana"],
      ["mikročipirana", "ni mikročipirana"],
      ["cepljena proti", "necepljena proti"],
    ] as const;
    for (const [positive, negative] of negated) {
      const dogHtml = rabbitHtml.replace('"slug":"ostali"', '"slug":"pes"');
      const html = dogHtml.replace(positive, negative);
      expect(html).not.toBe(dogHtml);
      expect(parseDetail(html).medical).toBeUndefined();
    }
  });

  it.each(["pes", "macka"])("reads visible complete-care evidence for %s", (slug) => {
    expect(parseDetail(rabbitHtml.replace('"slug":"ostali"', `"slug":"${slug}"`)).medical).toEqual({
      neutered: true,
      microchipped: true,
      vaccinated: true,
    });
  });

  it.each(["script", "style", "template", "noscript"])("ignores care claims present only inside %s", (tag) => {
    const dogHtml = rabbitHtml.replace('"slug":"ostali"', '"slug":"pes"');
    const hidden = dogHtml.replace("<section>", `<${tag}>`).replace("</section>", `</${tag}>`);
    expect(parseDetail(hidden).medical).toBeUndefined();
  });

  it("keeps the broad Ostali category without assuming the generic medical bundle applies", () => {
    expect(parseDetail(rabbitHtml)).toEqual({
      sourceAnimalId: "rabbit-uuid",
      name: "Peter Z.",
      species: "other",
      sex: "male",
      breed: undefined,
      birthDate: "2025-10-20",
      intakeDate: "2026-06-23",
      size: undefined,
      status: "available",
      description: "Peter je miren in radoveden zajec.",
      medical: undefined,
      imageUrls: [
        "https://zavetisce.fra1.digitaloceanspaces.com/zivali/26030015.jpg",
      ],
    });
  });

  it("does not label an ornamental pigeon in Ostali as a rabbit", () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({
        props: {
          pageProps: {
            pet: {
              id: "pigeon-uuid",
              title: "Oto",
              type: { slug: "ostali", title: "Druga žival" },
              breed: "okrasni golob",
            },
          },
        },
      }) +
      "</script>";
    expect(parseDetail(html)).toMatchObject({
      species: "other",
      breed: "okrasni golob",
    });
  });

  it("maps trial placement to hold and does not invent medical facts", () => {
    expect(
      parseDetail(loadFixture(import.meta.url, "detail-dog-trial.html")),
    ).toMatchObject({
      name: "Julči",
      species: "dog",
      sex: "female",
      breed: "mešanka",
      size: "large",
      status: "hold",
      medical: undefined,
    });
  });

  it("stays unknown for a CMS state it does not recognise, instead of guessing available", () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({
        props: {
          pageProps: {
            pet: {
              title: "Rex",
              type: { slug: "pes" },
              state: { slug: "posvojen-drugje" },
            },
          },
        },
      }) +
      "</script>";
    expect(parseDetail(html)).toMatchObject({ status: "unknown" });
  });

  it("treats no state as normally listed and available", () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({
        props: {
          pageProps: {
            pet: {
              title: "Rex",
              type: { slug: "pes" },
              state: null,
            },
          },
        },
      }) +
      "</script>";
    expect(parseDetail(html)).toMatchObject({ status: "available" });
  });

  it.each([
    ["2026-07-14 22:00:00", undefined],
    ["2026-07-15 22:00:00", "2026-07-16"],
  ])("does not publish an intake before the animal's birth", (date, intakeDate) => {
    const html = '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({ props: { pageProps: { pet: {
        type: { slug: "macka" }, date, date_of_birth: "2026-07-15 22:00:00",
      } } } }) + "</script>";
    expect(parseDetail(html)).toMatchObject({ birthDate: "2026-07-16", intakeDate });
  });

  it("refuses a page that carries no __NEXT_DATA__ payload", () => {
    expect(() =>
      parseDetail("<!doctype html><html><body><h1>Vzdrževanje</h1></body></html>"),
    ).toThrow("detail page has no pet data");
  });

  it("refuses a payload whose pet is missing", () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({ props: { pageProps: {} } }) +
      "</script>";
    expect(() => parseDetail(html)).toThrow("detail page has no pet data");
  });

  it.each([
    ['"contact":null', '"contact":{"present":true}'],
    ['"slug":"za-oddajo"', '"slug":"oddajo-lastniki"'],
    ['"slug":"za-oddajo"', '"slug":"najdene-zivali"'],
  ])("rejects private or non-adoption details before using their fields", (original, replacement) => {
    const html = rabbitHtml.replace(original, replacement);
    expect(html).not.toBe(rabbitHtml);
    expect(() => parseDetail(html)).toThrow("detail page is not a shelter adoption listing");
  });
});

describe("provider", () => {
  const ref = parseList(listHtml)[2]!;
  const raw = {
    ref,
    fetchedAt: "2026-08-18T10:00:00Z",
    data: parseDetail(rabbitHtml),
  };
  const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };

  it("normalizes a schema-valid Ostali animal with cacheable photos", async () => {
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal).toMatchObject({
      id: "ljubljana:rabbit-uuid",
      species: "other",
      images: [
        {
          sourceUrl:
            "https://zavetisce.fra1.digitaloceanspaces.com/zivali/26030015.jpg",
          rights: "cache-permitted",
        },
      ],
      attribution: "Vir: Zavetišče Ljubljana",
    });
    expect(animal.medical).toBeUndefined();
    expect(animal.shortDescription).toBe("Peter je miren in radoveden zajec.");
  });

  it("discovers through the supplied polite client", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, body: listHtml });
    const refs = await provider.discover({
      policy,
      client: { get } as unknown as PoliteClient,
    });
    expect(get).toHaveBeenCalledWith(policy.source);
    expect(refs).toHaveLength(3);
  });

  it.each([
    "<!doctype html><html><body>Vzdrževanje</body></html>",
    '<script id="__NEXT_DATA__" type="application/json">{invalid}</script>',
    '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"page":{"list":{"slug":"za-oddajo"}}}}}</script>',
    '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"page":{"list":{"slug":"za-oddajo"},"pets":{}}}}}</script>',
    '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"page":{"list":{"slug":"oddajo-lastniki"},"pets":[]}}}}</script>',
  ])("fails discovery closed when the shelter catalogue is absent or malformed", async (body) => {
    const get = vi.fn().mockResolvedValue({ status: 200, body });
    await expect(provider.discover({
      policy,
      client: { get } as unknown as PoliteClient,
    })).rejects.toThrow("list page has no shelter catalogue data");
  });

  it("accepts an explicitly empty shelter catalogue", async () => {
    const body = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"page":{"list":{"slug":"za-oddajo"},"pets":[]}}}}</script>';
    const get = vi.fn().mockResolvedValue({ status: 200, body });
    await expect(provider.discover({
      policy,
      client: { get } as unknown as PoliteClient,
    })).resolves.toEqual([]);
  });

  it("fetches the detail page the ref points at", async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, body: rabbitHtml });
    const raw = await provider.fetch(
      { policy, client: { get } as unknown as PoliteClient },
      ref,
    );
    expect(get).toHaveBeenCalledWith(ref.sourceUrl);
    expect(raw.data).toMatchObject({ sourceAnimalId: "rabbit-uuid" });
  });

  it("keeps Remus when the source's intake year is mistyped, without inventing a date", async () => {
    const ref = {
      sourceAnimalId: "bfaab431-650a-4370-8596-c43a8faf7115",
      sourceUrl: "https://www.zavetisce-ljubljana.si/zivali/remus-26021089",
    };
    const html = '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({ props: { pageProps: { pet: {
        id: ref.sourceAnimalId,
        title: "Remus",
        type: { slug: "macka" },
        type_adoption: { slug: "za-oddajo" },
        date: "0202-02-15 22:34:56",
        date_of_birth: "2026-07-15 22:00:00",
      } } } }) + "</script>";
    const get = vi.fn().mockResolvedValue({ status: 200, body: html });
    const raw = await provider.fetch({ policy, client: { get } as unknown as PoliteClient }, ref);
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal).toMatchObject({
      id: `ljubljana:${ref.sourceAnimalId}`,
      name: "Remus",
      species: "cat",
      birthDate: "2026-07-16",
    });
    expect(animal.intakeDate).toBeUndefined();
  });

  it("refuses a detail page that answers with another animal", async () => {
    const get = vi.fn().mockResolvedValue({
      status: 200,
      body: loadFixture(import.meta.url, "detail-dog-trial.html"),
    });
    await expect(
      provider.fetch(
        { policy, client: { get } as unknown as PoliteClient },
        ref,
      ),
    ).rejects.toThrow("detail page for rabbit-uuid returned dog-uuid");
  });

  it("refuses a same-id animal moved to a private-owner listing", async () => {
    const get = vi.fn().mockResolvedValue({
      status: 200,
      body: rabbitHtml.replace('"slug":"za-oddajo"', '"slug":"oddajo-lastniki"'),
    });
    await expect(provider.fetch(
      { policy, client: { get } as unknown as PoliteClient },
      ref,
    )).rejects.toThrow("detail page is not a shelter adoption listing");
  });

  it("drops photos when policy permission is absent", async () => {
    const restricted = {
      ...policy,
      enabled: false,
      images: "none" as const,
      permission: { status: "none" as const },
    };
    const animal = Animal.parse(
      await provider.normalize({ ...ctx, policy: restricted }, raw),
    );
    expect(animal.images).toEqual([]);
  });
});
