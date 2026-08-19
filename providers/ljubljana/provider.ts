import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  AdoptionStatus,
  AnimalMedical,
  AnimalSize,
  ImagePolicy,
  ImageRights,
  Sex,
  Species,
} from "@posvoji/schema";

const BASE_URL = "https://www.zavetisce-ljubljana.si";
const IMAGE_ORIGIN = "https://zavetisce.fra1.digitaloceanspaces.com";
const PROVIDER_ID = "ljubljana";
const DETAIL_PATH = /^\/zivali\/([a-z0-9-]+)$/;

type CmsOption = { label?: unknown; value?: unknown } | null;
type CmsPhoto = { permalink?: unknown; is_image?: unknown };

interface CmsPet {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  animal_id?: unknown;
  date?: unknown;
  date_of_birth?: unknown;
  breed?: unknown;
  description?: unknown;
  spol?: CmsOption;
  size?: CmsOption;
  photos?: unknown;
  type?: { slug?: unknown; title?: unknown } | null;
  state?: { slug?: unknown } | null;
  type_adoption?: { slug?: unknown } | null;
  contact?: unknown;
}

interface NextData {
  props?: {
    pageProps?: {
      page?: {
        list?: { slug?: unknown };
        pets?: unknown;
      };
      pet?: unknown;
    };
  };
}

export interface DetailFacts {
  name?: string;
  species: Species;
  sex?: Sex;
  breed?: string;
  birthDate?: string;
  intakeDate?: string;
  size?: AnimalSize;
  status: AdoptionStatus;
  medical?: AnimalMedical;
  description?: string;
  imageUrls: string[];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nextData(html: string): NextData | undefined {
  const $ = cheerio.load(html);
  const raw = $("script#__NEXT_DATA__[type='application/json']").first().text();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as NextData;
  } catch {
    return undefined;
  }
}

function validSlug(value: unknown): string | undefined {
  const slug = stringValue(value);
  return slug && /^[a-z0-9-]+$/.test(slug) ? slug : undefined;
}

export function parseList(html: string): SourceAnimalRef[] {
  const page = nextData(html)?.props?.pageProps?.page;
  // This guard is what keeps the similarly-shaped private-owner catalogue out.
  if (page?.list?.slug !== "za-oddajo" || !Array.isArray(page.pets)) return [];

  const refs = new Map<string, SourceAnimalRef>();
  for (const value of page.pets) {
    if (typeof value !== "object" || value === null) continue;
    const pet = value as CmsPet;
    const id = stringValue(pet.id);
    const slug = validSlug(pet.slug);
    if (
      !id ||
      !slug ||
      pet.contact != null ||
      pet.type_adoption?.slug !== "za-oddajo"
    ) {
      continue;
    }
    if (!refs.has(id)) {
      refs.set(id, {
        sourceAnimalId: id,
        sourceUrl: `${BASE_URL}/zivali/${slug}`,
      });
    }
  }
  return [...refs.values()];
}

