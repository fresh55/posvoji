import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  AnimalMedical,
  ImagePolicy,
  ImageRights,
  Sex,
  Species,
  TestResult,
} from "@posvoji/schema";

const BASE_URL = "https://www.macjahisa.si";
const PROVIDER_ID = "macja-hisa";
const DETAIL_PATH = /^\/posvojitev\/muce\/(\d+)\/?$/;

export interface DetailFacts {
  name?: string;
  species: Species;
  sex?: Sex;
  approximateAgeMonths?: number;
  intakeDate?: string;
  description?: string;
  medical?: AnimalMedical;
  imageUrls: string[];
}

function sameSiteUrl(href: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(href, BASE_URL);
  } catch {
    return undefined;
  }
  return url.origin === BASE_URL ? url : undefined;
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs = new Map<string, SourceAnimalRef>();
  $("a.seznam-muc-list-item[href]").each((_, el) => {
    const href = $(el).attr("href");
    const url = href ? sameSiteUrl(href) : undefined;
    const id = url?.pathname.match(DETAIL_PATH)?.[1];
    if (!id) return;
    // Rebuilt from the id: drops query strings and trailing slashes, which
    // would otherwise show up in changes.json as spurious updates.
    refs.set(id, {
      sourceAnimalId: id,
      sourceUrl: `${BASE_URL}/posvojitev/muce/${id}`,
    });
  });
  return [...refs.values()];
}

// "Osnovni podatki" rows look like <p><strong>Spol</strong>: samček</p>; one
// row may hold several labels separated by <br>, and the colon can sit inside
// or outside the <strong>.
function labelValue($: cheerio.CheerioAPI, label: string): string | undefined {
  const target = label.toLowerCase();
  const strong = $("strong")
    .filter(
      (_, el) =>
        $(el).text().trim().normalize("NFC").replace(/:$/, "").toLowerCase() ===
        target,
    )
    .first();
  const node = strong.get(0);
  if (!node) return undefined;
  const siblings = strong.parent().contents().toArray();
  let value = "";
  for (const sibling of siblings.slice(siblings.indexOf(node) + 1)) {
    if ("name" in sibling && (sibling.name === "strong" || sibling.name === "br")) {
      break;
    }
    value += $(sibling).text();
  }
  value = value.replace(/^\s*:/, "").trim().normalize("NFC");
  return value || undefined;
}

const SEX: Record<string, Sex> = {
  "samček": "male",
  samec: "male",
  "samička": "female",
  samica: "female",
};

const SPECIES: Record<string, Species> = {
  pes: "dog",
  "mačka": "cat",
  muca: "cat",
};

function parseIdentity($: cheerio.CheerioAPI): {
  name?: string;
  species: Species;
} {
  const heading = $("h1").first().text().trim().normalize("NFC");
  const speciesRaw = labelValue($, "Vrsta")?.toLowerCase();

  if (speciesRaw !== undefined) {
    return {
      name: heading || undefined,
      // An explicit but unrecognised value must not silently become a cat.
      species: SPECIES[speciesRaw] ?? "other",
    };
  }

  // Mačja hiša occasionally publishes a dog on its /muce/ list. In that
  // case both the list card and detail heading carry an explicit "pes"
  // prefix; the URL and /files/oglasi_muce/ photo path remain cat-shaped.
  // The prefix has shown up as "Pes: Medo", "PES - Medo" and with a
  // non-breaking space ("pes\u00a0Medo"), so match the leading word loosely:
  // case-insensitive, optionally followed by punctuation and/or whitespace
  // before the name.
  const dog = heading.match(/^pes\b[\s:\-/\u00a0]*(.*)$/iu);
  return dog
    ? { name: dog[1]!.trim() || undefined, species: "dog" }
    : { name: heading || undefined, species: "cat" };
}

// "3 leta", "1 leto", "10 mesecev", "7 let in 1 mesec". The lookbehind keeps
// fractional or ranged ages ("1,5 leta", "2-3 leta") out: better no age than a
// wrong one.
export function parseAgeMonths(value: string): number | undefined {
  const years = value.match(/(?<![\d,.-])(\d+)\s*let/i);
  const months = value.match(/(?<![\d,.-])(\d+)\s*mesec/i);
  if (!years && !months) return undefined;
  return (
    (years ? Number(years[1]) * 12 : 0) + (months ? Number(months[1]) : 0)
  );
}

// "29. 10. 2019" → "2019-10-29"; impossible dates come back undefined rather
// than aborting the whole crawl at Animal.parse.
export function parseSlovenianDate(value: string): string | undefined {
  const m = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return undefined;
  const [, day, month, year] = m;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10) === iso ? iso : undefined;
}

