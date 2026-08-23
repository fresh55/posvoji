import {
  Species,
  type Animal,
  type AnimalSize,
  type EnergyLevel,
  type Sex,
} from "@posvoji/schema";
import type { Locale } from "@/lib/i18n";

export type SpeciesFilter = "all" | Species;
export type AgeGroup = "mladicek" | "odrasel" | "senior";
export type MultiGroup = "sex" | "age" | "size" | "energy" | "shelter";

// Yes/no properties an animal either has or doesn't. Choices within this
// section combine with OR, and sections combine with AND. Every section works
// this way except Družba, whose choices are constraints of one household
// rather than alternatives of one attribute.
export type ToggleKey =
  | "sterilizacija"
  | "cepljenje"
  | "cip"
  | "brez-fiv"
  | "brez-felv";

// Who the animal can live with. The schema answers each of these with
// yes/no/unknown; the filter only ever asks for "yes", because a maybe is not
// something to hand a family looking for a safe match.
export const GOOD_WITH_KEYS = ["kids", "dogs", "cats"] as const;
export type GoodWithKey = (typeof GOOD_WITH_KEYS)[number];

// What kind of home the animal fits. One value today; kept as a list like
// every other section so the URL codec and a second value later need no new
// shape. Only a recorded yes counts, the same principle as Družba: a maybe is
// never sold as a yes to someone who has only a flat to offer.
export const HOME_KEYS = ["apartment"] as const;
export type HomeKey = (typeof HOME_KEYS)[number];

// Not a warning but a way in: it exists for visitors who came looking for the
// animal that needs more from them, and who would otherwise never find it.
export const CARE_KEYS = ["patient"] as const;
export type CareKey = (typeof CARE_KEYS)[number];

export type Filters = {
  species: SpeciesFilter;
  sex: Sex[];
  age: AgeGroup[];
  size: AnimalSize[];
  energy: EnergyLevel[];
  shelter: string[];
  toggles: ToggleKey[];
  goodWith: GoodWithKey[];
  home: HomeKey[];
  care: CareKey[];
};

export const EMPTY_FILTERS: Filters = {
  species: "all",
  sex: [],
  age: [],
  size: [],
  energy: [],
  shelter: [],
  toggles: [],
  goodWith: [],
  home: [],
  care: [],
};

export const GROUPS: MultiGroup[] = ["sex", "age", "size", "energy", "shelter"];

const GROUP_LABELS: Record<Locale, Record<MultiGroup, string>> = {
  sl: {
    sex: "Spol",
    age: "Starost",
    size: "Velikost",
    energy: "Energija",
    shelter: "Zavetišče",
  },
  en: {
    sex: "Sex",
    age: "Age",
    size: "Size",
    energy: "Energy",
    shelter: "Shelter",
  },
};

export function groupLabel(group: MultiGroup, locale: Locale): string {
  return GROUP_LABELS[locale][group];
}

// species pins a toggle to one tab; without it the toggle asks something every
// species can answer.
export type ToggleDef = {
  key: ToggleKey;
  label: string;
  species?: Species;
  matches: (animal: Animal) => boolean;
};

// Nouns, not adjectives: Slovenian would force a gender on "cepljen" that
// "živali" doesn't share.
export const TOGGLES: ToggleDef[] = [
  {
    key: "sterilizacija",
    label: "Sterilizacija",
    matches: (animal) => animal.medical?.neutered === true,
  },
  {
    key: "cepljenje",
    label: "Cepljenje",
    matches: (animal) => animal.medical?.vaccinated === true,
  },
  {
    key: "cip",
    label: "Čip",
    matches: (animal) => animal.medical?.microchipped === true,
  },
  // Only a recorded negative counts. An untested cat is "unknown", and letting
  // that through would sell a maybe as an all-clear on the one question these
  // filters exist to answer.
  {
    key: "brez-fiv",
    label: "Brez FIV",
    species: "cat",
    matches: (animal) => animal.medical?.fiv === "negative",
  },
  {
    key: "brez-felv",
    label: "Brez FeLV",
    species: "cat",
    matches: (animal) => animal.medical?.felv === "negative",
  },
];

