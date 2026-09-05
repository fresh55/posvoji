import { cheerio, type AdoptionProvider, type SourceAnimalRef } from "@posvoji/provider-sdk";
import type { AdoptionStatus, Sex, Species } from "@posvoji/schema";

const BASE_URL = "https://example-shelter.si";
const PROVIDER_ID = "template";

export interface DetailFacts {
  name: string;
  species: Species;
  sex?: Sex;
  approximateAgeMonths?: number;
  intakeDate?: string;
  status: AdoptionStatus;
}

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const refs: SourceAnimalRef[] = [];
  $("li.animal h2 a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const url = new URL(href, BASE_URL);
    const slug = url.pathname.split("/").filter(Boolean).pop();
    if (!slug) return;
    refs.push({ sourceAnimalId: slug, sourceUrl: url.href });
  });
  return refs;
}

// Labels survive a redesign; positional selectors like .col-md-6:nth-child(4) don't.
function labelValue($: cheerio.CheerioAPI, label: string): string | undefined {
  const dt = $("dt")
    .filter((_, el) => $(el).text().trim().toLowerCase() === label.toLowerCase())
    .first();
  return dt.next("dd").text().trim() || undefined;
}

const SPECIES: Record<string, Species> = {
  pes: "dog",
  "mačka": "cat",
  muca: "cat",
  kunec: "rabbit",
};

const SEX: Record<string, Sex> = {
  samec: "male",
  samica: "female",
};

// Adapt this to the shelter's published format. Invalid or unclear dates stay
// absent; never substitute a listing date for the animal's actual intake date.
export function parseSlovenianDate(value: string): string | undefined {
  const match = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10) === iso ? iso : undefined;
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const speciesRaw = labelValue($, "Vrsta")?.toLowerCase() ?? "";
  const sexRaw = labelValue($, "Spol")?.toLowerCase();
  // "1,5 leta" is one and a half years; the lookbehind keeps the "5" after
  // the comma from being read on its own.
  const years = labelValue($, "Starost")?.match(
    /(?<![\d,.])(\d+(?:[.,]\d+)?)\s*(?:let|leta|leti)\b/iu,
  );
  const intakeRaw = labelValue($, "Datum sprejema");
  const statusRaw = labelValue($, "Status")?.toLowerCase();

  return {
    name: $("h1").first().text().trim(),
    species: SPECIES[speciesRaw] ?? "other",
    sex: sexRaw ? (SEX[sexRaw] ?? "unknown") : undefined,
    approximateAgeMonths: years
      ? Math.round(Number(years[1]!.replace(",", ".")) * 12)
      : undefined,
    intakeDate: intakeRaw ? parseSlovenianDate(intakeRaw) : undefined,
    status: statusRaw?.includes("išče") ? "available" : "unknown",
  };
}

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
    const res = await ctx.client.get(ref.sourceUrl);
    if (res.status !== 200 || res.body === null) {
      throw new Error(`${PROVIDER_ID}: detail fetch failed with HTTP ${res.status}`);
    }
    return { ref, fetchedAt: new Date().toISOString(), data: parseDetail(res.body) };
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
        // export.ts replaces this with the date we first saw the animal.
        firstSeenAt: raw.fetchedAt,
        lastSeenAt: raw.fetchedAt,
      },
      shelter: {
        id: PROVIDER_ID,
        name: "Example zavetišče",
        city: "Ljubljana",
      },
      name: facts.name,
      species: facts.species,
      sex: facts.sex,
      approximateAgeMonths: facts.approximateAgeMonths,
      intakeDate: facts.intakeDate,
      status: facts.status,
      images: [],
      attribution: ctx.policy.attribution,
    };
  },
};

export default provider;
