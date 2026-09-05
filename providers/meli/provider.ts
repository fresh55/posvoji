import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  ImagePolicy,
  ImageRights,
  Sex,
  Species,
} from "@posvoji/schema";

const BASE_URL = "https://www.meli-center.si";
const PROVIDER_ID = "meli";
const DETAIL_PATH = /^\/portfolio\/([^/]+)\/?$/;

export interface DetailFacts {
  name?: string;
  species: Species;
  sex?: Sex;
  approximateAgeMonths?: number;
  description?: string;
  imageUrls: string[];
}

function detailSlug(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, BASE_URL);
    if (url.origin !== BASE_URL) return undefined;
    return url.pathname.match(DETAIL_PATH)?.[1];
  } catch {
    return undefined;
  }
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs = new Map<string, SourceAnimalRef>();

  $("article[data-categories] .portfolio-context h2 a[href]").each(
    (_, element) => {
      const slug = detailSlug($(element).attr("href"));
      if (!slug || refs.has(slug)) return;
      refs.set(slug, {
        sourceAnimalId: slug,
        sourceUrl: `${BASE_URL}/portfolio/${slug}/`,
      });
    },
  );

  return [...refs.values()];
}

function cleanName(value: string): string | undefined {
  const name = value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+išče(?:ta|jo)?\s+nov(?:e)?\s+dom(?:ove)?\s*$/iu, "")
    .trim();
  return name || undefined;
}

function parseSpecies($: cheerio.CheerioAPI): Species {
  const article = $("article.portfolio-single").first();
  if (article.hasClass("portfolio-category-psi")) return "dog";
  if (article.hasClass("portfolio-category-macke")) return "cat";
  return "other";
}

// The listings write half years as "1,5 leta". Matching only `\d+` on a word
// boundary takes the "5" and publishes five years, so the count has to take
// the separator and its decimals with it, and the lookbehind has to stop the
// pattern from starting in the middle of a number.
const AGE_COUNT = "(?<![\\d,.])(\\d+(?:[.,]\\d+)?)";

function ageCount(raw: string | undefined): number {
  return Number((raw ?? "").replace(",", "."));
}

export function parseApproximateAgeMonths(
  value: string,
): number | undefined {
  const normalized = value.normalize("NFC").replace(/\s+/g, " ");
  const months = normalized.match(
    new RegExp(`${AGE_COUNT}\\s*(?:mesecev|mesece|meseca|mesec)\\b`, "iu"),
  );
  if (months) return Math.round(ageCount(months[1]));

  const years = normalized.match(
    new RegExp(
      `${AGE_COUNT}\\s*(?:-|\\s)*(?:letni|letna|leten|letnega|leta|leti|let)\\b`,
      "iu",
    ),
  );
  if (years) return Math.round(ageCount(years[1]) * 12);
  return /\b(?:približno\s+)?leto\s+dni\b/iu.test(normalized) ? 12 : undefined;
}

export function parseSex(value: string): Sex | undefined {
  const normalized = value.normalize("NFC").toLocaleLowerCase("sl");
  // "pes" (dog) and "mačka" (cat) are the plain species nouns in Slovenian,
  // not sex markers: a female dog is still a "pes" and a male cat is still a
  // "mačka" in ordinary usage, so both are excluded here. Likewise "kuža"
  // (colloquial "doggie") is used for dogs of either sex. Only forms that are
  // themselves sex-specific stay: samica/samička/psica/psička/muca for
  // female, samec/samček/maček for male.
  const female = /\b(?:samička|samica|psička|psica|muca)\b/u.test(normalized);
  const male = /\b(?:samček|samec|maček)\b/u.test(normalized);
  if (female && male) return "unknown";
  if (female) return "female";
  if (male) return "male";
  return undefined;
}

// Most listings type the text straight into the editor as direct-child <p>
// elements, but some are pasted in from Facebook, which wraps every line in
// its own obfuscated-class div and puts the actual text one level deeper in
// a leaf `div[dir="auto"]` (the wrapping divs never carry that attribute
// themselves). A direct-child selector loses those entirely. .portfolio-
// single-items is always empty on current listings, but its class name
// names it as a tag/share block, so it is excluded the same defensive way
// obalno excludes its gallery and donation panels.
const NOT_ANIMAL_TEXT = ".portfolio-single-items";

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  const parts: string[] = [];
  $("article.portfolio-single")
    .first()
    .find("p, div[dir='auto']")
    .filter((_, element) => $(element).closest(NOT_ANIMAL_TEXT).length === 0)
    .each((_, element) => {
      const text = $(element).text().normalize("NFC").replace(/\s+/g, " ").trim();
      if (/^Za več informacij\b/iu.test(text)) return false;
      if (text) parts.push(text);
    });
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function sameSiteImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, BASE_URL);
    if (
      url.origin !== BASE_URL ||
      !url.pathname.startsWith("/wp-content/uploads/")
    ) {
      return undefined;
    }
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const article = $("article.portfolio-single").first();
  const description = parseDescription($);
  const imageUrls: string[] = [];
  const addImage = (value: string | undefined) => {
    const url = sameSiteImage(value);
    if (url && !imageUrls.includes(url)) imageUrls.push(url);
  };

  article.find("a[href] img").each((_, image) => {
    addImage($(image).closest("a[href]").attr("href"));
  });
  article.find("img[src]").each((_, image) => {
    // A linked image usually has a resized thumbnail in src and its original
    // file in the enclosing href. Keep only the original in that case.
    if ($(image).closest("a[href]").length === 0) addImage($(image).attr("src"));
  });

  return {
    name: cleanName(article.find("h1").first().text()),
    species: parseSpecies($),
    sex: description ? parseSex(description) : undefined,
    approximateAgeMonths: description
      ? parseApproximateAgeMonths(description)
      : undefined,
    description,
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
    if (detailSlug(ref.sourceUrl) !== ref.sourceAnimalId) {
      throw new Error(`${PROVIDER_ID}: refused non-animal detail URL`);
    }
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
        name: "Meli Center Repče",
        city: "Trebnje",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      approximateAgeMonths: facts.approximateAgeMonths,
      // Checked the live site 2026-08-29: the archive (meli-center.si/iscejo-dom/)
      // and several detail pages carry no reservation/adoption signal at all.
      // Listing titles are always "X išče(ta) nov(e) dom(ove)", never a
      // suffix like zonzani's "(rezervirano)"; the portfolio-category-psi/
      // -macke classes are species only, not a status; and the sampled
      // descriptions (some typed directly, some pasted from Facebook posts)
      // had no status wording to weigh either. A listing present on the
      // archive is the availability signal; the site removes an animal from
      // it once it is no longer up for adoption.
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