const TOGGLE_LABELS_EN: Record<ToggleKey, string> = {
  sterilizacija: "Neutered",
  cepljenje: "Vaccinated",
  cip: "Microchipped",
  "brez-fiv": "FIV negative",
  "brez-felv": "FeLV negative",
};

export function toggleLabel(key: ToggleKey, locale: Locale = "sl"): string {
  return locale === "sl"
    ? (TOGGLES.find((toggle) => toggle.key === key)?.label ?? key)
    : TOGGLE_LABELS_EN[key];
}

function matchesToggles(animal: Animal, selected: ToggleKey[]): boolean {
  if (selected.length === 0) return true;
  return TOGGLES.some(
    (toggle) => selected.includes(toggle.key) && toggle.matches(animal),
  );
}

/** Only a recorded yes counts, so "unknown" and no both drop out. */
export function goodWithMatches(animal: Animal, key: GoodWithKey): boolean {
  return animal.goodWith?.[key] === "yes";
}

// AND within this section, unlike every other one. The other sections offer
// alternatives of a single attribute, so widening them is what the visitor
// asked for. These are independent constraints of one household: a family with
// a child and a dog needs both answered yes, and an OR here would put
// dog-intolerant animals in front of dog owners.
function matchesGoodWith(animal: Animal, selected: GoodWithKey[]): boolean {
  return selected.every((key) => goodWithMatches(animal, key));
}

/** Only a recorded yes counts, so "unknown" and no both drop out. */
export function homeMatches(animal: Animal, key: HomeKey): boolean {
  switch (key) {
    case "apartment":
      return animal.apartmentOk === "yes";
  }
}

/** Only a shelter that said so counts; an unanswered animal is not one. */
export function careMatches(animal: Animal, key: CareKey): boolean {
  switch (key) {
    case "patient":
      return animal.specialNeeds === true;
  }
}