function parseMedical($: cheerio.CheerioAPI): AnimalMedical | undefined {
  // Vet facts only come from the "Veterinarski status" card; without it there
  // is nothing trustworthy to read.
  const card = $(".card")
    .filter((_, el) =>
      /veterinarski status/i.test(
        $(el).find(".card-header").text().normalize("NFC"),
      ),
    )
    .first();
  if (card.length === 0) return undefined;
  const rows = card.find("div");

  // A vet-status row is a leaf div: icon + label, no nested divs.
  const icon = (label: RegExp) => {
    const row = rows
      .filter((_, el) => {
        const $el = $(el);
        return (
          $el.children("i.fas").length > 0 &&
          $el.children("div").length === 0 &&
          label.test($el.text().normalize("NFC"))
        );
      })
      .first();
    return row.length > 0 ? row.children("i").first() : undefined;
  };

  const done = (label: RegExp): boolean | undefined => {
    const i = icon(label);
    if (!i) return undefined;
    if (i.hasClass("fa-check")) return true;
    if (i.hasClass("fa-times") || i.hasClass("fa-minus")) return false;
    return undefined;
  };

  const test = (label: RegExp): TestResult | undefined => {
    const i = icon(label);
    if (!i) return undefined;
    // Only fa-minus (negative) has been observed in the wild; the icon for a
    // positive result is unconfirmed, so anything else stays "unknown" —
    // never guess the highest-stakes fact on the page.
    return i.hasClass("fa-minus") ? "negative" : "unknown";
  };

  const found = Object.entries({
    neutered: done(/sterilizacija|kastracija/i),
    microchipped: done(/čipiranje/i),
    vaccinated: done(/cepljenje/i),
    felv: test(/\bfelv\b/i),
    fiv: test(/\bfiv\b/i),
  }).filter(([, value]) => value !== undefined);
  return found.length > 0
    ? (Object.fromEntries(found) as AnimalMedical)
    : undefined;
}

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  // clone(): the paragraph rewriting below must not leak into other parsers.
  const body = $(".content-body").first().clone();
  if (body.length === 0) return undefined;
  body.find("br").replaceWith("\n");
  body.find("p").each((_, el) => {
    $(el).append("\n\n");
  });
  const text = body
    .text()
    // [^\S\n] = all whitespace except newlines, NBSP included.
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
  return text || undefined;
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const identity = parseIdentity($);

  const imageUrls: string[] = [];
  $(".cat-photos a[data-fancybox]").each((_, el) => {
    const href = $(el).attr("href");
    const url = href ? sameSiteUrl(href) : undefined;
    // Fancybox anchors can carry "#" or javascript: triggers; only the site's
    // photo files count.
    if (!url || !url.pathname.startsWith("/files/")) return;
    const clean = `${BASE_URL}${url.pathname}`;
    if (!imageUrls.includes(clean)) imageUrls.push(clean);
  });

  const sexRaw = labelValue($, "Spol")?.toLowerCase();
  const ageRaw = labelValue($, "Starost");
  const intakeRaw = labelValue($, "Datum sprejema");

  return {
    ...identity,
    sex: sexRaw ? (SEX[sexRaw] ?? "unknown") : undefined,
    approximateAgeMonths: ageRaw ? parseAgeMonths(ageRaw) : undefined,
    intakeDate: intakeRaw ? parseSlovenianDate(intakeRaw) : undefined,
    description: parseDescription($),
    medical: parseMedical($),
    imageUrls,
  };
}

const IMAGE_RIGHTS: Record<ImagePolicy, ImageRights | null> = {
  none: null,
  remote: "display-permitted",
  "cache-permitted": "cache-permitted",
};

const provider: AdoptionProvider = {
  id: PROVIDER_ID,

  async discover(ctx) {
    const res = await ctx.client.get(ctx.policy.source);
    if (res.status !== 200 || res.body === null) {
      throw new Error(`${PROVIDER_ID}: list fetch failed with HTTP ${res.status}`);
    }
    return parseList(res.body);
  },

  async fetch(ctx, ref) {
    const res = await ctx.client.get(ref.sourceUrl);
    if (res.status !== 200 || res.body === null) {
      throw new Error(`${PROVIDER_ID}: detail fetch failed with HTTP ${res.status}`);
    }
    return { ref, fetchedAt: new Date().toISOString(), data: parseDetail(res.body) };
  },

  async normalize(ctx, raw) {
    const facts = raw.data as DetailFacts;
    const rights = IMAGE_RIGHTS[ctx.policy.images];
    return {
      id: `${PROVIDER_ID}:${raw.ref.sourceAnimalId}`,
      source: {
        providerId: PROVIDER_ID,
        sourceAnimalId: raw.ref.sourceAnimalId,
        sourceUrl: raw.ref.sourceUrl,
        fetchedAt: raw.fetchedAt,
        // export.ts replaces this with the date we first saw the animal.
        firstSeenAt: raw.fetchedAt,
        lastSeenAt: raw.fetchedAt,
      },
      shelter: {
        id: PROVIDER_ID,
        name: "Zavetišče Mačja hiša",
        city: "Celje",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      approximateAgeMonths: facts.approximateAgeMonths,
      intakeDate: facts.intakeDate,
      medical: facts.medical,
      // The listing carries no reserved/adopted markers: a cat that is listed
      // is adoptable, and one that is gone drops out at the next discover().
      status: "available",
      images:
        rights === null
          ? []
          : facts.imageUrls.map((sourceUrl) => ({ sourceUrl, rights })),
      shortDescription:
        ctx.policy.descriptions === "facts-only" ? undefined : facts.description,
      attribution: ctx.policy.attribution,
    };
  },
};

export default provider;
