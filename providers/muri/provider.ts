import {
  cheerio,
  type AdoptionProvider,
  type SourceAnimalRef,
} from "@posvoji/provider-sdk";
import type {
  AdoptionStatus,
  AnimalGoodWith,
  AnimalMedical,
  Compatibility,
  EnergyLevel,
  ImagePolicy,
  ImageRights,
  Sex,
  Species,
  TestResult,
} from "@posvoji/schema";

const BASE_URL = "https://zavodmuri.si";
const PROVIDER_ID = "muri";
const DETAIL_PATH = /^\/Project\/([^/]+)\/?$/;

export interface DetailFacts {
  name?: string;
  species?: Species;
  status: AdoptionStatus;
  sex?: Sex;
  // Current age when the page states one ("Starost", or the age tag).
  ageMonths?: number;
  // Newer listings only record the age on arrival ("Starost ob sprejemu");
  // normalize() ages it forward to the crawl date.
  intakeAgeMonths?: number;
  intakeDate?: string;
  foundPlace?: string;
  description?: string;
  medical?: AnimalMedical;
  goodWith?: AnimalGoodWith;
  energy?: EnergyLevel;
  imageUrls: string[];
}

function sameSiteUrl(href: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(href, BASE_URL);
  } catch {
    return undefined;
  }
  return url.origin === BASE_URL ? url : undefined;
}

// The theme renders up to 100 cards per species page server-side, with no
// pagination below that. A catalogue that fills the page could be silently
// truncated, so this fails loudly instead, mirroring turk's MAX_PAGES guard:
// reaching the cap means the parser needs pagination support, not a partial
// list.
const MAX_CARDS = 100;

export function parseList(html: string): SourceAnimalRef[] {
  const $ = cheerio.load(html);
  const cards = $("article.project");
  if (cards.length >= MAX_CARDS) {
    throw new Error(
      `${PROVIDER_ID}: page rendered ${cards.length} cards, at or over the ` +
        `${MAX_CARDS}-card cap; it is likely paginated and the parser needs ` +
        "pagination support",
    );
  }
  const refs = new Map<string, SourceAnimalRef>();
  cards.each((_, el) => {
    const article = $(el);
    // The list pages filter by species tag only, so they also carry
    // sponsorship-only animals (no isce-dom) and the odd already-adopted one
    // whose v_novem_domu tag was added without removing isce-dom.
    if (!article.hasClass("pj-categs-isce-dom")) return;
    if (article.hasClass("pj-categs-v_novem_domu")) return;
    const id = article.attr("id")?.match(/^post-(\d+)$/)?.[1];
    const href = article.find(".cmsms_project_title a").first().attr("href");
    const url = href ? sameSiteUrl(href) : undefined;
    const slug = url?.pathname.match(DETAIL_PATH)?.[1];
    if (!id || !slug) return;
    // The WordPress post id is the identity — it survives a slug rename, the
    // slug does not. The URL is rebuilt from the slug: drops query strings and
    // trailing slashes, which would otherwise show up in changes.json as
    // spurious updates.
    refs.set(id, { sourceAnimalId: id, sourceUrl: `${BASE_URL}/Project/${slug}` });
  });
  return [...refs.values()];
}

// discover() reads one page per species, so an HTTP 200 page that is not a
// species page silently removes that whole species. The theme renders the
// cards into its portfolio grid; that wrapper is what says the page is the
// listing. The cards themselves are never required, so a species with nothing
// to show still passes.
export function hasListingMarkup(html: string): boolean {
  return cheerio.load(html)(".portfolio").length > 0;
}

// The theme has changed labels and punctuation over time. Normalize cosmetic
// differences once, then map only explicitly equivalent shelter facts. Exact
// aliases prevent a publication/update date from becoming an intake date.
const FEATURE_LABELS = {
  status: ["status"],
  sex: ["spol"],
  age: ["starost"],
  intakeAge: ["starost ob sprejemu"],
  intakeDate: ["datum sprejema", "datum oddaje s strani lastnikov"],
  foundPlace: ["kraj najdbe"],
  // Sidebar rows currently dormant on the live site (last seen 19 Aug 2026),
  // kept as insurance in case the block returns. No row exists for kids.
  goodWithCats: ["mačja družba"],
  goodWithDogs: ["pasja družba"],
  // Free-form adjectives, only some of which describe energy at all. See
  // parseEnergy for what is and is not read out of them.
  character: ["značaj"],
} as const;

type FeatureName = keyof typeof FEATURE_LABELS;
type FeatureTable = Map<string, string[]>;

function normalizeFeatureLabel(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*:+$/, "")
    .toLowerCase();
}

