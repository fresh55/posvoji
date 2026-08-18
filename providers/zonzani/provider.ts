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

const BASE_URL = "https://www.zonzani.si";
const PROVIDER_ID = "zonzani";
const DETAIL_PATH = /^\/zivali\/(\d+)\/?$/;

export interface DetailFacts {
  sourceAnimalId?: string;
  name?: string;
  species?: Species;
  sex?: Sex;
  breed?: string;
  birthDate?: string;
  approximateAgeMonths?: number;
  size?: AnimalSize;
  status: AdoptionStatus;
  intakeDate?: string;
  foundDate?: string;
  foundPlace?: string;
  imageUrls: string[];
}

function sameSiteUrl(value: string): URL | undefined {
  try {
    const url = new URL(value, BASE_URL);
    return url.origin === BASE_URL ? url : undefined;
  } catch {
    return undefined;
  }
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs = new Map<string, SourceAnimalRef>();
  $("article.project").each((_, element) => {
    const href = $(element).find(".cmsms_project_title a").first().attr("href");
    const url = href ? sameSiteUrl(href) : undefined;
    const sourceAnimalId = url?.pathname.match(DETAIL_PATH)?.[1];
    if (!sourceAnimalId) return;
    refs.set(sourceAnimalId, {
      sourceAnimalId,
      sourceUrl: `${BASE_URL}/zivali/${sourceAnimalId}/`,
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

function readDetails($: cheerio.CheerioAPI): Map<string, string> {
  const details = new Map<string, string>();
  $(".project_details_item").each((_, element) => {
    const row = $(element);
    const label = normalizeLabel(row.children(".project_details_item_title").text());
    const value = row
      .children(".project_details_item_desc")
      .text()
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
    if (label && value && !details.has(label)) details.set(label, value);
  });
  return details;
}

// Zonzani currently uses d.m.yyyy, with either zero-padded or bare parts.
// Reject prose and impossible dates rather than silently changing their facts.
export function parseSlovenianDate(value: string): string | undefined {
  const match = value
    .normalize("NFC")
    .trim()
    .match(/^(\d{1,2})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{4})\s*[.]?$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10) === iso ? iso : undefined;
}

// Integer ages explicitly stated by the shelter. Ranges and upper bounds stay
// unknown: choosing one endpoint would make the cards more precise than the
// source. Supports the common combined form as well as plain years or months.
export function parseAgeMonths(value: string): number | undefined {
  if (/manj\s+kot|\d\s*[-–]\s*\d/i.test(value)) return undefined;
  const years = value.match(/(?<![\d,.-])(\d+)\s*let/i);
  const months = value.match(/(?<![\d,.-])(\d+)\s*mesec/i);
  if (!years && !months) return undefined;
  return (years ? Number(years[1]) * 12 : 0) + (months ? Number(months[1]) : 0);
}

const SEX: Record<string, Sex> = {
  samec: "male",
  "samček": "male",
  samica: "female",
  "samička": "female",
};

const SIZE: Record<string, AnimalSize> = {
  "manjše rasti": "small",
  "srednje rasti": "medium",
  "večje rasti": "large",
};

export function parseStatus(value: string): AdoptionStatus {
  const normalized = value.normalize("NFC").toLowerCase();
  if (/\(\s*karantena\s*\)/i.test(normalized)) return "hold";
  if (/\(\s*rezerviran(?:a|o)?\s*\)/i.test(normalized)) return "reserved";
  return "available";
}

function addImageUrl(urls: string[], value: string | undefined): void {
  const url = value ? sameSiteUrl(value) : undefined;
  if (!url || !url.pathname.startsWith("/wp-content/uploads/")) return;
  const clean = `${BASE_URL}${url.pathname}`;
  if (!urls.includes(clean)) urls.push(clean);
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const article = $("article.project").first();
  const details = readDetails($);
  const heading = article
    .find(".cmsms_project_title")
    .first()
    .text()
    .normalize("NFC")
    .trim();
  const sex = details.get("spol")?.toLowerCase();
  const size = details.get("velikost")?.toLowerCase();
  const imageUrls: string[] = [];

  article.find(".project_content a[rel^='ilightbox']").each((_, element) => {
    addImageUrl(imageUrls, $(element).attr("href"));
  });
  // Older posts may expose only an image. Prefer the widest URL explicitly
  // present in srcset; never invent an original filename by stripping a suffix.
  if (imageUrls.length === 0) {
    article.find(".project_content img").each((_, element) => {
      const image = $(element);
      const candidates = (image.attr("srcset") ?? "")
        .split(",")
        .map((part) => {
          const [url, width] = part.trim().split(/\s+/);
          return { url, width: Number.parseInt(width ?? "", 10) || 0 };
        })
        .filter((candidate): candidate is { url: string; width: number } =>
          Boolean(candidate.url),
        );
      const widest = candidates.reduce<{ url?: string; width: number }>(
        (best, candidate) => (candidate.width > best.width ? candidate : best),
        { width: 0 },
      );
      addImageUrl(imageUrls, widest.url ?? image.attr("src"));
    });
  }

  const sourceAnimalId = details.get("evidenčna številka");
  return {
    sourceAnimalId: sourceAnimalId?.match(/^\d+$/)?.[0],
    name: details.get("ime") || undefined,
    species: article.hasClass("pj-categs-psi")
      ? "dog"
      : article.hasClass("pj-categs-macke")
        ? "cat"
        : undefined,
    sex: sex ? (SEX[sex] ?? "unknown") : undefined,
    breed: details.get("pasma") || undefined,
    birthDate: details.get("rojstvo")
      ? parseSlovenianDate(details.get("rojstvo")!)
      : undefined,
    approximateAgeMonths: details.get("starost")
      ? parseAgeMonths(details.get("starost")!)
      : undefined,
    size: size ? SIZE[size] : undefined,
    status: parseStatus(heading),
    intakeDate: details.get("datum sprejema")
      ? parseSlovenianDate(details.get("datum sprejema")!)
      : undefined,
    foundDate: details.get("datum najdbe")
      ? parseSlovenianDate(details.get("datum najdbe")!)
      : undefined,
    foundPlace: details.get("kraj najdbe") || undefined,
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
    const refs = new Map<string, SourceAnimalRef>();
    for (const path of ["psi", "macke"]) {
      const url = `${ctx.policy.source}/${path}/`;
      const response = await ctx.client.get(url);
      if (response.status !== 200 || response.body === null) {
        throw new Error(
          `${PROVIDER_ID}: list fetch failed with HTTP ${response.status} for ${url}`,
        );
      }
      for (const ref of parseList(response.body)) refs.set(ref.sourceAnimalId, ref);
    }
    return [...refs.values()];
  },

  async fetch(ctx, ref) {
    const response = await ctx.client.get(ref.sourceUrl);
    if (response.status !== 200 || response.body === null) {
      throw new Error(
        `${PROVIDER_ID}: detail fetch failed with HTTP ${response.status}`,
      );
    }
    const data = parseDetail(response.body);
    if (data.sourceAnimalId && data.sourceAnimalId !== ref.sourceAnimalId) {
      throw new Error(
        `${PROVIDER_ID}: detail identity mismatch (${ref.sourceAnimalId} != ${data.sourceAnimalId})`,
      );
    }
    return { ref, fetchedAt: new Date().toISOString(), data };
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
        name: "Zavetišče Zonzani",
        city: "Dramlje",
      },
      name: facts.name,
      species: facts.species ?? "other",
      sex: facts.sex,
      breed: facts.breed,
      birthDate: facts.birthDate,
      approximateAgeMonths: facts.approximateAgeMonths,
      size: facts.size,
      status: facts.status,
      intakeDate: facts.intakeDate,
      foundDate: facts.foundDate,
      originMunicipality: facts.foundPlace,
      images:
        rights === null
          ? []
          : facts.imageUrls.map((sourceUrl) => ({ sourceUrl, rights })),
      attribution: ctx.policy.attribution,
    };
  },
};

export default provider;
