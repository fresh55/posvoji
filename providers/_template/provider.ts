import { cheerio, defineProvider, type SourceAnimalRef } from "@posvoji/provider-sdk";
import type { AdoptionStatus, Sex, Species } from "@posvoji/schema";

const BASE_URL = "https://example-shelter.si";
const PROVIDER_ID = "template";

export interface DetailFacts {
  name: string;
  species: Species;
  sex?: Sex;
  approximateAgeMonths?: number;
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

// Label-based lookups survive layout changes better than positional
// selectors like ".col-md-6:nth-child(4)".
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

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const speciesRaw = labelValue($, "Vrsta")?.toLowerCase() ?? "";
  const sexRaw = labelValue($, "Spol")?.toLowerCase();
  const years = labelValue($, "Starost")?.match(/\d+/);
  const statusRaw = labelValue($, "Status")?.toLowerCase();

  return {
    name: $("h1").first().text().trim(),
    species: SPECIES[speciesRaw] ?? "other",
    sex: sexRaw ? (SEX[sexRaw] ?? "unknown") : undefined,
    approximateAgeMonths: years ? Number(years[0]) * 12 : undefined,
    status: statusRaw?.includes("išče") ? "available" : "unknown",
  };
}

export default defineProvider({
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
        // The pipeline rewrites firstSeenAt from the previous dataset run.
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
      status: facts.status,
      images: [],
      attribution: ctx.policy.attribution,
    };
  },
});