function readFeatureTable($: cheerio.CheerioAPI): FeatureTable {
  const table: FeatureTable = new Map();
  $(".project_features_item").each((_, element) => {
    const row = $(element);
    const label = normalizeFeatureLabel(
      row.children(".project_features_item_title").text(),
    );
    const value = row
      .children(".project_features_item_desc")
      .text()
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || !value) return;
    table.set(label, [...(table.get(label) ?? []), value]);
  });
  return table;
}

function featureValues(table: FeatureTable, name: FeatureName): string[] {
  return FEATURE_LABELS[name].flatMap(
    (label) => table.get(normalizeFeatureLabel(label)) ?? [],
  );
}

function featureValue(
  table: FeatureTable,
  name: FeatureName,
): string | undefined {
  return featureValues(table, name)[0];
}

function parsedFeatureValue<T>(
  table: FeatureTable,
  name: FeatureName,
  parseValue: (value: string) => T | undefined,
): T | undefined {
  for (const value of featureValues(table, name)) {
    const parsed = parseValue(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

// Only the two unambiguous structured values map. Anything else, including
// hedged phrasing like "ni preverjeno" (not checked), stays unmapped: better
// an absent facet than a guessed one.
export function parseCompatibility(value: string): Compatibility | undefined {
  const normalized = value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized === "ok" || normalized === "da") return "yes";
  if (normalized === "ne") return "no";
  return undefined;
}

// "Značaj" is a free-text adjective list, not a scale: "prijazen" (friendly)
// and "radoveden" (curious) say nothing about how much the animal wants to
// do in a day. Only words that state the tempo outright map, and only when
// the row says one thing: "miren, a živahen na sprehodu" contradicts itself
// and stays unmapped. There is no honest word for "balanced" here, so that
// level only ever comes from the shelter portal.
const ENERGY_WORDS: Record<string, EnergyLevel> = {
  miren: "calm",
  mirna: "calm",
  umirjen: "calm",
  umirjena: "calm",
  flegmatičen: "calm",
  flegmatična: "calm",
  živahen: "lively",
  živahna: "lively",
  energičen: "lively",
  energična: "lively",
  aktiven: "lively",
  aktivna: "lively",
};

export function parseEnergy(value: string): EnergyLevel | undefined {
  const words = value
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

  // "ni miren", "ne preveč živahen": a negated row says what the animal is
  // not, which is not a level. Whole words only, so "nemiren" (restless) is
  // no more a negation than it is a match for "miren".
  if (words.some((word) => word === "ni" || word === "ne")) return undefined;

  const found = new Set<EnergyLevel>();
  for (const word of words) {
    const level = ENERGY_WORDS[word];
    if (level) found.add(level);
  }
  return found.size === 1 ? [...found][0] : undefined;
}

const SEX: Record<string, Sex> = {
  "samček": "male",
  samec: "male",
  "samička": "female",
  samica: "female",
};

// "15 let", "3 leta", "3 mesece", "7 let in 1 mesec", "1 leto in pol".
// "manj kot 1 leto" is an upper bound, not an age, and fractional forms
// ("1,5 leta") stay out via the lookbehind: better no age than a wrong one.
export function parseAgeMonths(value: string): number | undefined {
  if (/manj\s+kot/i.test(value)) return undefined;
  const years = value.match(/(?<![\d,.-])(\d+)\s*let/i);
  const months = value.match(/(?<![\d,.-])(\d+)\s*mesec/i);
  if (!years && !months) return undefined;
  // "in pol" after a bare year count is exactly six months; after a month
  // count it is under one and gets dropped.
  const half = years && !months && /\bin\s+pol\b/i.test(value) ? 6 : 0;
  return (
    (years ? Number(years[1]) * 12 : 0) + (months ? Number(months[1]) : 0) + half
  );
}

// Unambiguous Slovenian day-month-year dates → ISO. Accept common separators,
// surrounding whitespace, a trailing dot, and the occasional doubled dot;
// reject surrounding prose and impossible dates instead of guessing.
export function parseSlovenianDate(value: string): string | undefined {
  const m = value
    .normalize("NFC")
    .trim()
    .match(/^(\d{1,2})\s*[./-]+\s*(\d{1,2})\s*[./-]+\s*(\d{4})\s*\.?$/);
  if (!m) return undefined;
  const [, day, month, year] = m;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10) === iso ? iso : undefined;
}

// The age tag ("starost 13 let") is the fallback when the sidebar carries no
// current age; the sidebar wins when both exist because the tags are curated
// by hand and go stale.
function categoryAgeMonths($: cheerio.CheerioAPI): number | undefined {
  let months: number | undefined;
  $(".cmsms_project_category a[rel='tag']").each((_, el) => {
    if (months !== undefined) return;
    const text = $(el).text().trim().normalize("NFC");
    const m = text.match(/^starost\s+(.+)$/i);
    if (m) months = parseAgeMonths(m[1]!);
  });
  return months;
}

function parseMedical($: cheerio.CheerioAPI): AnimalMedical | undefined {
  // Vet facts only come from the "Veterinarska oskrba" block; without it
  // there is nothing trustworthy to read.
  const block = $(".project_features")
    .filter((_, el) =>
      /veterinarska oskrba/i.test(
        $(el).children(".project_features_title").text().normalize("NFC"),
      ),
    )
    .first();
  if (block.length === 0) return undefined;

  const rowValue = (label: RegExp): string | undefined => {
    const row = block
      .find(".project_features_item")
      .filter((_, el) =>
        label.test(
          $(el).children(".project_features_item_title").text().normalize("NFC"),
        ),
      )
      .first();
    const value = row
      .children(".project_features_item_desc")
      .text()
      .trim()
      .normalize("NFC");
    return value || undefined;
  };

  const done = (label: RegExp): boolean | undefined => {
    const value = rowValue(label)?.toLowerCase();
    if (value === "da") return true;
    if (value === "ne") return false;
    return undefined;
  };

  // "Test FIV/FeLV" carries both results as "-/-" in the label's order.
  // Anything unreadable stays "unknown" — never guess the highest-stakes fact
  // on the page.
  const tests = (): { fiv?: TestResult; felv?: TestResult } => {
    const value = rowValue(/fiv\s*\/\s*felv/i);
    if (value === undefined) return {};
    const m = value.match(/^([+-])\s*\/\s*([+-])$/);
    if (!m) return { fiv: "unknown", felv: "unknown" };
    const result = (sign: string): TestResult =>
      sign === "-" ? "negative" : "positive";
    return { fiv: result(m[1]!), felv: result(m[2]!) };
  };

  const found = Object.entries({
    vaccinated: done(/cepljenje/i),
    microchipped: done(/čipiranje/i),
    neutered: done(/steriliz|kastracija/i),
    ...tests(),
  }).filter(([, value]) => value !== undefined);
  return found.length > 0
    ? (Object.fromEntries(found) as AnimalMedical)
    : undefined;
}

function parseDescription($: cheerio.CheerioAPI): string | undefined {
  // clone(): the paragraph rewriting below must not leak into other parsers.
  const body = $(".cmsms_project_content").first().clone();
  if (body.length === 0) return undefined;
  body.find("style, .button_wrap").remove();
  // Every listing closes with the same fundraising appeals (fostering,
  // sponsorship, tax share), each written as a fully <em>-wrapped paragraph:
  // a paragraph with no text left outside <em> is one of them, not the
  // animal's story.
  body.children().each((_, el) => {
    const paragraph = $(el);
    const outsideEm = paragraph.clone();
    outsideEm.find("em").remove();
    if (paragraph.text().trim() && !outsideEm.text().trim()) paragraph.remove();
  });
  body.find("br").replaceWith("\n");
  body.find("p, div").each((_, el) => {
    $(el).append("\n\n");
  });
  const text = body
    .text()
    // [^\S\n] = all whitespace except newlines, NBSP included.
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
  return text || undefined;
}

// WordPress names every derived size "<file>-<width>x<height>.<ext>", so the
// candidate without that suffix is the original. Only URLs the page itself
// lists are weighed: rebuilding one by stripping a thumbnail's suffix would
// invent a filename that need not exist on disk.
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
  // Without an unsized candidate the widest derived one is the best on offer.
  return (
    candidates.find((c) => !DERIVED_SIZE.test(c.url))?.url ??
    candidates.reduce((widest, c) => (c.width > widest.width ? c : widest)).url
  );
}

