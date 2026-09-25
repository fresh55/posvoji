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
  // The CMS id the list page identifies the animal by. fetch() compares it
  // with the ref it asked for.
  sourceAnimalId?: string;
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
  const stamp = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const instant = new Date(`${stamp}Z`);
  // V8 rolls impossible fields over ("02-30" becomes 2 March), so a stamp
  // that does not survive the round trip is not a real time.
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 19) !== stamp) {
    return undefined;
  }
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
  // "Ostali" includes rabbits, pigeons and other animals. The category
  // alone does not identify a species; preserve any breed separately.
  return "other";
}

function parseSize(option: CmsOption | undefined): AnimalSize | undefined {
  const value = stringValue(option?.value);
  return value === "small" || value === "medium" || value === "large"
    ? value
    : undefined;
}

function parseStatus(pet: CmsPet): AdoptionStatus {
  const slug = pet.state?.slug;
  if (slug === "poskusna-oddaja") return "hold";
  // No state set is the normal listed state. Any other, unrecognized state
  // slug is a CMS status we don't know how to interpret, so stay conservative
  // instead of guessing it means the animal is still available.
  if (slug === null || slug === undefined) return "available";
  return "unknown";
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

// Each term has to stand on its own: "nekastrirana" and "ni cepljena" contain
// the positive word and must not read as the positive claim.
const NOT_NEGATED = String.raw`(?<!\p{L})(?<!\bni\s+)`;
const NEUTERED = new RegExp(
  `${NOT_NEGATED}kastrirana\\s*\\/\\s*${NOT_NEGATED}sterilizirana`,
  "iu",
);
const MICROCHIPPED = new RegExp(`${NOT_NEGATED}mikročipirana`, "iu");
const VACCINATED = new RegExp(
  `${NOT_NEGATED}cepljena proti kužnim boleznim`,
  "iu",
);

function parseMedical(html: string): AnimalMedical | undefined {
  const text = cheerio.load(html).root().text().replace(/\s+/g, " ");
  const complete =
    text.includes("Žival je celovito oskrbljena") &&
    NEUTERED.test(text) &&
    MICROCHIPPED.test(text) &&
    VACCINATED.test(text);
  return complete
    ? { neutered: true, microchipped: true, vaccinated: true }
    : undefined;
}

// The CMS description field is a short run of paragraphs, e.g.
// "<p><strong>Opis</strong>: črn dolgodlak</p><p><strong>Datum rojstva</strong>:
// 13. 1. 2026</p>". Some listings add free-text paragraphs after "Opis", and
// some are plain prose with no "Opis" label at all. Any other leading bold
// label with a colon ("Datum rojstva", "Teža") restates a fact, and a prose
// copy goes stale when the CMS entry is corrected, so it is skipped. The
// colon sits inside the <strong> on some listings and outside on others, and
// the first word of the value can fall inside it too ("Opis: belo
// tigrasta"). Only the label is dropped.
const OPIS_LABEL = /^opis\b\s*:?\s*/i;

function isLabelledFact(paragraphText: string, labelText: string): boolean {
  if (!labelText || !paragraphText.startsWith(labelText)) return false;
  return labelText.includes(":") || paragraphText.slice(labelText.length).trimStart().startsWith(":");
}

export function parseDescription(descriptionHtml: string): string | undefined {
  const $ = cheerio.load(descriptionHtml);
  const paragraphs: { opis: boolean; text: string }[] = [];

  $("p").each((_, element) => {
    const paragraph = $(element);
    const label = paragraph.children("strong").first();
    const labelText = label.text().replace(/\s+/g, " ").trim();

    if (OPIS_LABEL.test(labelText)) {
      // Drop the label itself, keep whatever the shelter wrote after it,
      // including any value word that bled into the <strong> run.
      const bledValue = labelText.replace(OPIS_LABEL, "");
      const rest = paragraph
        .clone()
        .children("strong")
        .remove()
        .end()
        .text()
        .replace(/\s+/g, " ")
        .replace(/^\s*:\s*/, "")
        .trim();
      const text = [bledValue, rest].filter(Boolean).join(" ").trim();
      if (text) paragraphs.push({ opis: true, text });
      return;
    }

    const text = paragraph.text().replace(/\s+/g, " ").trim();
    if (text && !isLabelledFact(text, labelText)) paragraphs.push({ opis: false, text });
  });

  if (paragraphs.length === 0) return undefined;
  // Keep the "Opis" paragraph and everything the shelter wrote after it. When
  // there is no "Opis" paragraph at all, the whole thing is plain prose.
  const opisIndex = paragraphs.findIndex((paragraph) => paragraph.opis);
  const kept = opisIndex === -1 ? paragraphs : paragraphs.slice(opisIndex);
  const joined = kept.map((paragraph) => paragraph.text).join("\n\n");
  return joined || undefined;
}

export function parseDetail(html: string): DetailFacts {
  const value = nextData(html)?.props?.pageProps?.pet;
  // A maintenance page answers 200 without the pet payload. Read as an empty
  // record it would normalize into a schema-valid animal with no name, no
  // photos and species "other", overwriting everything the shelter published.
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${PROVIDER_ID}: detail page has no pet data`);
  }
  const pet = value as CmsPet;
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
    sourceAnimalId: stringValue(pet.id),
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
    const data = parseDetail(res.body);
    // normalize() takes the identity from the ref, so a 200 carrying another
    // animal would be filed under the requested one. parseList reads the same
    // CMS id field, so the two are directly comparable.
    if (data.sourceAnimalId !== ref.sourceAnimalId) {
      throw new Error(
        `${PROVIDER_ID}: detail page for ${ref.sourceAnimalId} returned ` +
          `${data.sourceAnimalId ?? "no id"}`,
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
