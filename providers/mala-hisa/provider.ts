import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  AdoptionStatus,
  AnimalSize,
  ImagePolicy,
  ImageRights,
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
  sourceAnimalId: string;
  name?: string;
  species: Species;
  sex?: Sex;
  breed?: string;
  approximateAgeMonths?: number;
  size?: AnimalSize;
  status: AdoptionStatus;
  description?: string;
  imageUrls: string[];
}

function sameSiteUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, BASE_URL);
    return url.origin === BASE_URL ? url : undefined;
  } catch {
    return undefined;
  }
}

function sameSiteDetailUrl(value: string | undefined): URL | undefined {
  const url = sameSiteUrl(value);
  if (!url || !/^\/(psi_za_oddajo|muce_za_oddajo)\/[^/]+\/?$/.test(url.pathname)) {
    return undefined;
  }
  return url;
}

// Both the list card and the detail article carry the WordPress numeric post
// id as a "post-{ID}" class token. That id is the stable identity: the slug
// in the URL can be renamed by the shelter at any time, which would churn
// the animal as removed-then-added in changes.json under a slug-based id.
function postId(classAttr: string | undefined): string | undefined {
  return classAttr?.match(/(?:^|\s)post-(\d+)(?:\s|$)/)?.[1];
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs = new Map<string, SourceAnimalRef>();
  $("article.psi_za_oddajo, article.muce_za_oddajo").each((_, el) => {
    const article = $(el);
    const id = postId(article.attr("class"));
    if (!id || refs.has(id)) return;
    const url = sameSiteDetailUrl(article.find("a[href]").first().attr("href"));
    if (!url) return;
    // Rebuilt from the validated pathname: drops query strings and trailing
    // slash variance, which would otherwise show up in changes.json as
    // spurious updates.
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    refs.set(id, { sourceAnimalId: id, sourceUrl: `${BASE_URL}${path}` });
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

// "samec"/"samica" mean "male"/"female" in general, not one species, so a
// sentence about a companion of the OTHER species ("mačji samec", "pasja
// samica") can trip them without describing this animal's own sex. Guard the
// two generic words against the immediately preceding adjective stem for the
// other species; the species-specific words (kuža, muc, mačka, ...) carry no
// such risk and are left as plain whole-word matches.
function genericMarker(
  value: string,
  word: "samec" | "samica",
  excludeAdjectiveStem: string,
): boolean {
  const guard = new RegExp(
    `(?<!${excludeAdjectiveStem}[a-z]*\\s)\\b${word}\\b`,
    "iu",
  );
  return guard.test(value);
}

function parseSex(species: Species, value: string): Sex | undefined {
  if (species === "dog") {
    const female =
      /\bpsička\b/iu.test(value) || genericMarker(value, "samica", "mačj");
    const male =
      /\bkuža\b/iu.test(value) || genericMarker(value, "samec", "mačj");
    // Both markers present (e.g. littermates of both sexes described
    // together) means the text can't be trusted to describe one sex.
    if (female && male) return undefined;
    if (female) return "female";
    if (male) return "male";
  }
  if (species === "cat") {
    const female =
      /\b(?:mucka|mačka|samička)\b/iu.test(value) ||
      genericMarker(value, "samica", "pasj");
    const male =
      /\b(?:muc|maček|samček)\b/iu.test(value) ||
      genericMarker(value, "samec", "pasj");
    if (female && male) return undefined;
    if (female) return "female";
    if (male) return "male";
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

// WordPress names every derived size "<file>-<width>x<height>.<ext>" and
// sometimes adds a near-original "<file>-scaled.<ext>" above 2560px; the
// candidate without a "-WxH" suffix is the best on offer. Only srcset/src
// candidates the page itself lists are weighed: rebuilding one by stripping
// a thumbnail's suffix would invent a filename that need not exist on disk.
const DERIVED_SIZE = /-\d+x\d+(?=\.[A-Za-z0-9]+$)/;

export function fullSizeSrc(
  src: string | undefined,
  srcset: string | undefined,
): string | undefined {
  const candidates: Array<{ url: string; width: number }> = [];
  for (const part of (srcset ?? "").split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (url) {
      candidates.push({ url, width: Number.parseInt(descriptor ?? "", 10) || 0 });
    }
  }
  if (src) candidates.push({ url: src, width: 0 });
  if (candidates.length === 0) return undefined;
  return (
    candidates.find((c) => !DERIVED_SIZE.test(c.url))?.url ??
    candidates.reduce((widest, c) => (c.width > widest.width ? c : widest)).url
  );
}

function parseImageUrls($: cheerio.CheerioAPI): string[] {
  const imageUrls: string[] = [];
  const addImage = (candidate: string | undefined) => {
    const url = sameSiteUrl(candidate);
    if (!url || !url.pathname.startsWith("/wp-content/uploads/")) return;
    const clean = `${BASE_URL}${url.pathname}`;
    if (!imageUrls.includes(clean)) imageUrls.push(clean);
  };
  // Only the article's own featured image is trusted as this animal's photo.
  // The same <article> also renders the previous/next post-navigation
  // figures (nav.post-navigation), which carry OTHER animals' thumbnails,
  // and a pasted story can carry a Facebook emoji <img> served from a
  // different origin (static.xx.fbcdn.net). Scoping to .ct-featured-image
  // keeps both out. No listing seen live (13 dogs, 0 cats currently
  // published) uses a lightbox gallery for more than this single photo.
  const featured = $(
    "article.type-psi_za_oddajo .ct-featured-image img, article.type-muce_za_oddajo .ct-featured-image img",
  ).first();
  addImage(fullSizeSrc(featured.attr("src"), featured.attr("srcset")));
  return imageUrls;
}

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  const body = $(
    "article.type-psi_za_oddajo .entry-content, article.type-muce_za_oddajo .entry-content",
  ).first();
  if (body.length === 0) return undefined;

  const paragraphs: string[] = [];
  body.find("p, div[dir='auto']").each((_, el) => {
    const node = $(el);
    // Some stories are pasted in from Facebook, which wraps every paragraph
    // in its own plain <div> (no dir attribute) around the real
    // "dir=auto" text div; without this guard the outer wrapper's flattened
    // text would repeat every inner paragraph it contains.
    if (node.find("p, div[dir='auto']").length > 0) return;
    if (node.find("a[href^='mailto:'], a[href^='tel:']").length > 0) return;
    const text = node.text().replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
  });
  return paragraphs.length > 0 ? paragraphs.join("\n\n") : undefined;
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const article = $("article.type-psi_za_oddajo, article.type-muce_za_oddajo").first();
  const sourceAnimalId = postId(article.attr("class"));
  if (!sourceAnimalId) {
    // An id scheme must not be mixed: falling back to the slug here would
    // silently reintroduce the churn the numeric id was adopted to avoid.
    throw new Error(
      `${PROVIDER_ID}: could not find the WordPress post id on the detail article`,
    );
  }
  const content = normalizedText(article.find(".entry-content").first().text());
  const species = articleSpecies($);
  return {
    sourceAnimalId,
    name: normalizedText(article.find(".page-title").first().text()) || undefined,
    species,
    sex: parseSex(species, content),
    breed: parseBreed(content),
    approximateAgeMonths: parseApproximateAgeMonths(content),
    size: parseSize(content),
    // Only adoption-list detail URLs enter the pipeline.
    status: "available",
    description: parseDescription($),
    imageUrls: parseImageUrls($),
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
    if (!sameSiteDetailUrl(ref.sourceUrl)) {
      throw new Error(`${PROVIDER_ID}: refused non-adoption detail URL`);
    }
    const response = await ctx.client.get(ref.sourceUrl);
    if (response.status !== 200 || response.body === null) {
      throw new Error(`${PROVIDER_ID}: detail fetch failed with HTTP ${response.status}`);
    }
    const data = parseDetail(response.body);
    if (data.sourceAnimalId !== ref.sourceAnimalId) {
      throw new Error(
        `${PROVIDER_ID}: detail identity mismatch (${ref.sourceAnimalId} != ${data.sourceAnimalId})`,
      );
    }
    return {
      ref,
      fetchedAt: new Date().toISOString(),
      data,
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