export function parseDetail(html: string): DetailFacts {
  const $ = cheerio.load(html);
  const article = $("article.project").first();
  // The listing is the project article. Without it the page carries no facts:
  // parsed anyway the record would normalize into a nameless "other" animal
  // with no photos, written over the real one.
  if (article.length === 0) {
    throw new Error(`${PROVIDER_ID}: detail page has no project article`);
  }
  const features = readFeatureTable($);

  const imageUrls: string[] = [];
  const addImage = (candidate: string | undefined) => {
    const url = candidate ? sameSiteUrl(candidate) : undefined;
    // Only the site's uploaded files count; fancybox anchors can also carry
    // "#" or javascript: triggers.
    if (!url || !url.pathname.startsWith("/wp-content/uploads/")) return;
    const clean = `${BASE_URL}${url.pathname}`;
    if (!imageUrls.includes(clean)) imageUrls.push(clean);
  };

  // Two layouts link every photo through the lightbox: the gallery grid via
  // a.cmsms_image_link, a single featured image via a.cmsms_img_link. Either
  // href is already the full-size file.
  article.find(".project_content a[rel^='ilightbox']").each((_, el) => {
    addImage($(el).attr("href"));
  });

  // A third puts them in a carousel as bare <img> with nothing to follow.
  // Images the lightbox pass already covers are skipped: their thumbnail
  // resolves to a different URL than the anchor and would land in the
  // dataset as the same photo twice, once at a smaller size.
  article.find(".project_content img").each((_, el) => {
    const img = $(el);
    if (
      img.closest("a[rel^='ilightbox']").length > 0 ||
      img.closest("figure").find("a[rel^='ilightbox']").length > 0
    ) {
      return;
    }
    addImage(fullSizeSrc(img.attr("src"), img.attr("srcset")));
  });

  const statusRaw = featureValue(features, "status")?.toLowerCase();
  // v_novem_domu wins over a leftover IŠČE DOM: the tag is added on adoption
  // and the old one is sometimes forgotten.
  const status: AdoptionStatus =
    article.hasClass("pj-categs-v_novem_domu") ||
    (statusRaw?.includes("novem domu") ?? false)
      ? "adopted"
      : article.hasClass("pj-categs-isce-dom") ||
          (statusRaw?.includes("išče dom") ?? false)
        ? "available"
        : "unknown";

  const sexRaw = featureValue(features, "sex")?.toLowerCase();
  const ageMonths = parsedFeatureValue(features, "age", parseAgeMonths);
  const intakeAgeMonths = parsedFeatureValue(
    features,
    "intakeAge",
    parseAgeMonths,
  );
  const intakeDate = parsedFeatureValue(
    features,
    "intakeDate",
    parseSlovenianDate,
  );

  const goodWithCats = parsedFeatureValue(features, "goodWithCats", parseCompatibility);
  const goodWithDogs = parsedFeatureValue(features, "goodWithDogs", parseCompatibility);
  const goodWith: AnimalGoodWith = {};
  if (goodWithCats !== undefined) goodWith.cats = goodWithCats;
  if (goodWithDogs !== undefined) goodWith.dogs = goodWithDogs;

  return {
    name:
      article.find(".cmsms_project_title").first().text().trim().normalize("NFC") ||
      undefined,
    species: article.hasClass("pj-categs-psi")
      ? "dog"
      : article.hasClass("pj-categs-macke")
        ? "cat"
        : undefined,
    status,
    sex: sexRaw ? (SEX[sexRaw] ?? "unknown") : undefined,
    ageMonths: ageMonths ?? categoryAgeMonths($),
    intakeAgeMonths,
    intakeDate,
    foundPlace: featureValue(features, "foundPlace"),
    description: parseDescription($),
    medical: parseMedical($),
    goodWith: Object.keys(goodWith).length > 0 ? goodWith : undefined,
    energy: parsedFeatureValue(features, "character", parseEnergy),
    imageUrls,
  };
}