function matchesHome(animal: Animal, selected: HomeKey[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((key) => homeMatches(animal, key));
}

function matchesCare(animal: Animal, selected: CareKey[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((key) => careMatches(animal, key));
}

// Boundaries in months: under a year is a baby, past eight a senior.
const PUPPY_MAX_EXCLUSIVE = 12;
const ADULT_MAX_EXCLUSIVE = 96;

// A date-only ISO string parses as UTC midnight, so both sides of the
// subtraction have to be read in UTC. Reading one of them locally shifted the
// month by one west of Greenwich, which moved animals between age buckets.
// Takes the two fields rather than an Animal, so the portal, whose animals
// come from the API rather than the schema, reads the same arithmetic.
export function ageInMonths(
  animal: { birthDate?: string; approximateAgeMonths?: number },
  now: Date,
): number | undefined {
  if (animal.approximateAgeMonths !== undefined) {
    return animal.approximateAgeMonths;
  }
  if (animal.birthDate) {
    const birth = new Date(animal.birthDate);
    if (Number.isNaN(birth.getTime())) return undefined;
    const months =
      (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - birth.getUTCMonth());
    return Math.max(0, months);
  }
  return undefined;
}

// Exported so the dialog can show the same life stage the filter buckets by.
export function ageGroup(months: number): AgeGroup {
  if (months < PUPPY_MAX_EXCLUSIVE) return "mladicek";
  if (months < ADULT_MAX_EXCLUSIVE) return "odrasel";
  return "senior";
}

function matchesSpecies(animal: Animal, species: SpeciesFilter): boolean {
  return species === "all" || animal.species === species;
}

// "unknown" sex is semantically the same as absent: we don't know.
function groupValue(
  animal: Animal,
  group: MultiGroup,
  now: Date,
): string | undefined {
  switch (group) {
    case "sex":
      return animal.sex === "unknown" ? undefined : animal.sex;
    case "age": {
      const months = ageInMonths(animal, now);
      return months === undefined ? undefined : ageGroup(months);
    }
    case "size":
      return animal.size;
    case "energy":
      return animal.energy;
    case "shelter":
      return animal.shelter.id;
  }
}

// An animal without the field only drops out once the group is actively
// filtered: selecting "samica" is a requirement, not a preference.
function matchesGroup(
  animal: Animal,
  group: MultiGroup,
  selected: string[],
  now: Date,
): boolean {
  if (selected.length === 0) return true;
  const value = groupValue(animal, group, now);
  return value !== undefined && selected.includes(value);
}

export function applyFilters(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Animal[] {
  return animals.filter(
    (animal) =>
      matchesSpecies(animal, filters.species) &&
      matchesToggles(animal, filters.toggles) &&
      matchesGoodWith(animal, filters.goodWith) &&
      matchesHome(animal, filters.home) &&
      matchesCare(animal, filters.care) &&
      GROUPS.every((group) => matchesGroup(animal, group, filters[group], now)),
  );
}

// The faceting rule, shared by both counters: a number next to an option is
// what you get when you pick it, so every filter applies except the one axis
// being counted. Groups skip themselves; toggles drop themselves from the set.
function passesFacet(
  animal: Animal,
  filters: Filters,
  now: Date,
  applied: {
    toggles: ToggleKey[];
    goodWith: GoodWithKey[];
    home: HomeKey[];
    care: CareKey[];
    skipGroup?: MultiGroup;
  },
): boolean {
  return (
    matchesSpecies(animal, filters.species) &&
    matchesToggles(animal, applied.toggles) &&
    matchesGoodWith(animal, applied.goodWith) &&
    matchesHome(animal, applied.home) &&
    matchesCare(animal, applied.care) &&
    GROUPS.every(
      (group) =>
        group === applied.skipGroup ||
        matchesGroup(animal, group, filters[group], now),
    )
  );
}

export function facetCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Record<MultiGroup, Map<string, number>> {
  const counts = {
    sex: new Map<string, number>(),
    age: new Map<string, number>(),
    size: new Map<string, number>(),
    energy: new Map<string, number>(),
    shelter: new Map<string, number>(),
  };
  for (const group of GROUPS) {
    const applied = {
      toggles: filters.toggles,
      goodWith: filters.goodWith,
      home: filters.home,
      care: filters.care,
      skipGroup: group,
    };
    for (const animal of animals) {
      if (!passesFacet(animal, filters, now, applied)) continue;
      const value = groupValue(animal, group, now);
      if (value === undefined) continue;
      counts[group].set(value, (counts[group].get(value) ?? 0) + 1);
    }
  }
  return counts;
}

export function toggleCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const toggle of TOGGLES) {
    // Count each choice with the health axis removed, just like facetCounts
    // removes the group it is measuring. The number then answers what this
    // choice itself can add under the filters from every other section.
    const applied = {
      toggles: [],
      goodWith: filters.goodWith,
      home: filters.home,
      care: filters.care,
    };
    let total = 0;
    for (const animal of animals) {
      if (!passesFacet(animal, filters, now, applied)) continue;
      if (toggle.matches(animal)) total += 1;
    }
    counts.set(toggle.key, total);
  }
  return counts;
}

// The number beside a choice still answers "what do I get if I pick this",
// but an AND section cannot drop its whole axis to work that out. Only the
// facet being measured comes off the selection; the rest stay on, and the
// facet itself is then required on top of them.
export function goodWithCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of GOOD_WITH_KEYS) {
    const applied = {
      toggles: filters.toggles,
      goodWith: filters.goodWith.filter((selected) => selected !== key),
      home: filters.home,
      care: filters.care,
    };
    let total = 0;
    for (const animal of animals) {
      if (!passesFacet(animal, filters, now, applied)) continue;
      if (goodWithMatches(animal, key)) total += 1;
    }
    counts.set(key, total);
  }
  return counts;
}

// Same rule again, one section over: the facet being measured comes off its
// own selection, every other section stays on, and the facet is required on
// top of them.
export function homeCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of HOME_KEYS) {
    const applied = {
      toggles: filters.toggles,
      goodWith: filters.goodWith,
      home: filters.home.filter((selected) => selected !== key),
      care: filters.care,
    };
    let total = 0;
    for (const animal of animals) {
      if (!passesFacet(animal, filters, now, applied)) continue;
      if (homeMatches(animal, key)) total += 1;
    }
    counts.set(key, total);
  }
  return counts;
}

