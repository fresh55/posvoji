import {
  cheerio,
  type AdoptionProvider,
  type PoliteResponse,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  AnimalMedical,
  AnimalSize,
  ImagePolicy,
  ImageRights,
  Sex,
  Species,
  TestResult,
} from "@posvoji/schema";

const BASE_URL = "https://zavetisceturk.com";
const PROVIDER_ID = "turk";

// The site is WordPress with the REST API left on. Reading the collection
// instead of the category archives buys three things the rendered pages do not
// give us: an explicit X-WP-TotalPages, so a listing can never be silently
// truncated at a page boundary; a payload that carries every post in full, so
// a crawl costs one request per hundred animals rather than one per animal;
// and independence from the theme's markup.
const PER_PAGE = 100;
// One request per 100 animals, so this is a runaway guard, not a real ceiling.
// Reaching it means the pagination contract changed, and the run has to fail
// loudly rather than return a partial catalogue.
const MAX_PAGES = 20;
const FIELDS = "id,slug,link,title,content,categories";

const SPECIES_CATEGORIES = new Map<number, Species>([
  [4, "dog"], // "Posvoji psa"
  [10, "cat"], // "Posvoji mačko"
]);

// "V novem domu". The shelter adds it on adoption and does not always remove
// the adoption category, so it has to override one.
const ADOPTED_CATEGORY = 9;

// "Pogrešane živali" and "Pravkar najdeni" are lost-and-found notices carrying
// owners' and finders' phone numbers. Never requested, and rejected here too
// in case a post is cross-filed into an adoption category.
const LOST_AND_FOUND_CATEGORIES = new Set([7, 8]);

export interface WpPost {
  id: number;
  link: string;
  title: string;
  content: string;
  categories: number[];
}

export interface DetailFacts {
  name?: string;
  species: Species;
  sex?: Sex;
  approximateAgeMonths?: number;
  size?: AnimalSize;
  medical?: AnimalMedical;
  description?: string;
  imageUrls: string[];
}

export function listUrl(source: string, category: number, page: number): string {
  // Ascending by id, not the WordPress default of newest first: a post
  // published between two page requests would shift every later post one place
  // and push one across the page boundary unseen. Ascending ids only append.
  return (
    `${source}?categories=${category}&per_page=${PER_PAGE}&page=${page}` +
    `&orderby=id&order=asc&_fields=${FIELDS}`
  );
}

