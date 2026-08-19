import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  AdoptionStatus,
  AnimalSize,
  Sex,
  Species,
} from "@posvoji/schema";

const BASE_URL = "https://zavetisce-malahisa.si";
const PROVIDER_ID = "mala-hisa";
const LIST_URLS = [
  `${BASE_URL}/psi-za-oddajo/`,
  `${BASE_URL}/muce-za-oddajo/`,
] as const;

export interface DetailFacts {
  name?: string;
  species: Species;
  sex?: Sex;
  breed?: string;
  approximateAgeMonths?: number;
  size?: AnimalSize;
  status: AdoptionStatus;
}

interface DetailUrl {
  sourceAnimalId: string;
  sourceUrl: string;
}

function detailUrl(value: string | undefined): DetailUrl | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, BASE_URL);
    if (url.origin !== BASE_URL) return undefined;
    const match = url.pathname.match(
      /^\/(psi_za_oddajo|muce_za_oddajo)\/([^/]+)\/?$/,
    );
    if (!match) return undefined;
    const [, type, slug] = match;
    if (!type || !slug) return undefined;
    return {
      sourceAnimalId: `${type}:${decodeURIComponent(slug)}`,
      sourceUrl: `${BASE_URL}/${type}/${slug}/`,
    };
  } catch {
    return undefined;
  }
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs = new Map<string, SourceAnimalRef>();
  $("a[href]").each((_, el) => {
    const ref = detailUrl($(el).attr("href"));
    if (ref && !refs.has(ref.sourceAnimalId)) {
      refs.set(ref.sourceAnimalId, ref);
    }
  });
  return [...refs.values()];
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseApproximateAgeMonths(
  value: string,
): number | undefined {
  // A single integer cannot faithfully preserve ranges such as 5–6 months.
  if (/\b\d+\s*[–—-]\s*\d+\s*(?:mesec|meseca|mesece|mesecev|let|leta)\b/iu.test(value)) {
    return undefined;
  }

  const yearAdjective = value.match(/\b(\d+)\s*[- ]\s*letn(?:i|a|o)\b/iu);
  if (yearAdjective) return Number(yearAdjective[1]) * 12;

  const years = value.match(
    /\bstar(?:a|o)?\s+(?:približno\s+)?(\d+)\s*(?:let|leta)\b/iu,
  );
  if (years) return Number(years[1]) * 12;

  const months = value.match(
    /\bstar(?:a|o)?\s+(?:približno\s+)?(\d+)\s*(?:mesec|meseca|mesece|mesecev)\b/iu,
  );
  return months ? Number(months[1]) : undefined;
}

function parseSex(species: Species, value: string): Sex | undefined {
  if (species === "dog") {
    if (/\b(?:psička|samica)\b/iu.test(value)) return "female";
    if (/\b(?:kuža|samec)\b/iu.test(value)) return "male";
  }
  if (species === "cat") {
    if (/\b(?:mucka|mačka|samička|samica)\b/iu.test(value)) return "female";
    if (/\b(?:muc|maček|samček|samec)\b/iu.test(value)) return "male";
  }
  return undefined;
}

function parseSize(value: string): AnimalSize | undefined {
  if (/\b(?:majhen|majhna|majhne|male)\s+(?:po\s+)?rasti\b/iu.test(value)) {
    return "small";
  }
  if (/\bsrednje\s+(?:velikosti|rasti)\b/iu.test(value)) return "medium";
  if (/\b(?:velik|velika|velike)\s+(?:po\s+)?rasti\b/iu.test(value)) {
    return "large";
  }
  return undefined;
}

const BREED_NOUN =
  /\b(?:ovčar(?:ka)?|pinč|terier|prinašalec|retriver|labradorec|mešanec|mešanka|pudelj|šnavcer|maltežan|čivava|jazbečar|mastif|bokser|buldog)\b/iu;

function parseBreed(value: string): string | undefined {
  for (const sentence of value.split(/[.!?]/u)) {
    const normalized = normalizedText(sentence);
    if (!BREED_NOUN.test(normalized)) continue;

    const standalone = normalized.match(/^Je\s+(.{2,50})$/iu)?.[1];
    if (standalone && BREED_NOUN.test(standalone)) return standalone;

    const ageBreed = normalized.match(
      /\b\d+\s*[- ]\s*letn(?:i|a|o)\s+([^,]{2,50})/iu,
    )?.[1];
    if (ageBreed && BREED_NOUN.test(ageBreed)) return normalizedText(ageBreed);
  }
  return undefined;
}

function articleSpecies($: cheerio.CheerioAPI): Species {
  if ($("article.type-psi_za_oddajo").length > 0) return "dog";
  if ($("article.type-muce_za_oddajo").length > 0) return "cat";
  return "other";
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const article = $("article.type-psi_za_oddajo, article.type-muce_za_oddajo").first();
  const content = normalizedText(article.find(".entry-content").first().text());
  const species = articleSpecies($);
  return {
    name: normalizedText(article.find(".page-title").first().text()) || undefined,
    species,
    sex: parseSex(species, content),
    breed: parseBreed(content),
    approximateAgeMonths: parseApproximateAgeMonths(content),
    size: parseSize(content),
    // Only adoption-list detail URLs enter the pipeline.
    status: "available",
  };
}

const provider: AdoptionProvider = {
  id: PROVIDER_ID,

  async discover(ctx) {
    const refs = new Map<string, SourceAnimalRef>();
    for (const url of LIST_URLS) {
      const response = await ctx.client.get(url);
      if (response.status !== 200 || response.body === null) {
        throw new Error(
          `${PROVIDER_ID}: list fetch failed with HTTP ${response.status} for ${url}`,
        );
      }
      for (const ref of parseList(response.body)) {
        refs.set(ref.sourceAnimalId, ref);
      }
    }
    return [...refs.values()];
  },

  async fetch(ctx, ref) {
    const validated = detailUrl(ref.sourceUrl);
    if (!validated || validated.sourceAnimalId !== ref.sourceAnimalId) {
      throw new Error(`${PROVIDER_ID}: refused non-adoption detail URL`);
    }
    const response = await ctx.client.get(ref.sourceUrl);
    if (response.status !== 200 || response.body === null) {
      throw new Error(`${PROVIDER_ID}: detail fetch failed with HTTP ${response.status}`);
    }
    return {
      ref,
      fetchedAt: new Date().toISOString(),
      data: parseDetail(response.body),
    };
  },

  async normalize(ctx, raw) {
    const facts = raw.data as DetailFacts;
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
        name: "Zavetišče Mala hiša",
        city: "Moravske Toplice",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      breed: facts.breed,
      approximateAgeMonths: facts.approximateAgeMonths,
      size: facts.size,
      status: facts.status,
      images: [],
      attribution: ctx.policy.attribution,
    };
  },
};

export default provider;