export function careCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of CARE_KEYS) {
    const applied = {
      toggles: filters.toggles,
      goodWith: filters.goodWith,
      home: filters.home,
      care: filters.care.filter((selected) => selected !== key),
    };
    let total = 0;
    for (const animal of animals) {
      if (!passesFacet(animal, filters, now, applied)) continue;
      if (careMatches(animal, key)) total += 1;
    }
    counts.set(key, total);
  }
  return counts;
}

// The panel measures itself against the species tab rather than the whole
// dataset, so what it offers is what the animals on screen can be narrowed by.
export function bySpecies(animals: Animal[], species: SpeciesFilter): Animal[] {
  return animals.filter((animal) => matchesSpecies(animal, species));
}

// Velikost sorts dogs, but for cats it is a distinction nobody shops on.
function groupFitsSpecies(group: MultiGroup, species: SpeciesFilter): boolean {
  return !(group === "size" && species === "cat");
}

// A pinned toggle stays off the "Vse" tab too: there it would quietly discard
// every dog in the list.
function toggleFitsSpecies(
  only: Species | undefined,
  species: SpeciesFilter,
): boolean {
  return only === undefined || only === species;
}

// A toggle that every animal passes (or none do) can't narrow anything.
export function visibleToggles(
  animals: Animal[],
  species: SpeciesFilter,
): ToggleDef[] {
  return TOGGLES.filter((toggle) => {
    if (!toggleFitsSpecies(toggle.species, species)) return false;
    const matching = animals.filter((a) => toggle.matches(a)).length;
    return matching > 0 && matching < animals.length;
  });
}

// Same rule as visibleToggles, and no species pinning: every one of these
// questions is asked of dogs and cats alike. The section therefore reveals
// itself facet by facet as shelters start answering.
export function visibleGoodWith(animals: Animal[]): GoodWithKey[] {
  return GOOD_WITH_KEYS.filter((key) => {
    const matching = animals.filter((a) => goodWithMatches(a, key)).length;
    return matching > 0 && matching < animals.length;
  });
}

// Same rule, and no species pinning either: a flat is a flat whether a dog or
// a cat lives in it.
export function visibleHome(animals: Animal[]): HomeKey[] {
  return HOME_KEYS.filter((key) => {
    const matching = animals.filter((a) => homeMatches(a, key)).length;
    return matching > 0 && matching < animals.length;
  });
}

export function visibleCare(animals: Animal[]): CareKey[] {
  return CARE_KEYS.filter((key) => {
    const matching = animals.filter((a) => careMatches(a, key)).length;
    return matching > 0 && matching < animals.length;
  });
}

export function speciesCounts(animals: Animal[]): Record<SpeciesFilter, number> {
  const counts: Record<SpeciesFilter, number> = {
    all: animals.length,
    dog: 0,
    cat: 0,
    rabbit: 0,
    other: 0,
  };
  for (const animal of animals) {
    counts[animal.species] += 1;
  }
  return counts;
}

// A group with fewer than two distinct values can't narrow anything.
export function visibleGroups(
  animals: Animal[],
  species: SpeciesFilter,
  now: Date,
): Record<MultiGroup, boolean> {
  const distinct = {
    sex: new Set<string>(),
    age: new Set<string>(),
    size: new Set<string>(),
    energy: new Set<string>(),
    shelter: new Set<string>(),
  };
  for (const animal of animals) {
    for (const group of GROUPS) {
      const value = groupValue(animal, group, now);
      if (value !== undefined) distinct[group].add(value);
    }
  }
  const shown = (group: MultiGroup) =>
    groupFitsSpecies(group, species) && distinct[group].size >= 2;
  return {
    sex: shown("sex"),
    age: shown("age"),
    size: shown("size"),
    energy: shown("energy"),
    shelter: shown("shelter"),
  };
}