export function parseTotalPages(
  headers: PoliteResponse["headers"],
): number | undefined {
  const raw = headers["x-wp-totalpages"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

// The listings put each sentence on its own <br> or <p>, which carry no text
// of their own, so reading the markup straight through fuses sentences into
// "sterilizirana.Zelo prestrašena". Everything downstream splits on sentences,
// so the break has to become whitespace first.
const BLOCK_BREAK =
  /<(?:br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/figure|\/td|\/tr)\b[^>]*>/gi;

function text(html: string): string {
  const $ = cheerio.load(html.replace(BLOCK_BREAK, " $&"));
  // Photo captions name whoever else is in the picture ("Penelope in Pupa").
  // That is not what the shelter says about this animal.
  $("figcaption").remove();
  return $.root().text().normalize("NFC").replace(/\s+/g, " ").trim();
}

function readPost(value: unknown): WpPost | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const post = value as Record<string, unknown>;
  if (typeof post["id"] !== "number") return undefined;
  if (typeof post["link"] !== "string") return undefined;
  if (!Array.isArray(post["categories"])) return undefined;
  const title = post["title"] as Record<string, unknown> | undefined;
  const content = post["content"] as Record<string, unknown> | undefined;
  return {
    id: post["id"],
    link: post["link"],
    title: typeof title?.["rendered"] === "string" ? title["rendered"] : "",
    content: typeof content?.["rendered"] === "string" ? content["rendered"] : "",
    categories: post["categories"].filter(
      (id): id is number => typeof id === "number",
    ),
  };
}

export function postSpecies(categories: number[]): Species | undefined {
  if (categories.some((id) => LOST_AND_FOUND_CATEGORIES.has(id))) {
    return undefined;
  }
  if (categories.includes(ADOPTED_CATEGORY)) return undefined;
  const species = new Set(
    categories.flatMap((id) => {
      const match = SPECIES_CATEGORIES.get(id);
      return match ? [match] : [];
    }),
  );
  // A post filed as both a dog and a cat states two different things. Nothing
  // here can settle which, so it is left out rather than labelled.
  return species.size === 1 ? [...species][0] : undefined;
}

function sourceUrl(link: string): string | undefined {
  let url: URL;
  try {
    url = new URL(link, BASE_URL);
  } catch {
    return undefined;
  }
  if (url.origin !== BASE_URL) return undefined;
  url.search = "";
  url.hash = "";
  return url.href;
}

// The WordPress post id is the identity. It survives a slug rename and the
// dated permalink path; the URL does not.
function postRef(post: WpPost): SourceAnimalRef | undefined {
  const url = sourceUrl(post.link);
  if (!url) return undefined;
  return { sourceAnimalId: String(post.id), sourceUrl: url };
}

export interface ListPage {
  // Every entry the API returned, counted before the category filter runs.
  // Whether another page can follow is a fact about the page WordPress sent,
  // not about how many of its posts we keep, so a page of a hundred adopted
  // animals still has to count as full.
  count: number;
  posts: WpPost[];
}

export function parsePage(body: string): ListPage {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${PROVIDER_ID}: list payload is not JSON`);
  }
  if (!Array.isArray(payload)) {
    throw new Error(`${PROVIDER_ID}: list payload is not an array of posts`);
  }
  const posts: WpPost[] = [];
  for (const entry of payload) {
    const post = readPost(entry);
    if (!post || !postSpecies(post.categories)) continue;
    posts.push(post);
  }
  return { count: payload.length, posts };
}

export function parsePosts(body: string): WpPost[] {
  return parsePage(body).posts;
}

export function parseList(body: string): SourceAnimalRef[] {
  const refs = new Map<string, SourceAnimalRef>();
  for (const post of parsePosts(body)) {
    const ref = postRef(post);
    if (ref) refs.set(ref.sourceAnimalId, ref);
  }
  return [...refs.values()];
}

// The listings are prose, not a fact table, so every field below is read from
// wording the shelter uses consistently. Anything short of an explicit
// statement is left unset; parseSex is the one case that answers "unknown".

// The count has to take the whole number, decimals included. Reading only the
// digits after the separator turns "stara 1,5 leta" into five years, and the
// lookbehind is what stops the pattern from starting mid-number.
const AGE_COUNT = "(?<![\\d,.])(\\d+(?:[.,]\\d+)?)";

const AGE_PATTERNS = [
  // "stara cca 1 leto", "Star je cca 2 leti", "Ocenjena starost je 6 let"
  new RegExp(
    `\\bstar(?:a|ost)?\\b[^.!?]{0,20}?${AGE_COUNT}\\s*(let\\w*|mesec\\w*)\\b`,
    "iu",
  ),
  // "cca 3 leta stara"
  new RegExp(`${AGE_COUNT}\\s*(let\\w*|mesec\\w*)\\b[^.!?]{0,12}?\\bstar\\w*`, "iu"),
];

export function parseApproximateAgeMonths(value: string): number | undefined {
  const normalized = value.normalize("NFC").replace(/\s+/g, " ");
  for (const pattern of AGE_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const count = Number((match[1] ?? "").replace(",", "."));
    if (!Number.isFinite(count)) continue;
    return Math.round(/^mesec/iu.test(match[2] ?? "") ? count : count * 12);
  }
  return undefined;
}

// Slovenian marks an animal's sex in the noun and in adjective agreement, so
// these are statements, not inferences. Two things keep it that way. Word
// boundaries: "nekastriran" must not read as "kastriran", "stara" must not
// read as "star". And only sex-specific words: "mačka" is both a female cat
// and the accusative of the male "maček", and "muce" is what the listings call
// cats in general, so neither is here. "kuža" is likewise just the colloquial
// word for a dog of either sex, not a sex marker, so it is not here either.
const FEMALE_MARKERS =
  /\b(?:mešank\w*|psičk\w*|psic\w*|mucka\w*|samic\w*|sterilizirana|stara|odrasla)\b/u;
const MALE_MARKERS =
  /\b(?:mešan(?:ec|c\w+|č\w*)|maček|mačkon\w*|mucek\w*|samec|samč\w*|kastriran\w*|star|odrasel)\b/u;

export function parseSex(value: string): Sex | undefined {
  const normalized = value.normalize("NFC").toLocaleLowerCase("sl");
  const female = FEMALE_MARKERS.test(normalized);
  const male = MALE_MARKERS.test(normalized);
  // A listing naming both (an animal caught alongside others) genuinely does
  // not say which this one is. "unknown" records that we looked.
  if (female && male) return "unknown";
  if (female) return "female";
  if (male) return "male";
  return undefined;
}

export function parseSize(value: string): AnimalSize | undefined {
  const normalized = value.normalize("NFC").toLocaleLowerCase("sl");
  // "manjše-srednje rasti" straddles two buckets and the schema has no such
  // value, so the size stays unset rather than being rounded either way.
  if (/manjše\s*[-–—]\s*srednje/u.test(normalized)) return undefined;
  const sizes = new Set<AnimalSize>();
  if (/\bvečje\s+rasti\b/u.test(normalized)) sizes.add("large");
  if (/\bsrednje\s+rasti\b/u.test(normalized)) sizes.add("medium");
  if (/\bmanjše\s+rasti\b/u.test(normalized)) sizes.add("small");
  return sizes.size === 1 ? [...sizes][0] : undefined;
}

function testResult(normalized: string, marker: string): TestResult | undefined {
  if (new RegExp(`\\b${marker}\\s*\\+`, "u").test(normalized)) return "positive";
  if (new RegExp(`\\b${marker}\\s*[-−–]`, "u").test(normalized)) return "negative";
  return undefined;
}

export function parseMedical(value: string): AnimalMedical | undefined {
  const normalized = value.normalize("NFC").toLocaleLowerCase("sl");
  const medical: AnimalMedical = {};

  // Only ever set true. The site's negatives ("sprejet nekastriran", "čaka jo
  // še sterilizacija") describe the state on arrival or a pending procedure,
  // neither of which says anything about the animal now.
  const neutered = normalized.match(
    /[^.!?…]*\b(?:steriliziran[ao]?|kastriran[ao]?)\b[^.!?…]*/u,
  );
  if (neutered && !/\b(?:čaka|še\s+ni|bo|pred)\b/u.test(neutered[0])) {
    medical.neutered = true;
  }

  // "aids" is what the cat listings call FIV.
  const fiv = testResult(normalized, "fiv") ?? testResult(normalized, "aids");
  if (fiv) medical.fiv = fiv;
  const felv = testResult(normalized, "felv");
  if (felv) medical.felv = felv;

  // "veterinarsko urejen" covers some mix of vaccination, chipping and
  // neutering without saying which, so it maps to nothing.
  return Object.keys(medical).length > 0 ? medical : undefined;
}

const CONTACT_PATTERNS = [
  /\S+@\S+\.\S+/u,
  /\bhttps?:\/\//iu,
  /\b0\d{1,2}[\s/-]?\d{3}[\s-]?\d{3}\b/u,
  /\bresni\s+(?:posvojitelji|kandidati)\b/iu,
  /\b(?:za\s+)?več\s+info\b/iu,
  /\bpokliče?\s+na\b/iu,
];

// The listings end in contact boilerplate carrying the shelter's mailbox, a
// mobile number and the odd Facebook link. None of it belongs in the dataset,
// so it is cut here rather than at the point of display.
export function stripContact(value: string): string | undefined {
  const kept = value
    // Split on the sentence end, whether or not a space survived it.
    .split(/(?<=[.!?…])(?:\s+|(?=\p{Lu}))/u)
    .filter((sentence) => !CONTACT_PATTERNS.some((p) => p.test(sentence)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return kept || undefined;
}

function parseImageUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $("img[src]").each((_, element) => {
    const src = $(element).attr("src");
    if (!src) return;
    let url: URL;
    try {
      url = new URL(src, BASE_URL);
    } catch {
      return;
    }
    if (url.origin !== BASE_URL) return;
    if (!url.pathname.startsWith("/wp-content/uploads/")) return;
    url.search = "";
    url.hash = "";
    urls.add(url.href);
  });
  return [...urls];
}

export function postFacts(post: WpPost): DetailFacts {
  const body = text(post.content);
  return {
    name: text(post.title) || undefined,
    // The category put the post on the list, so it is always readable here.
    // "other" reaching the dataset means the shelter renumbered its categories.
    species: postSpecies(post.categories) ?? "other",
    sex: parseSex(body),
    approximateAgeMonths: parseApproximateAgeMonths(body),
    size: parseSize(body),
    medical: parseMedical(body),
    description: stripContact(body),
    imageUrls: parseImageUrls(post.content),
  };
}

export function parseDetail(body: string): DetailFacts {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${PROVIDER_ID}: post payload is not JSON`);
  }
  const post = readPost(payload);
  if (!post) throw new Error(`${PROVIDER_ID}: post payload is not a post`);
  // parsePosts (the list path) already drops lost-and-found and adopted
  // posts before they ever reach a ref. This is the single-post endpoint
  // fetch() falls back to for an animal discover() never saw, and it has no
  // such filter of its own, so it has to repeat the check here rather than
  // let postFacts's "other" fallback hand back a full listing, description
  // and all, for a post that was never meant to be in the dataset.
  if (!postSpecies(post.categories)) {
    throw new Error(
      `${PROVIDER_ID}: post ${post.id} is not in an adoptable category`,
    );
  }
  return postFacts(post);
}

