import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type { ImagePolicy, ImageRights, Sex, Species } from "@posvoji/schema";

const BASE_URL = "https://obalnozavetisce.si";
const PROVIDER_ID = "obalno";
const LIST_URLS = [
  `${BASE_URL}/iscejo-nov-dom/psi/`,
  `${BASE_URL}/iscejo-nov-dom/macke/`,
] as const;

export interface DetailFacts {
  name: string;
  species: Species;
  sex?: Sex;
  birthDate?: string;
  daysInShelter?: number;
  description?: string;
  imageUrls: string[];
}

function animalSlug(href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href, BASE_URL);
  } catch {
    return undefined;
  }
  if (url.origin !== BASE_URL) return undefined;
  const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "žival") return undefined;
  return parts[1];
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs = new Map<string, SourceAnimalRef>();

  $("article.animal-post > a[rel='article']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const sourceAnimalId = animalSlug(href);
    if (!sourceAnimalId) return;
    const sourceUrl = new URL(href, BASE_URL).href;
    refs.set(sourceAnimalId, { sourceAnimalId, sourceUrl });
  });

  return [...refs.values()];
}

function labelValue(
  $: cheerio.CheerioAPI,
  label: string,
): string | undefined {
  const box = $(".info-box .data-box")
    .filter((_, el) =>
      $(el).find(".label").first().text().trim().localeCompare(label, "sl", {
        sensitivity: "base",
      }) === 0,
    )
    .first();
  return box.find(".data").first().text().trim() || undefined;
}

export function parseSlashDate(value: string): string | undefined {
  const match = value.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso
    ? iso
    : undefined;
}

function parseSex(value: string | undefined): Sex | undefined {
  const normalized = value?.trim().toLocaleLowerCase("sl");
  if (normalized === "samec") return "male";
  if (normalized === "samička" || normalized === "samica") return "female";
  return normalized ? "unknown" : undefined;
}

function parseSpecies($: cheerio.CheerioAPI): Species {
  const classes = $("article.main-content").first().attr("class") ?? "";
  if (/\banimal_type-dog\b/.test(classes)) return "dog";
  if (/\banimal_type-cat\b/.test(classes)) return "cat";
  return "other";
}

function sameSiteImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, BASE_URL);
    if (
      url.origin !== BASE_URL ||
      !url.pathname.startsWith("/wp-content/uploads/")
    ) {
      return undefined;
    }
    return `${BASE_URL}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  const paragraphs: string[] = [];
  $("article.main-content").first().find(".entry-content.animal > p").each((_, el) => {
    const paragraph = $(el).text().replace(/\s+/g, " ").trim();
    if (
      !paragraph ||
      $(el).find("a[href^='mailto:'], a[href^='tel:']").length > 0 ||
      /^Za vse dodatne informacije/i.test(paragraph)
    ) {
      return;
    }
    paragraphs.push(paragraph);
  });
  return paragraphs.length > 0 ? paragraphs.join("\n\n") : undefined;
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const root = $("article.main-content").first();
  const daysText = root.find(".date-badge").first().text();
  const daysMatch = daysText.match(/V\s+zavetišču\s+sem\s+že\s+(\d+)\s+dni/i);
  const birthRaw = labelValue($, "ROJSTVO");
  const imageUrls: string[] = [];
  const addImage = (value: string | undefined) => {
    const url = sameSiteImageUrl(value);
    if (url && !imageUrls.includes(url)) imageUrls.push(url);
  };
  addImage($(".page-header img.wp-post-image").first().attr("src"));
  root.find(".pet-gallery a[data-fancybox]").each((_, el) => {
    addImage($(el).attr("href"));
  });

  return {
    name: labelValue($, "IME") ?? $("h1").first().text().trim(),
    species: parseSpecies($),
    sex: parseSex(labelValue($, "SPOL")),
    birthDate: birthRaw ? parseSlashDate(birthRaw) : undefined,
    daysInShelter: daysMatch ? Number(daysMatch[1]) : undefined,
    description: parseDescription($),
    imageUrls,
  };
}

export function intakeDateFromDays(
  daysInShelter: number | undefined,
  fetchedAt: string,
): string | undefined {
  if (daysInShelter === undefined || !Number.isInteger(daysInShelter) || daysInShelter < 0) {
    return undefined;
  }
  const instant = new Date(fetchedAt);
  if (Number.isNaN(instant.getTime())) return undefined;

  // The badge is generated in the shelter's local calendar. Anchor the rolling
  // count to that date so a crawl around UTC midnight cannot shift intake.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Ljubljana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) return undefined;

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() - daysInShelter);
  return date.toISOString().slice(0, 10);
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
      const res = await ctx.client.get(url);
      if (res.status !== 200 || res.body === null) {
        throw new Error(`${PROVIDER_ID}: list fetch failed with HTTP ${res.status}`);
      }
      for (const ref of parseList(res.body)) refs.set(ref.sourceAnimalId, ref);
    }
    return [...refs.values()];
  },

  async fetch(ctx, ref) {
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
        name: "Obalno zavetišče (Marjetica Koper)",
        city: "Koper",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      birthDate: facts.birthDate,
      intakeDate: intakeDateFromDays(facts.daysInShelter, raw.fetchedAt),
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