// "Starost ob sprejemu" is the age when the animal arrived; it has aged
// since, so add the full calendar months between intake and this crawl.
export function resolveAgeMonths(
  facts: Pick<DetailFacts, "ageMonths" | "intakeAgeMonths" | "intakeDate">,
  fetchedAt: string,
): number | undefined {
  if (facts.ageMonths !== undefined) return facts.ageMonths;
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
    // Dogs and cats hang off the policy source as separate species pages.
    // parseList guards the per-page card cap.
    const refs = new Map<string, SourceAnimalRef>();
    for (const path of ["psi", "muce"]) {
      const url = `${ctx.policy.source}/${path}`;
      const res = await ctx.client.get(url);
      if (res.status !== 200 || res.body === null) {
        throw new Error(
          `${PROVIDER_ID}: list fetch failed with HTTP ${res.status} for ${url}`,
        );
      }
      if (!hasListingMarkup(res.body)) {
        throw new Error(`${PROVIDER_ID}: list page ${url} has no listing markup`);
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
    return { ref, fetchedAt: new Date().toISOString(), data: parseDetail(res.body) };
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
        name: "Zavod Muri",
        city: "Vransko",
      },
      name: facts.name,
      // The species tag placed the animal on its list page, so it is always
      // present on the detail article too; "other" surfacing in the dataset
      // means the markup changed under us.
      species: facts.species ?? "other",
      sex: facts.sex,
      approximateAgeMonths: resolveAgeMonths(facts, raw.fetchedAt),
      intakeDate: facts.intakeDate,
      originMunicipality: facts.foundPlace,
      medical: facts.medical,
      goodWith: facts.goodWith,
      energy: facts.energy,
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
