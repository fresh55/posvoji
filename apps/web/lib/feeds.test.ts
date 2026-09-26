// @vitest-environment jsdom

import type { Animal } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import { GET as slovenianFeed, generateStaticParams as slovenianFiles } from "@/app/(sl)/nove-objave/[feed]/route";
import { GET as englishFeed, generateStaticParams as englishFiles } from "@/app/(en)/en/new-listings/[feed]/route";
import { animalPath } from "./animal-path";
import {
  buildFeed,
  FEED_LIMIT,
  feedAnimals,
  feedLinks,
  feedPath,
  feedResponse,
  withFeedLinks,
} from "./feeds";
import { staticPageMetadata } from "./site-metadata";

const ATOM = "http://www.w3.org/2005/Atom";
const GENERATED_AT = "2026-09-25T08:11:57.697Z";

function animal(
  id: string,
  firstSeenAt: string,
  rest: Partial<Animal> = {},
): Animal {
  return {
    id,
    source: {
      providerId: "macja-hisa",
      sourceUrl: `https://www.macjahisa.si/posvojitev/${id}`,
      fetchedAt: GENERATED_AT,
      firstSeenAt,
      lastSeenAt: GENERATED_AT,
    },
    shelter: { id: "macja-hisa", name: "Zavetišče Mačja hiša", city: "Celje" },
    name: id[0]!.toUpperCase() + id.slice(1),
    species: "cat",
    status: "available",
    images: [],
    attribution: "Foto in opis: Mačja hiša",
    ...rest,
  };
}

/** Parsed the way a feed reader parses it, strictly: a document that is not
 *  well-formed comes back as a parsererror and not as a feed. */
function parse(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
  return document;
}

function text(parent: Element | Document, name: string): string | undefined {
  return parent.getElementsByTagNameNS(ATOM, name)[0]?.textContent ?? undefined;
}

function entries(document: Document): Element[] {
  return Array.from(document.getElementsByTagNameNS(ATOM, "entry"));
}

describe("feedAnimals", () => {
  it("takes the last 30 days, newest first, ties by id", () => {
    const picked = feedAnimals(
      [
        animal("old", "2026-08-25T08:00:00.000Z"),
        animal("edge", "2026-08-26T08:12:00.000Z"),
        animal("b", "2026-09-22T10:00:00.000Z"),
        animal("a", "2026-09-22T10:00:30.000Z"),
        animal("newest", "2026-09-24T18:00:00.000Z"),
      ],
      GENERATED_AT,
      "all",
    );

    // "a" and "b" were listed in the same minute, which is the listing time's
    // unit (lib/animal.ts), so they tie and the id decides.
    expect(picked.map(({ id }) => id)).toEqual(["newest", "a", "b", "edge"]);
  });

  it("carries only animals a visitor can adopt now", () => {
    const picked = feedAnimals(
      [
        animal("free", "2026-09-20T10:00:00.000Z"),
        animal("unsure", "2026-09-20T10:00:00.000Z", { status: "unknown" }),
        animal("held", "2026-09-21T10:00:00.000Z", { status: "hold" }),
        animal("reserved", "2026-09-21T10:00:00.000Z", { status: "reserved" }),
        animal("adopted", "2026-09-21T10:00:00.000Z", { status: "adopted" }),
      ],
      GENERATED_AT,
      "all",
    );

    expect(picked.map(({ id }) => id)).toEqual(["free", "unsure"]);
  });

  it("splits by the species tabs, with rabbits under the other animals", () => {
    const zoo = [
      animal("rex", "2026-09-20T10:00:00.000Z", { species: "dog" }),
      animal("luna", "2026-09-20T10:00:00.000Z", { species: "cat" }),
      animal("zajko", "2026-09-20T10:00:00.000Z", { species: "rabbit" }),
      animal("ptic", "2026-09-20T10:00:00.000Z", { species: "other" }),
    ];

    expect(feedAnimals(zoo, GENERATED_AT, "dog").map(({ id }) => id)).toEqual(["rex"]);
    expect(feedAnimals(zoo, GENERATED_AT, "cat").map(({ id }) => id)).toEqual(["luna"]);
    expect(feedAnimals(zoo, GENERATED_AT, "other").map(({ id }) => id)).toEqual([
      "ptic",
      "zajko",
    ]);
  });

  it("stops at the limit", () => {
    const many = Array.from({ length: FEED_LIMIT + 10 }, (_, index) =>
      animal(`cat-${String(index).padStart(3, "0")}`, "2026-09-20T10:00:00.000Z"),
    );

    expect(feedAnimals(many, GENERATED_AT, "all")).toHaveLength(FEED_LIMIT);
  });
});

