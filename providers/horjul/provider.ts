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
  TestResult,
} from "@posvoji/schema";

const BASE_URL = "https://www.zavetisce-horjul.net";
const PROVIDER_ID = "horjul";

export interface DetailFacts {
  sourceAnimalId?: string;
  name?: string;
  species?: Species;
  sex?: Sex;
  intakeAgeMonths?: number;
  size?: AnimalSize;
  status: AdoptionStatus;
  intakeDate?: string;
  originMunicipality?: string;
  medical?: AnimalMedical;
  description?: string;
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
  $(".gbx__item[data-postid][data-link]").each((_, element) => {
    const item = $(element);
    const sourceAnimalId = item.attr("data-postid")?.match(/^\d+$/)?.[0];
    const url = sameSiteUrl(item.attr("data-link") ?? "");
    if (!sourceAnimalId || !url || !/^\/[^/]+\/$/.test(url.pathname)) return;
    refs.set(sourceAnimalId, {
      sourceAnimalId,
      sourceUrl: `${BASE_URL}${url.pathname}`,
    });
  });
  return [...refs.values()];
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string): string {
  return normalizeText(value).replace(/\s*:+$/, "").toLowerCase();
}

function readHeadingFacts($: cheerio.CheerioAPI): Map<string, string> {
  const facts = new Map<string, string>();
  $("main h2").each((_, element) => {
    const heading = $(element);
    const label = normalizeLabel(heading.text());
    if (!label) return;
    const container = heading.closest("[data-element_type='container']");
    const value = normalizeText(container.find("h5").first().text());
    if (value && !facts.has(label)) facts.set(label, value);
  });
  return facts;
}