// CMS timestamps are stored as UTC instants without a zone. Convert them to
// the Ljubljana calendar date shown on the page instead of truncating at UTC.
export function parseCmsDate(value: string): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (Number.isNaN(instant.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Ljubljana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const localYear = part("year");
  const localMonth = part("month");
  const localDay = part("day");
  return localYear && localMonth && localDay
    ? `${localYear}-${localMonth}-${localDay}`
    : undefined;
}

function parseSex(option: CmsOption | undefined): Sex | undefined {
  const value = stringValue(option?.value)?.toLocaleLowerCase("sl");
  if (value === "samec") return "male";
  if (value === "samica") return "female";
  return value ? "unknown" : undefined;
}

function parseSpecies(pet: CmsPet): Species {
  const slug = stringValue(pet.type?.slug);
  if (slug === "pes") return "dog";
  if (slug === "macka") return "cat";
  // Ljubljana groups rabbits under its third, "Ostali" tab. This mapping is
  // provider-specific and follows the shelter catalogue audit confirmed by
  // the project owner; unknown future type slugs still remain "other".
  if (slug === "ostali") return "rabbit";
  return "other";
}

function parseSize(option: CmsOption | undefined): AnimalSize | undefined {
  const value = stringValue(option?.value);
  return value === "small" || value === "medium" || value === "large"
    ? value
    : undefined;
}

function parseStatus(pet: CmsPet): AdoptionStatus {
  return pet.state?.slug === "poskusna-oddaja" ? "hold" : "available";
}

function imageUrl(photo: CmsPhoto): string | undefined {
  if (photo.is_image === false) return undefined;
  const value = stringValue(photo.permalink);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.origin !== IMAGE_ORIGIN || !url.pathname.startsWith("/zivali/")) {
      return undefined;
    }
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function parseMedical(html: string): AnimalMedical | undefined {
  const text = cheerio.load(html).root().text().replace(/\s+/g, " ");
  const complete =
    text.includes("Žival je celovito oskrbljena") &&
    /kastrirana\s*\/\s*sterilizirana/i.test(text) &&
    /mikročipirana/i.test(text) &&
    /cepljena proti kužnim boleznim/i.test(text);
  return complete
    ? { neutered: true, microchipped: true, vaccinated: true }
    : undefined;
}

// The CMS description field is a short run of labelled paragraphs, e.g.
// "<p><strong>Opis</strong>: črn dolgodlak</p><p><strong>Datum rojstva</strong>:
// 13. 1. 2026</p>". Only the "Opis" paragraph is editorial text; the rest
// restate facts the schema already carries in their own fields, and a date
// repeated as prose would go stale the moment the CMS entry is corrected.
// The colon sits inside the <strong> on some listings and outside on others.
const OPIS_LABEL = /^\s*opis\s*:?\s*$/i;

export function parseDescription(descriptionHtml: string): string | undefined {
  const $ = cheerio.load(descriptionHtml);
  const parts: string[] = [];
  $("p").each((_, element) => {
    const paragraph = $(element);
    const label = paragraph.children("strong").first();
    if (!OPIS_LABEL.test(label.text())) return;
    // Drop the label itself, keep whatever the shelter wrote after it.
    const text = paragraph
      .clone()
      .children("strong")
      .remove()
      .end()
      .text()
      .replace(/\s+/g, " ")
      .replace(/^\s*:\s*/, "")
      .trim();
    if (text) parts.push(text);
  });
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function parseDetail(html: string): DetailFacts {
  const value = nextData(html)?.props?.pageProps?.pet;
  const pet: CmsPet =
    typeof value === "object" && value !== null ? (value as CmsPet) : {};
  const birthRaw = stringValue(pet.date_of_birth);
  const intakeRaw = stringValue(pet.date);
  const imageUrls: string[] = [];
  if (Array.isArray(pet.photos)) {
    for (const value of pet.photos) {
      if (typeof value !== "object" || value === null) continue;
      const url = imageUrl(value as CmsPhoto);
      if (url && !imageUrls.includes(url)) imageUrls.push(url);
    }
  }

  return {
    name: stringValue(pet.title),
    species: parseSpecies(pet),
    sex: parseSex(pet.spol),
    breed: stringValue(pet.breed),
    birthDate: birthRaw ? parseCmsDate(birthRaw) : undefined,
    intakeDate: intakeRaw ? parseCmsDate(intakeRaw) : undefined,
    size: parseSize(pet.size),
    status: parseStatus(pet),
    medical: parseMedical(html),
    description: (() => {
      const raw = stringValue(pet.description);
      return raw ? parseDescription(raw) : undefined;
    })(),
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
    const url = new URL(ref.sourceUrl);
    if (url.origin !== BASE_URL || !DETAIL_PATH.test(url.pathname)) {
      throw new Error(`${PROVIDER_ID}: refused non-animal detail URL`);
    }
    const res = await ctx.client.get(ref.sourceUrl);
    if (res.status !== 200 || res.body === null) {
      throw new Error(`${PROVIDER_ID}: detail fetch failed with HTTP ${res.status}`);
    }
    return {
      ref,
      fetchedAt: new Date().toISOString(),
      data: parseDetail(res.body),
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
        name: "Zavetišče Ljubljana",
        city: "Ljubljana",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      breed: facts.breed,
      birthDate: facts.birthDate,
      size: facts.size,
      status: facts.status,
      intakeDate: facts.intakeDate,
      medical: facts.medical,
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
