import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  AdoptionStatus,
  AnimalAdoptionRequirements,
  AnimalGoodWith,
  Compatibility,
  EnergyLevel,
  ImagePolicy,
  ImageRights,
  Sex,
} from "@posvoji/schema";

const BASE_URL = "https://www.macji-dol.si";
const PROVIDER_ID = "macji-dol";
const DETAIL_PATH = /^\/mucki-iscejo-dom\/([^/]+)\/?$/;

export interface DetailFacts {
  name?: string;
  status?: AdoptionStatus;
  sex?: Sex;
  intakeDate?: string;
  description?: string;
  goodWith?: AnimalGoodWith;
  energy?: EnergyLevel;
  adoptionRequirements?: AnimalAdoptionRequirements;
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

  // Filter links also live below /mucki-iscejo-dom/. Restrict discovery to
  // WooCommerce product cards and use their post id as the stable identity.
  $("ul.products li.product").each((_, element) => {
    const card = $(element);
    const id = card.attr("class")?.match(/(?:^|\s)post-(\d+)(?:\s|$)/)?.[1];
    const href = card.find("a[href]").first().attr("href");
    const url = href ? sameSiteUrl(href) : undefined;
    const slug = url?.pathname.match(DETAIL_PATH)?.[1];
    if (!id || !slug) return;

    refs.set(id, {
      sourceAnimalId: id,
      // The site redirects the slashless form and PoliteClient deliberately
      // does not follow redirects, so keep the canonical trailing slash.
      sourceUrl: `${BASE_URL}/mucki-iscejo-dom/${slug}/`,
    });
  });

  return [...refs.values()];
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*:+$/, "")
    .toLowerCase();
}

function labelValue($: cheerio.CheerioAPI, label: string): string | undefined {
  const target = normalizeLabel(label);
  const strong = $(".summary .entry-content strong")
    .filter((_, element) => normalizeLabel($(element).text()) === target)
    .first();
  if (strong.length === 0) return undefined;

  const row = strong.parent().clone();
  row.find("strong").first().remove();
  const value = row
    .text()
    .normalize("NFC")
    .replace(/^\s*:/, "")
    .replace(/\s+/g, " ")
    .trim();
  return value || undefined;
}

const SEX: Record<string, Sex> = {
  moški: "male",
  moski: "male",
  ženski: "female",
  zenski: "female",
};