function readLabeledBlock($: cheerio.CheerioAPI): string {
  const block = $("main .elementor-widget-text-editor")
    .filter((_, element) => /datum\s+sprejema\s*:/i.test($(element).text()))
    .first()
    .clone();
  block.find("br").replaceWith("\n");
  return block
    .text()
    .normalize("NFC")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

function lineValue(text: string, label: RegExp): string | undefined {
  const match = text.match(new RegExp(`${label.source}\\s*([^\\n]+)`, "i"));
  return match?.[1]?.trim() || undefined;
}

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

// Only exact numeric ages are mapped. Prose such as "mlada odrasla" and
// "nekaj ur" stays unknown rather than being turned into a guessed number.
export function parseAgeMonths(value: string): number | undefined {
  const normalized = normalizeText(value).toLowerCase();
  const combined = normalized.match(
    /^(\d+)\s*(?:let|leta|leti|leto)\s+(?:in\s+)?(\d+)\s*(?:mesecev|mesece|meseca|mesec)$/,
  );
  if (combined) return Number(combined[1]) * 12 + Number(combined[2]);
  const years = normalized.match(/^(\d+)(?:[,.](5))?\s*(?:let|leta|leti|leto)$/);
  if (years) return Number(years[1]) * 12 + (years[2] ? 6 : 0);
  const months = normalized.match(/^(\d+)\s*(?:mesecev|mesece|meseca|mesec)$/);
  if (months) return Number(months[1]);
  const weeks = normalized.match(/^(\d+)\s*(?:teden|tedna|tedne|tednov)$/);
  // approximateAgeMonths is intentionally month-granular. Convert an exact
  // stated week count to the nearest month rather than dropping useful age
  // evidence (8–9 weeks is approximately two months).
  return weeks ? Math.round((Number(weeks[1]) * 12) / 52) : undefined;
}

const SEX: Record<string, Sex> = {
  "moški": "male",
  "ženski": "female",
};

function parseSize(value: string | undefined): AnimalSize | undefined {
  const normalized = value?.toLowerCase();
  if (normalized?.startsWith("majh")) return "small";
  if (normalized?.startsWith("srednje")) return "medium";
  if (normalized?.startsWith("velik")) return "large";
  return undefined;
}

export function parseStatus(value: string | undefined): AdoptionStatus {
  const normalized = value?.normalize("NFC").toLowerCase();
  if (normalized?.includes("rezerv")) return "reserved";
  if (normalized?.includes("karanten")) return "hold";
  if (normalized?.includes("išče dom")) return "available";
  if (normalized?.includes("oddana") || normalized?.includes("novem domu")) {
    return "adopted";
  }
  return "unknown";
}

function parseMedical(facts: Map<string, string>): AnimalMedical | undefined {
  const care = facts.get("veterinarska oskrba")?.toLowerCase() ?? "";
  const medical: AnimalMedical = {};
  if (/steriliziran|kastriran/.test(care)) medical.neutered = true;
  if (/cepljen/.test(care)) medical.vaccinated = true;
  if (/čipiran/.test(care)) medical.microchipped = true;

  const tests = facts.get("felv+fiv")?.toLowerCase();
  const result: TestResult | undefined = tests?.startsWith("negativ")
    ? "negative"
    : tests?.startsWith("pozitiv")
      ? "positive"
      : undefined;
  if (result) {
    medical.felv = result;
    medical.fiv = result;
  }
  return Object.keys(medical).length > 0 ? medical : undefined;
}

function addImageUrl(urls: string[], value: string | undefined): void {
  const url = value ? sameSiteUrl(value) : undefined;
  if (!url || !url.pathname.startsWith("/wp-content/uploads/")) return;
  const clean = `${BASE_URL}${url.pathname}`;
  if (!urls.includes(clean)) urls.push(clean);
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const main = $("main.site-main").first();
  const facts = readHeadingFacts($);
  const labeledBlock = readLabeledBlock($);
  const mainClasses = main.attr("class") ?? "";
  const imageUrls: string[] = [];

  main.find(".elementor-widget-image-carousel a[href]").each((_, element) => {
    addImageUrl(imageUrls, $(element).attr("href"));
  });
  if (imageUrls.length === 0) {
    main.find(".elementor-widget-image-carousel img[src]").each((_, element) => {
      addImageUrl(imageUrls, $(element).attr("src"));
    });
  }
  // Journal entries use Elementor galleries whose full-size photos are link
  // targets and whose visible thumbnails are CSS backgrounds, not <img>s.
  // Read only gallery links inside the animal's <main> to avoid site chrome,
  // donation images and other unrelated uploads.
  main
    .find(".elementor-widget-gallery a.e-gallery-item[href]")
    .each((_, element) => {
      addImageUrl(imageUrls, $(element).attr("href"));
    });

  const foundPlace = lineValue(labeledBlock, /mesto\s+najdbe\s*:/);
  const municipality = foundPlace?.match(/^občina\s+(.+)$/i)?.[1]?.trim();
  const sexRaw = facts.get("spol")?.toLowerCase();
  return {
    sourceAnimalId: mainClasses.match(/(?:^|\s)post-(\d+)(?:\s|$)/)?.[1],
    name: normalizeText(main.find("h2").first().text()) || undefined,
    species: /(?:^|\s)category-psi(?:\s|$)/.test(mainClasses)
      ? "dog"
      : /(?:^|\s)category-macke(?:\s|$)/.test(mainClasses)
        ? "cat"
        : /(?:^|\s)category-druge_zivali(?:\s|$)/.test(mainClasses)
          ? "other"
          : undefined,
    sex: sexRaw ? (SEX[sexRaw] ?? "unknown") : undefined,
    intakeAgeMonths: facts.get("starost ob sprejemu")
      ? parseAgeMonths(facts.get("starost ob sprejemu")!)
      : undefined,
    size: parseSize(facts.get("velikost")),
    status: parseStatus(lineValue(labeledBlock, /status\s*:/)),
    intakeDate: lineValue(labeledBlock, /datum\s+sprejema\s*:/)
      ? parseSlovenianDate(lineValue(labeledBlock, /datum\s+sprejema\s*:/)!)
      : undefined,
    originMunicipality: municipality || undefined,
    medical: parseMedical(facts),
    description: parseDescription($),
    imageUrls,
  };
}

// The shelter keeps a dated journal ("Dnevnik") rendered as a tab set, newest
// entry first and pre-selected. Only that entry describes the animal now:
// older ones are a history that contradicts it, and Klopka's oldest still
// describes the nine-week-old kitten she arrived as in 2016. The entries are
// left in place at the source, which the listing links to.
//
// Every entry closes by linking the adoption questionnaire. Some listings put
// that in its own paragraph and some run it on after the last sentence, so it
// is cut by sentence: dropping the whole paragraph would take Klopka's
// description with it.
const QUESTIONNAIRE = /posvojitveni\s+vpra[sš]alnik/i;

function stripQuestionnaire(text: string): string {
  return text
    .split(/(?<=[.!?…])(?:\s+|(?=\p{Lu}))/u)
    .filter((sentence) => !QUESTIONNAIRE.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  const newest = $(".e-n-tabs-content [role='tabpanel']").first();
  if (newest.length === 0) return undefined;
  const paragraphs: string[] = [];
  newest.find(".elementor-widget-text-editor p").each((_, element) => {
    const paragraph = stripQuestionnaire(
      $(element).text().replace(/\s+/g, " ").trim(),
    );
    if (paragraph) paragraphs.push(paragraph);
  });
  return paragraphs.length > 0 ? paragraphs.join("\n\n") : undefined;
}

export function resolveAgeMonths(
  facts: Pick<DetailFacts, "intakeAgeMonths" | "intakeDate">,
  fetchedAt: string,
): number | undefined {
  if (facts.intakeAgeMonths === undefined || facts.intakeDate === undefined) {
    return undefined;
  }
  const from = new Date(`${facts.intakeDate}T00:00:00Z`);
  const to = new Date(fetchedAt);
  let elapsed =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    to.getUTCMonth() -
    from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) elapsed -= 1;
  return facts.intakeAgeMonths + Math.max(0, elapsed);
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
        name: "Zavetišče Horjul",
        city: "Horjul",
      },
      name: facts.name,
      species: facts.species ?? "other",
      sex: facts.sex,
      approximateAgeMonths: resolveAgeMonths(facts, raw.fetchedAt),
      size: facts.size,
      status: facts.status,
      intakeDate: facts.intakeDate,
      originMunicipality: facts.originMunicipality,
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