// A selection the species tab no longer has a control for would go on narrowing
// results with no way to switch it off, so changing species drops it from state
// and from the URL rather than let it work unseen.
export function pruneHiddenFilters(filters: Filters): Filters {
  const keep = (group: MultiGroup) => groupFitsSpecies(group, filters.species);
  return {
    species: filters.species,
    sex: keep("sex") ? filters.sex : [],
    age: keep("age") ? filters.age : [],
    size: keep("size") ? filters.size : [],
    energy: keep("energy") ? filters.energy : [],
    shelter: keep("shelter") ? filters.shelter : [],
    toggles: filters.toggles.filter((key) =>
      toggleFitsSpecies(
        TOGGLES.find((t) => t.key === key)?.species,
        filters.species,
      ),
    ),
    // No facet here is pinned to a species, so nothing to prune: a selection
    // made on one tab still has a control on the next. The same holds for the
    // two sections below.
    goodWith: filters.goodWith,
    home: filters.home,
    care: filters.care,
  };
}

// city is the shelter's town, kept as its own field rather than a generic
// sublabel because the map places a marker from it.
export type FilterOption = { value: string; label: string; city?: string };

type CodedGroup = Exclude<MultiGroup, "shelter">;
// goodWith, home and care are not MultiGroups, but their values are coded the
// same way and want the same one place to name them.
type ValueGroup = "goodWith" | "home" | "care";
type MetadataGroup = CodedGroup | ValueGroup;
type CodedValueByGroup = {
  sex: Exclude<Sex, "unknown">;
  age: AgeGroup;
  size: AnimalSize;
  energy: EnergyLevel;
  goodWith: GoodWithKey;
  home: HomeKey;
  care: CareKey;
};

/** The canonical metadata for coded filter values. */
export type FilterValueDefinition<Value extends string = string> = {
  readonly value: Value;
  readonly slug: string;
  readonly labels: Readonly<Record<Locale, string>>;
};

export const FILTER_METADATA = {
  sex: [
    { value: "male", slug: "samec", labels: { sl: "Samec", en: "Male" } },
    {
      value: "female",
      slug: "samica",
      labels: { sl: "Samica", en: "Female" },
    },
  ],
  age: [
    {
      value: "mladicek",
      slug: "mladicek",
      labels: { sl: "Mladiček", en: "Young" },
    },
    {
      value: "odrasel",
      slug: "odrasel",
      labels: { sl: "Odrasel", en: "Adult" },
    },
    {
      value: "senior",
      slug: "senior",
      labels: { sl: "Senior", en: "Senior" },
    },
  ],
  size: [
    { value: "small", slug: "majhna", labels: { sl: "Majhna", en: "Small" } },
    {
      value: "medium",
      slug: "srednja",
      labels: { sl: "Srednja", en: "Medium" },
    },
    { value: "large", slug: "velika", labels: { sl: "Velika", en: "Large" } },
  ],
  energy: [
    { value: "calm", slug: "miren", labels: { sl: "Miren", en: "Calm" } },
    {
      value: "balanced",
      slug: "uravnotezen",
      labels: { sl: "Uravnotežen", en: "Balanced" },
    },
    {
      value: "lively",
      slug: "zivahen",
      labels: { sl: "Živahen", en: "Lively" },
    },
  ],
  // The labels answer the section's question ("Doma imam: Psa"), so they do not
  // collide with the species tabs, which say "Psi" for a list of dogs. The
  // slugs stay as they were: shared links have to keep working.
  goodWith: [
    { value: "kids", slug: "otroci", labels: { sl: "Otroke", en: "Kids" } },
    { value: "dogs", slug: "psi", labels: { sl: "Psa", en: "A dog" } },
    { value: "cats", slug: "macke", labels: { sl: "Mačko", en: "A cat" } },
  ],
  home: [
    {
      value: "apartment",
      slug: "stanovanje",
      labels: { sl: "Primeren za stanovanje", en: "Apartment-friendly" },
    },
  ],
  care: [
    {
      value: "patient",
      slug: "potrpezljiv",
      labels: {
        sl: "Potrebuje potrpežljivega človeka",
        en: "Needs a patient person",
      },
    },
  ],
} as const satisfies {
  [Group in MetadataGroup]: readonly FilterValueDefinition<
    CodedValueByGroup[Group]
  >[];
};

