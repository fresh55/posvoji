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

  it("returns nothing when the field carries no Opis paragraph", () => {
    expect(
      parseDescription("<p><strong>Datum rojstva</strong>: 1. 6. 2026</p>"),
    ).toBeUndefined();
    expect(parseDescription("")).toBeUndefined();
  });
});

describe("parseDetail", () => {
  it("recognises the rabbit and the complete-care medical bundle", () => {
    expect(parseDetail(rabbitHtml)).toEqual({
      name: "Peter Z.",
      species: "rabbit",
      sex: "male",
      breed: undefined,
      birthDate: "2025-10-20",
      intakeDate: "2026-06-23",
      size: undefined,
      status: "available",
      description: "Peter je miren in radoveden zajec.",
      medical: {
        neutered: true,
        microchipped: true,
        vaccinated: true,
      },
      imageUrls: [
        "https://zavetisce.fra1.digitaloceanspaces.com/zivali/26030015.jpg",
      ],
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
});

describe("provider", () => {
  const ref = parseList(listHtml)[2]!;
  const raw = {
    ref,
    fetchedAt: "2026-08-18T10:00:00Z",
    data: parseDetail(rabbitHtml),
  };
  const ctx = { client: new PoliteClient({ userAgent: "test" }), policy };

  it("normalizes a schema-valid rabbit with cacheable photos", async () => {
    const animal = Animal.parse(await provider.normalize(ctx, raw));
    expect(animal).toMatchObject({
      id: "ljubljana:rabbit-uuid",
      species: "rabbit",
      medical: {
        neutered: true,
        microchipped: true,
        vaccinated: true,
      },
      images: [
        {
          sourceUrl:
            "https://zavetisce.fra1.digitaloceanspaces.com/zivali/26030015.jpg",
          rights: "cache-permitted",
        },
      ],
      attribution: "Vir: Zavetišče Ljubljana",
    });
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
