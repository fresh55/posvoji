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

const BASE_URL = "https://zavetisce-mb.si";
const PROVIDER_ID = "maribor";

export interface DetailFacts {
  name?: string;
  species: Species;
  sex?: Sex;
  breed?: string;
  approximateAgeMonths?: number;
  size?: AnimalSize;
  status: AdoptionStatus;
  intakeDate?: string;
  medical?: AnimalMedical;
  description?: string;
  imageUrls: string[];
}

function animalId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, BASE_URL);
    if (url.origin !== BASE_URL || url.pathname !== "/zival/") return undefined;
    const id = url.searchParams.get("animal_id");
    return id && /^\d+$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs = new Map<string, SourceAnimalRef>();

  $(".jhmb-animal-card > a.jhmb-full-card-link").each((_, el) => {
    const sourceAnimalId = animalId($(el).attr("href"));
    if (!sourceAnimalId || refs.has(sourceAnimalId)) return;
    refs.set(sourceAnimalId, {
      sourceAnimalId,
      sourceUrl: `${BASE_URL}/zival/?animal_id=${sourceAnimalId}`,
    });
  });

  return [...refs.values()];
}

function labelValue(
  $: cheerio.CheerioAPI,
  label: string,
): string | undefined {
  const item = $(".jhmb-info-grid .jhmb-info-item")
    .filter((_, el) =>
      $(el).find(".info-label").first().text().trim().localeCompare(label, "sl", {
        sensitivity: "base",
      }) === 0,
    )
    .first();
  return item.find(".info-value").first().text().replace(/\s+/g, " ").trim() || undefined;
}

export function parseSlovenianDate(value: string): string | undefined {
  const match = value.match(/(?:^|\s)(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s|$)/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
    ? iso
    : undefined;
}

// The shelter writes half years as "1,5 leta". Matching only `\d+` on a word
// boundary takes the "5" and publishes five years, so the count has to take
// the separator and its decimals with it, and the lookbehind has to stop the
// pattern from starting in the middle of a number.
const AGE_COUNT = "(?<![\\d,.])(\\d+(?:[.,]\\d+)?)";

function ageCount(raw: string | undefined): number {
  return Number((raw ?? "").replace(",", "."));
}

export function parseApproximateAgeMonths(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const years = value.match(
    new RegExp(`${AGE_COUNT}\\s*(?:leto|leti|leta|let)\\b`, "i"),
  );
  if (years) return Math.round(ageCount(years[1]) * 12);
  const months = value.match(
    new RegExp(`${AGE_COUNT}\\s*(?:mesec|meseca|mesece|mesecev)\\b`, "i"),
  );
  return months ? Math.round(ageCount(months[1])) : undefined;
}

function parseSex(value: string | undefined): Sex | undefined {
  const normalized = value?.toLocaleLowerCase("sl");
  if (normalized === "samec") return "male";
  if (normalized === "samica" || normalized === "samička") return "female";
  return normalized ? "unknown" : undefined;
}

function parseSize(value: string | undefined): AnimalSize | undefined {
  const normalized = value?.toLocaleLowerCase("sl");
  if (normalized === "mala") return "small";
  if (normalized === "srednja") return "medium";
  if (normalized === "velika") return "large";
  return undefined;
}

function parseSpecies($: cheerio.CheerioAPI): Species {
  const icon = $(".jhmb-detail-header-modern .jhmb-pet-icon i").first();
  if (icon.hasClass("fa-dog")) return "dog";
  if (icon.hasClass("fa-cat")) return "cat";
  return "other";
}

function parseStatus($: cheerio.CheerioAPI): AdoptionStatus {
  const value = $(".jhmb-status-pill").first().text().replace(/\s+/g, " ").trim().toLocaleLowerCase("sl");
  if (value === "za posvojitev") return "available";
  if (value.includes("rezerv")) return "reserved";
  if (value.includes("oddan")) return "adopted";
  return "unknown";
}

function sameSiteImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, BASE_URL);
    if (url.origin !== BASE_URL || !url.pathname.startsWith("/wp-content/uploads/")) {
      return undefined;
    }
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function parseMedical($: cheerio.CheerioAPI): AnimalMedical | undefined {
  const medical: AnimalMedical = {};
  $(".jhmb-health-card.active").each((_, el) => {
    const card = $(el);
    if (card.find(".status-badge").first().text().trim().toLocaleLowerCase("sl") !== "da") return;
    const label = card.find(".status-label").first().text().replace(/\s+/g, " ").trim().toLocaleLowerCase("sl");
    if (label.includes("cepljen")) medical.vaccinated = true;
    if (label.includes("kastriran") || label.includes("steriliz")) medical.neutered = true;
    if (label.includes("čipiran")) medical.microchipped = true;
  });
  return Object.keys(medical).length > 0 ? medical : undefined;
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const imageUrls: string[] = [];
  const addImage = (value: string | undefined) => {
    const url = sameSiteImage(value);
    if (url && !imageUrls.includes(url)) imageUrls.push(url);
  };
  const thumbnails = $(".jhmb-detail-gallery .jhmb-thumbnails [data-full]");
  if (thumbnails.length > 0) {
    thumbnails.each((_, el) => addImage($(el).attr("data-full")));
  } else {
    addImage($(".jhmb-detail-gallery .jhmb-main-image[data-full]").first().attr("data-full"));
  }

  const intakeText = $(".jhmb-detail-meta-footer").first().text().replace(/\s+/g, " ").trim();
  const description = $(".jhmb-detail-description .jhmb-desc-content")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: $(".jhmb-detail-title-modern").first().text().replace(/\s+/g, " ").trim() || undefined,
    species: parseSpecies($),
    sex: parseSex(labelValue($, "Spol")),
    breed: labelValue($, "Pasma"),
    approximateAgeMonths: parseApproximateAgeMonths(labelValue($, "Starost")),
    size: parseSize(labelValue($, "Velikost")),
    status: parseStatus($),
    intakeDate: parseSlovenianDate(intakeText),
    medical: parseMedical($),
    description: description || undefined,
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
      throw new Error(`${PROVIDER_ID}: list fetch failed with HTTP ${response.status}`);
    }
    return parseList(response.body);
  },

  async fetch(ctx, ref) {
    if (animalId(ref.sourceUrl) !== ref.sourceAnimalId) {
      throw new Error(`${PROVIDER_ID}: refused non-animal detail URL`);
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
        name: "Zavetišče Maribor (Snaga)",
        city: "Maribor",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      breed: facts.breed,
      approximateAgeMonths: facts.approximateAgeMonths,
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
