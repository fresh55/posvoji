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

export function parseApproximateAgeMonths(
  value: string,
): number | undefined {
  const normalized = value.normalize("NFC").replace(/\s+/g, " ");
  const months = normalized.match(
    /\b(\d+)\s*(?:mesecev|mesece|meseca|mesec)\b/iu,
  );
  if (months) return Number(months[1]);

  const years = normalized.match(
    /\b(\d+)\s*(?:-|\s)*(?:letni|letna|leten|letnega|leta|leti|let)\b/iu,
  );
  if (years) return Number(years[1]) * 12;
  return /\b(?:približno\s+)?leto\s+dni\b/iu.test(normalized) ? 12 : undefined;
}

function parseSex(value: string): Sex | undefined {
  const normalized = value.normalize("NFC").toLocaleLowerCase("sl");
  const female = /\b(?:samička|samica|psička|psica|mačka)\b/u.test(normalized);
  const male = /\b(?:samček|samec|kuža|pes|maček)\b/u.test(normalized);
  if (female && male) return "unknown";
  if (female) return "female";
  if (male) return "male";
  return undefined;
}

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  const parts: string[] = [];
  $("article.portfolio-single > p").each((_, element) => {
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