function normalizeTerm(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

// The "Družabnost" field lists comma-separated terms, from a fixed
// site-curated set mixed with free-standing qualified/hedged phrases (for
// example "verjetno tudi psi", "z določenimi mačkami"). Only the exact,
// unqualified terms below are unambiguous; everything else, including terms
// that merely contain one of these words, maps to nothing. Exact-term lookup
// only, never substring matching: "verjetno tudi psi" contains "psi" but is
// not the same claim.
const GOOD_WITH_TERMS: Record<
  string,
  { facet: keyof AnimalGoodWith; value: Compatibility }
> = {
  "brez mačk": { facet: "cats", value: "no" },
  mačke: { facet: "cats", value: "yes" },
  mački: { facet: "cats", value: "yes" },
  psi: { facet: "dogs", value: "yes" },
};

function parseGoodWith($: cheerio.CheerioAPI): AnimalGoodWith | undefined {
  const raw = labelValue($, "Družabnost");
  if (!raw) return undefined;

  const goodWith: AnimalGoodWith = {};
  for (const part of raw.split(",")) {
    const mapped = GOOD_WITH_TERMS[normalizeTerm(part)];
    if (mapped) goodWith[mapped.facet] = mapped.value;
  }
  return Object.keys(goodWith).length > 0 ? goodWith : undefined;
}

// "Bivanje" states the animal's living environment, which is not the same
// claim as apartmentOk, so it fills only adoptionRequirements.indoorOnly.
// "V notranjem okolju" counts, also with a leash-only outing ("zunaj le na
// povodcu"). Any outing to a safe area ("izhodi v varno okolje") or an
// alternative ("... ali ...") is not an indoor-only requirement.
const INDOOR_ENVIRONMENT = /\bv notranjem okolju\b/;
const ALTERNATIVE_MARKER = /\bali\b|\bizhod/;

function parseAdoptionRequirements(
  $: cheerio.CheerioAPI,
): AnimalAdoptionRequirements | undefined {
  const raw = labelValue($, "Bivanje");
  if (!raw) return undefined;

  const normalized = raw.normalize("NFC").toLowerCase();
  if (ALTERNATIVE_MARKER.test(normalized)) return undefined;
  return INDOOR_ENVIRONMENT.test(normalized) ? { indoorOnly: true } : undefined;
}

// "Živahnost" (older pages: "Energetičnost") is free prose. Only tempo words
// map, and only when the value names one level; "igriv" alone and negated
// values stay unset. The shelter's own middle term is "srednje živahna".
const CALM_STEMS = ["umirjen", "miren", "mirn", "len"];
const LIVELY_STEMS = ["živahen", "živahn", "energičen", "energičn", "aktiven", "aktivn"];
const BALANCED_MODIFIERS = new Set(["srednje", "zmerno"]);

function startsWithStem(word: string, stems: readonly string[]): boolean {
  return stems.some((stem) => word.startsWith(stem));
}

export function parseEnergy(value: string): EnergyLevel | undefined {
  const words = value
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  if (words.some((word) => word === "ni" || word === "ne")) return undefined;

  const found = new Set<EnergyLevel>();
  words.forEach((word, index) => {
    if (startsWithStem(word, LIVELY_STEMS)) {
      found.add(BALANCED_MODIFIERS.has(words[index - 1] ?? "") ? "balanced" : "lively");
    } else if (startsWithStem(word, CALM_STEMS)) found.add("calm");
  });
  return found.size === 1 ? [...found][0] : undefined;
}

function isValidIsoDate(iso: string): boolean {
  const date = new Date(`${iso}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso
  );
}

// Mačji dol usually states intake only approximately in prose (for example
// "od maja 2025" or "pozimi 2022"). Animal.intakeDate is an exact ISO date,
// so those forms must remain unset. Only a complete nearby date is accepted.
export function parseIntakeDate(text: string): string | undefined {
  const normalized = text.normalize("NFC").replace(/\s+/g, " ");
  const patterns = [
    /(?:sprejet(?:a|i|e)?|sprejeli|sprejeta v zavetišče)[^.]{0,80}?(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/iu,
    /(?:v zavetišču od|v zavetišče (?:je|sta|so)?\s*pri\w*)[^.]{0,80}?(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/iu,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const iso = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
    if (isValidIsoDate(iso)) return iso;
  }
  return undefined;
}

/**
 * WooCommerce writes the stock state onto the product container. "outofstock"
 * on an adoption listing is the site saying the cat is not to be had at the
 * moment, which is "hold": not adoptable, without claiming it was adopted.
 * A container with no flag leaves the reading to normalize().
 */
function parseStatus($: cheerio.CheerioAPI): AdoptionStatus | undefined {
  // The product page's own container. Related products are li.product, so
  // they cannot be picked up here.
  const product = $("div.product").first();
  if (product.hasClass("outofstock")) return "hold";
  if (product.hasClass("instock")) return "available";
  return undefined;
}

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  const heading = $(".summary .entry-content h2")
    .filter((_, element) => normalizeLabel($(element).text()) === "opis")
    .first();
  if (heading.length === 0) return undefined;

  // The first Kadence spacer marks the end of the animal-specific story;
  // everything after it is generic shelter and adoption boilerplate.
  const nodes = heading.nextUntil(".wp-block-kadence-spacer").clone();
  nodes.find("br").replaceWith("\n");
  const text = nodes.text().normalize("NFC").replace(/\s+/g, " ").trim();
  return text || undefined;
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  // The WooCommerce product container is the listing itself. A page without
  // it carries no facts: parsed anyway the record would normalize into an
  // available cat with no name and no photos, over the real one.
  if ($("div.product").length === 0) {
    throw new Error(`${PROVIDER_ID}: detail page has no product container`);
  }
  const name = $("h1.product_title").first().text().normalize("NFC").trim();
  const status = parseStatus($);
  const sexRaw = labelValue($, "Spol")?.toLowerCase();
  const description = parseDescription($);
  const energyRaw = labelValue($, "Živahnost") ?? labelValue($, "Energetičnost");

  const imageUrls: string[] = [];
  $(".woocommerce-product-gallery figure[data-src]").each((_, element) => {
    const src = $(element).attr("data-src");
    const url = src ? sameSiteUrl(src) : undefined;
    if (!url || !url.pathname.startsWith("/wp-content/uploads/")) return;
    const clean = `${BASE_URL}${url.pathname}`;
    if (!imageUrls.includes(clean)) imageUrls.push(clean);
  });

  return {
    name: name || undefined,
    status,
    sex: sexRaw ? (SEX[sexRaw] ?? "unknown") : undefined,
    intakeDate: description ? parseIntakeDate(description) : undefined,
    description,
    goodWith: parseGoodWith($),
    energy: energyRaw ? parseEnergy(energyRaw) : undefined,
    adoptionRequirements: parseAdoptionRequirements($),
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
    const response = await ctx.client.get(ctx.policy.source);
    if (response.status !== 200 || response.body === null) {
      throw new Error(
        `${PROVIDER_ID}: list fetch failed with HTTP ${response.status}`,
      );
    }
    return parseList(response.body);
  },

  async fetch(ctx, ref) {
    const response = await ctx.client.get(ref.sourceUrl);
    if (response.status !== 200 || response.body === null) {
      throw new Error(
        `${PROVIDER_ID}: detail fetch failed with HTTP ${response.status}`,
      );
    }
    return {
      ref,
      fetchedAt: new Date().toISOString(),
      data: parseDetail(response.body),
    };
  },

  async normalize(ctx, raw) {
    const facts = raw.data as DetailFacts;
    const rights = IMAGE_RIGHTS[ctx.policy.images];

    // A source page is one adoption listing, even when its title names two or
    // more cats. Never split on Slovenian "in" ("and") and never infer that
    // the cats must stay together: Iris in Melisa explicitly need not, while
    // other pages explicitly require it. The source page remains authoritative.
    return {
      id: `${PROVIDER_ID}:${raw.ref.sourceAnimalId}`,
      source: {
        providerId: PROVIDER_ID,
        sourceAnimalId: raw.ref.sourceAnimalId,
        sourceUrl: raw.ref.sourceUrl,
        fetchedAt: raw.fetchedAt,
        firstSeenAt: raw.fetchedAt,
        lastSeenAt: raw.fetchedAt,
      },
      shelter: {
        id: PROVIDER_ID,
        name: "Mačji dol (Žverca)",
        city: "Škofja Loka",
      },
      name: facts.name,
      species: "cat",
      sex: facts.sex,
      intakeDate: facts.intakeDate,
      goodWith: facts.goodWith,
      energy: facts.energy,
      adoptionRequirements: facts.adoptionRequirements,
      // Presence on the list is the availability signal here, as it is for
      // every other archive. This is the repo's only WooCommerce source, so
      // it also publishes a stock flag; reading it costs nothing and catches
      // a placed cat that is marked rather than unpublished.
      status: facts.status ?? "available",
      images:
        rights === null
          ? []
          : facts.imageUrls.map((sourceUrl) => ({ sourceUrl, rights })),
      shortDescription:
        ctx.policy.descriptions === "facts-only"
          ? undefined
          : facts.description,
      attribution: ctx.policy.attribution,
    };
  },
};

export default provider;