describe("buildFeed", () => {
  const luna = animal("luna", "2026-09-22T10:05:30.000Z", {
    sex: "female",
    birthDate: "2024-05-07",
    shortDescription: "Luna je mirna muca, ki rada spi na soncu.",
    images: [
      {
        sourceUrl: "https://www.macjahisa.si/luna.jpg",
        cachedUrl: "/media/animals/luna.webp",
        rights: "cache-permitted",
      },
    ],
  });
  const feed = buildFeed({
    dataset: { generatedAt: GENERATED_AT, animals: [luna] },
    locale: "sl",
    scope: "all",
  });
  const document = parse(feed);

  it("is an Atom feed with an id, a title, a date and its own address", () => {
    const root = document.documentElement;
    expect(root.localName).toBe("feed");
    expect(root.namespaceURI).toBe(ATOM);
    expect(root.getAttribute("xml:lang")).toBe("sl");
    expect(text(document, "id")).toBe("https://posvoji.si/nove-objave/vse.xml");
    expect(text(document, "title")).toBe("Nove objave na Posvoji.si");
    expect(text(document, "updated")).toBe(GENERATED_AT);
    const links = Array.from(root.children).filter(
      (child) => child.localName === "link",
    );
    expect(
      links.map((link) => [link.getAttribute("rel"), link.getAttribute("href")]),
    ).toEqual([
      ["self", "https://posvoji.si/nove-objave/vse.xml"],
      // The results page it is a copy of, in the same order.
      ["alternate", "https://posvoji.si/?razvrsti=objave"],
    ]);
  });

  it("gives each entry a stable id, the listing date and the animal's page", () => {
    const [entry] = entries(document);
    expect(text(entry!, "id")).toBe("tag:posvoji.si,2026-09-26:sl/luna");
    expect(text(entry!, "title")).toBe("Luna");
    // The listing time as the grid reads it, to the minute.
    expect(text(entry!, "published")).toBe("2026-09-22T10:05:00.000Z");
    expect(text(entry!, "updated")).toBe("2026-09-22T10:05:00.000Z");
    const links = Array.from(entry!.getElementsByTagNameNS(ATOM, "link"));
    expect(
      links.map((link) => [link.getAttribute("rel"), link.getAttribute("href")]),
    ).toEqual([
      ["alternate", `https://posvoji.si${animalPath(luna, "sl")}`],
      ["via", "https://www.macjahisa.si/posvojitev/luna"],
    ]);
    const category = entry!.getElementsByTagNameNS(ATOM, "category")[0];
    expect(category?.getAttribute("term")).toBe("cat");
    expect(category?.getAttribute("label")).toBe("Mačka");
  });

  it("says what the card says, and names the shelter and its town", () => {
    expect(text(entries(document)[0]!, "summary")).toBe(
      "Mačka · starost\u00a02\u00a0leti · Zavetišče Mačja hiša, Celje",
    );
  });

  // Facts only: the shelter's words and photographs are licensed to be shown
  // on this site, not handed on.
  it("carries no description and no photograph", () => {
    expect(feed).not.toContain("mirna muca");
    expect(feed).not.toContain("luna.jpg");
    expect(feed).not.toContain("/media/");
    expect(document.getElementsByTagNameNS(ATOM, "content")).toHaveLength(0);
  });

  it("leaves off a town the shelter's name already carries", () => {
    const horjul = animal("dash", "2026-09-22T10:00:00.000Z", {
      species: "dog",
      approximateAgeMonths: 14,
      shelter: { id: "horjul", name: "Zavetišče Horjul", city: "Horjul" },
    });
    const one = parse(
      buildFeed({
        dataset: { generatedAt: GENERATED_AT, animals: [horjul] },
        locale: "sl",
        scope: "dog",
      }),
    );
    expect(text(entries(one)[0]!, "summary")).toBe(
      "Pes · starost\u00a01\u00a0leto · Zavetišče Horjul",
    );
    expect(text(one, "title")).toBe("Nove objave na Posvoji.si: psi");
    expect(text(one, "id")).toBe("https://posvoji.si/nove-objave/psi.xml");
  });

  it("stays well-formed whatever a shelter typed into a name", () => {
    const odd = animal("odd", "2026-09-22T10:00:00.000Z", {
      name: 'Tom & "Jerry" <br> \u0007',
    });
    const one = parse(
      buildFeed({
        dataset: { generatedAt: GENERATED_AT, animals: [odd] },
        locale: "sl",
        scope: "all",
      }),
    );

    expect(text(entries(one)[0]!, "title")).toBe('Tom & "Jerry" <br> ');
  });

  it("writes the English feed from the English labels", () => {
    const english = parse(
      buildFeed({
        dataset: { generatedAt: GENERATED_AT, animals: [luna] },
        locale: "en",
        scope: "cat",
      }),
    );

    expect(english.documentElement.getAttribute("xml:lang")).toBe("en");
    expect(text(english, "title")).toBe("New listings on Posvoji.si: cats");
    const [entry] = entries(english);
    expect(text(entry!, "id")).toBe("tag:posvoji.si,2026-09-26:en/luna");
    expect(text(entry!, "summary")).toBe(
      "Cat · 2\u00a0years\u00a0old · Zavetišče Mačja hiša, Celje",
    );
    expect(
      entry!.getElementsByTagNameNS(ATOM, "link")[0]?.getAttribute("href"),
    ).toBe(`https://posvoji.si${animalPath(luna, "en")}`);
  });

  it("is an empty feed, dated 1970, with no dataset to draw from", () => {
    const empty = parse(buildFeed({ dataset: null, locale: "sl", scope: "all" }));

    expect(entries(empty)).toHaveLength(0);
    expect(text(empty, "updated")).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("feedResponse", () => {
  it("answers a known file with Atom and anything else with a 404", async () => {
    const found = feedResponse("sl", "macke.xml", null);
    expect(found.headers.get("Content-Type")).toBe(
      "application/atom+xml; charset=utf-8",
    );
    expect(parse(await found.text()).documentElement.localName).toBe("feed");

    expect(feedResponse("sl", "cats.xml", null).status).toBe(404);
  });
});

describe("the feed routes", () => {
  // The files the export writes, from whatever data/dist holds on this
  // machine: none at all is a valid answer, and each one has to parse.
  it.each([
    ["sl", slovenianFiles, slovenianFeed],
    ["en", englishFiles, englishFeed],
  ] as const)("write four well-formed %s feeds", async (locale, files, GET) => {
    // The same four files the head advertises.
    const written = files().map(({ feed }) => feed);
    expect(written).toEqual(
      feedLinks(locale).map(({ url }) => url.split("/").at(-1)),
    );
    for (const feed of written) {
      const response = await GET(new Request("http://localhost/"), {
        params: Promise.resolve({ feed }),
      });
      const document = parse(await response.text());
      expect(text(document, "id")).toBe(
        `https://posvoji.si${feedPath(locale, "all").replace(/[^/]+$/, feed)}`,
      );
    }
  }, 30_000);
});

describe("withFeedLinks", () => {
  it("adds the language's feeds to the head and keeps its alternates", () => {
    const paths = { sl: "/", en: "/en" };
    const metadata = withFeedLinks(
      staticPageMetadata({ locale: "sl", paths, title: "T", description: "D" }),
      "sl",
    );

    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.alternates?.languages).toEqual({
      ...paths,
      "x-default": "/",
    });
    expect(metadata.alternates?.types).toEqual({
      "application/atom+xml": [
        { title: "Nove objave na Posvoji.si", url: "/nove-objave/vse.xml" },
        { title: "Nove objave na Posvoji.si: psi", url: "/nove-objave/psi.xml" },
        { title: "Nove objave na Posvoji.si: mačke", url: "/nove-objave/macke.xml" },
        {
          title: "Nove objave na Posvoji.si: ostale živali",
          url: "/nove-objave/ostale.xml",
        },
      ],
    });
  });
});