/** The section's own options, in the order the cards show them. */
export function goodWithOptions(
  locale: Locale = "sl",
): { key: GoodWithKey; label: string }[] {
  return FILTER_METADATA.goodWith.map(({ value, labels }) => ({
    key: value,
    label: labels[locale],
  }));
}

export function homeOptions(
  locale: Locale = "sl",
): { key: HomeKey; label: string }[] {
  return FILTER_METADATA.home.map(({ value, labels }) => ({
    key: value,
    label: labels[locale],
  }));
}

export function careOptions(
  locale: Locale = "sl",
): { key: CareKey; label: string }[] {
  return FILTER_METADATA.care.map(({ value, labels }) => ({
    key: value,
    label: labels[locale],
  }));
}

// Exhaustive like groupValue: a new group names its own options rather than
// inheriting whichever branch happens to be last.
export function groupOptions(
  group: MultiGroup,
  animals: Animal[],
  locale: Locale = "sl",
): FilterOption[] {
  switch (group) {
    case "shelter": {
      const shelters = new Map<string, { name: string; city: string }>();
      for (const animal of animals) {
        shelters.set(animal.shelter.id, {
          name: animal.shelter.name,
          city: animal.shelter.city,
        });
      }
      return [...shelters]
        .map(([value, { name, city }]) => ({ value, label: name, city }))
        .sort((a, b) => a.label.localeCompare(b.label, "sl"));
    }
    case "sex":
    case "age":
    case "size":
    case "energy":
      return FILTER_METADATA[group].map(({ value, labels }) => ({
        value,
        label: labels[locale],
      }));
  }
}

export function optionLabel(
  group: MultiGroup,
  value: string,
  animals: Animal[],
  locale: Locale = "sl",
): string {
  const option = groupOptions(group, animals, locale).find(
    (candidate) => candidate.value === value,
  );
  return option?.label ?? value;
}

// URL codecs. Slovenian, ASCII-only params: ?vrsta=pes&spol=samica&starost=mladicek
// Keyed by species rather than listed, so one added to the schema fails to
// compile here instead of quietly becoming unshareable.
const SPECIES_SLUGS: Record<Species, string> = {
  dog: "pes",
  cat: "macka",
  rabbit: "zajcek",
  other: "ostalo",
};

const PARAM_NAMES: Record<MultiGroup, string> = {
  sex: "spol",
  age: "starost",
  size: "velikost",
  energy: "energija",
  shelter: "zavetisce",
};

// The value sections are not MultiGroups, so they carry their own param names
// and their own pair of lookups rather than three copies of the same find().
const VALUE_PARAM_NAMES: Record<ValueGroup, string> = {
  goodWith: "druzba",
  home: "dom",
  care: "skrb",
};

function valueSlug(group: ValueGroup, value: string): string {
  const options: readonly FilterValueDefinition[] = FILTER_METADATA[group];
  return options.find((option) => option.value === value)?.slug ?? value;
}

function valueFromSlug(group: ValueGroup, slug: string): string | undefined {
  const options: readonly FilterValueDefinition[] = FILTER_METADATA[group];
  return options.find((option) => option.slug === slug)?.value;
}

function toSlug(group: MultiGroup, value: string): string {
  if (group === "shelter") return value;
  return (
    FILTER_METADATA[group].find((option) => option.value === value)?.slug ??
    value
  );
}

function fromSlug(group: MultiGroup, slug: string): string | undefined {
  if (group === "shelter") return slug;
  return FILTER_METADATA[group].find((option) => option.slug === slug)?.value;
}

// Every param name this codec owns. A write that rebuilds the query (see
// mergeOwnedParams in lib/location-search.ts) needs this list to know which
// params it is allowed to erase and replace; anything else in the URL is not
// its business and has to survive untouched.
export const FILTER_PARAM_NAMES: readonly string[] = [
  "vrsta",
  ...Object.values(PARAM_NAMES),
  "lastnosti",
  ...Object.values(VALUE_PARAM_NAMES),
];