const IMAGE_RIGHTS: Record<ImagePolicy, ImageRights | null> = {
  none: null,
  remote: "display-permitted",
  "cache-permitted": "cache-permitted",
};

// discover() already receives every post in full. The payloads are parked here
// for fetch() to drain, which is what keeps a crawl at one request per hundred
// animals; a miss falls back to the single-post endpoint so fetch() still
// works when called on its own.
const discovered = new Map<string, WpPost>();

const provider: AdoptionProvider = {
  id: PROVIDER_ID,

  async discover(ctx) {
    discovered.clear();
    const refs = new Map<string, SourceAnimalRef>();

    for (const category of SPECIES_CATEGORIES.keys()) {
      let totalPages = 1;
      for (let page = 1; page <= totalPages; page++) {
        if (page > MAX_PAGES) {
          throw new Error(
            `${PROVIDER_ID}: category ${category} reports ${totalPages} pages, over the ${MAX_PAGES}-page limit`,
          );
        }
        const url = listUrl(ctx.policy.source, category, page);
        const res = await ctx.client.get(url);
        if (res.status !== 200 || res.body === null) {
          throw new Error(
            `${PROVIDER_ID}: list fetch failed with HTTP ${res.status} for ${url}`,
          );
        }
        const listPage = parsePage(res.body);
        const reported = parseTotalPages(res.headers);
        if (reported === undefined) {
          // A proxy or a security plugin can strip X-WP-TotalPages. Without
          // it a full page says nothing about what follows, and defaulting to
          // one page would cut the catalogue at a page boundary quietly
          // enough for the removal guard to accept the loss. A short page is
          // its own proof that no further page exists.
          if (listPage.count >= PER_PAGE) {
            throw new Error(
              `${PROVIDER_ID}: ${url} returned a full page without a usable X-WP-TotalPages header, cannot tell whether more animals follow`,
            );
          }
        } else {
          // Read on every page: the shelter can publish mid-crawl, and a total
          // that grew is the one case where trusting the first page's count
          // would drop animals without a trace.
          totalPages = Math.max(totalPages, reported);
        }
        for (const post of listPage.posts) {
          const ref = postRef(post);
          if (!ref) continue;
          discovered.set(ref.sourceAnimalId, post);
          refs.set(ref.sourceAnimalId, ref);
        }
      }
    }

    return [...refs.values()];
  },

  async fetch(ctx, ref) {
    const fetchedAt = new Date().toISOString();
    const cached = discovered.get(ref.sourceAnimalId);
    if (cached) return { ref, fetchedAt, data: postFacts(cached) };

    const url = `${ctx.policy.source}/${ref.sourceAnimalId}?_fields=${FIELDS}`;
    const res = await ctx.client.get(url);
    if (res.status !== 200 || res.body === null) {
      throw new Error(
        `${PROVIDER_ID}: detail fetch failed with HTTP ${res.status} for ${url}`,
      );
    }
    return { ref, fetchedAt, data: parseDetail(res.body) };
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
        name: "Zavetišče Turk",
        city: "Novo mesto",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      approximateAgeMonths: facts.approximateAgeMonths,
      size: facts.size,
      medical: facts.medical,
      // Membership of "Psi/Mačke, ki iščejo dom" is the shelter's own statement
      // that the animal is available, and discover() drops anything moved to
      // "V novem domu". The posts carry a publication date, which is not an
      // intake date, so intakeDate stays unset.
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