export function serializeFilters(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.species !== "all") {
    params.set("vrsta", SPECIES_SLUGS[filters.species]);
  }
  for (const group of GROUPS) {
    if (filters[group].length > 0) {
      params.set(
        PARAM_NAMES[group],
        filters[group].map((v) => toSlug(group, v)).join(","),
      );
    }
  }
  if (filters.toggles.length > 0) {
    params.set("lastnosti", filters.toggles.join(","));
  }
  const setValues = (group: ValueGroup, selected: readonly string[]) => {
    if (selected.length === 0) return;
    params.set(
      VALUE_PARAM_NAMES[group],
      selected.map((value) => valueSlug(group, value)).join(","),
    );
  };
  setValues("goodWith", filters.goodWith);
  setValues("home", filters.home);
  setValues("care", filters.care);
  // Commas are legal unencoded, and these links get shared by hand.
  return params.toString().replace(/%2C/g, ",");
}

// Unknown slugs are dropped silently: a stale shared link should degrade to
// fewer filters, not break the page. So is anything the link's own species tab
// hides, such as a cat-only toggle carried onto ?vrsta=pes.
export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const slug = params.get("vrsta");
  const species =
    Species.options.find((value) => SPECIES_SLUGS[value] === slug) ?? "all";
  const values = (group: MultiGroup): string[] => {
    const raw = params.get(PARAM_NAMES[group]);
    if (!raw) return [];
    return [
      ...new Set(
        raw
          .split(",")
          .map((slug) => fromSlug(group, slug))
          .filter((v): v is string => v !== undefined),
      ),
    ];
  };
  const toggles = (params.get("lastnosti") ?? "")
    .split(",")
    .filter((slug): slug is ToggleKey =>
      TOGGLES.some((t) => t.key === slug),
    );
  const codedValues = (group: ValueGroup): string[] => {
    const raw = params.get(VALUE_PARAM_NAMES[group]);
    if (!raw) return [];
    return [
      ...new Set(
        raw
          .split(",")
          .map((slug) => valueFromSlug(group, slug))
          .filter((value): value is string => value !== undefined),
      ),
    ];
  };
  return pruneHiddenFilters({
    species,
    sex: values("sex") as Sex[],
    age: values("age") as AgeGroup[],
    size: values("size") as AnimalSize[],
    energy: values("energy") as EnergyLevel[],
    shelter: values("shelter"),
    toggles: [...new Set(toggles)],
    goodWith: codedValues("goodWith") as GoodWithKey[],
    home: codedValues("home") as HomeKey[],
    care: codedValues("care") as CareKey[],
  });
}

export function activeFilterCount(filters: Filters): number {
  return (
    GROUPS.reduce((sum, group) => sum + filters[group].length, 0) +
    filters.toggles.length +
    filters.goodWith.length +
    filters.home.length +
    filters.care.length
  );
}

/** Count selected filter sections, rather than individual selected values. */
export function activeFilterSectionCount(filters: Filters): number {
  return (
    GROUPS.filter((group) => filters[group].length > 0).length +
    (filters.toggles.length > 0 ? 1 : 0) +
    (filters.goodWith.length > 0 ? 1 : 0) +
    (filters.home.length > 0 ? 1 : 0) +
    (filters.care.length > 0 ? 1 : 0)
  );
}

/** Whether toggling these values would take them off rather than add them.
 *  Exported because callers need the answer before the toggle runs: the map
 *  picker asks it to tell a click that drops from a click that picks, and a
 *  second copy of the rule there would be free to drift from this one. */
export function isDrop(
  selected: readonly string[],
  values: readonly string[],
): boolean {
  return values.every((value) => selected.includes(value));
}

export function toggleValues(
  selected: readonly string[],
  values: readonly string[],
): string[] {
  if (isDrop(selected, values)) {
    return selected.filter((value) => !values.includes(value));
  }
  return [...new Set([...selected, ...values])];
}
