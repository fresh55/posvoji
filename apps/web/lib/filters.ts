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

export type Filters = {
  species: SpeciesFilter;
  sex: Sex[];
  age: AgeGroup[];
  size: AnimalSize[];
  energy: EnergyLevel[];
  shelter: string[];
  toggles: ToggleKey[];
  goodWith: GoodWithKey[];
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

// Boundaries in months: under a year is a baby, past eight a senior.
const PUPPY_MAX_EXCLUSIVE = 12;
const ADULT_MAX_EXCLUSIVE = 96;

// A date-only ISO string parses as UTC midnight, so both sides of the
// subtraction have to be read in UTC. Reading one of them locally shifted the
// month by one west of Greenwich, which moved animals between age buckets.
export function ageInMonths(animal: Animal, now: Date): number | undefined {
  if (animal.approximateAgeMonths !== undefined) {
    return animal.approximateAgeMonths;
  }
  if (animal.birthDate) {
    const birth = new Date(animal.birthDate);
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
    skipGroup?: MultiGroup;
  },
): boolean {
  return (
    matchesSpecies(animal, filters.species) &&
    matchesToggles(animal, applied.toggles) &&
    matchesGoodWith(animal, applied.goodWith) &&
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
    const applied = { toggles: [], goodWith: filters.goodWith };
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
    // made on one tab still has a control on the next.
    goodWith: filters.goodWith,
  };
}

// city is the shelter's town, kept as its own field rather than a generic
// sublabel because the map places a marker from it.
export type FilterOption = { value: string; label: string; city?: string };

type CodedGroup = Exclude<MultiGroup, "shelter">;
// goodWith is not a MultiGroup, but its values are coded the same way and want
// the same one place to name them.
type MetadataGroup = CodedGroup | "goodWith";
type CodedValueByGroup = {
  sex: Exclude<Sex, "unknown">;
  age: AgeGroup;
  size: AnimalSize;
  energy: EnergyLevel;
  goodWith: GoodWithKey;
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
  goodWith: [
    { value: "kids", slug: "otroci", labels: { sl: "Otroci", en: "Kids" } },
    { value: "dogs", slug: "psi", labels: { sl: "Psi", en: "Dogs" } },
    { value: "cats", slug: "macke", labels: { sl: "Mačke", en: "Cats" } },
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

export function goodWithLabel(key: GoodWithKey, locale: Locale = "sl"): string {
  return (
    FILTER_METADATA.goodWith.find((option) => option.value === key)?.labels[
      locale
    ] ?? key
  );
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
  if (filters.goodWith.length > 0) {
    params.set(
      "druzba",
      filters.goodWith
        .map(
          (key) =>
            FILTER_METADATA.goodWith.find((option) => option.value === key)
              ?.slug ?? key,
        )
        .join(","),
    );
  }
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
  const goodWith = (params.get("druzba") ?? "")
    .split(",")
    .map(
      (slug) =>
        FILTER_METADATA.goodWith.find((option) => option.slug === slug)?.value,
    )
    .filter((key): key is GoodWithKey => key !== undefined);
  return pruneHiddenFilters({
    species,
    sex: values("sex") as Sex[],
    age: values("age") as AgeGroup[],
    size: values("size") as AnimalSize[],
    energy: values("energy") as EnergyLevel[],
    shelter: values("shelter"),
    toggles: [...new Set(toggles)],
    goodWith: [...new Set(goodWith)],
  });
}

export function activeFilterCount(filters: Filters): number {
  return (
    GROUPS.reduce((sum, group) => sum + filters[group].length, 0) +
    filters.toggles.length +
    filters.goodWith.length
  );
}

/** Count selected filter sections, rather than individual selected values. */
export function activeFilterSectionCount(filters: Filters): number {
  return (
    GROUPS.filter((group) => filters[group].length > 0).length +
    (filters.toggles.length > 0 ? 1 : 0) +
    (filters.goodWith.length > 0 ? 1 : 0)
  );
}

export function toggleValues(
  selected: readonly string[],
  values: readonly string[],
): string[] {
  if (values.every((value) => selected.includes(value))) {
    return selected.filter((value) => !values.includes(value));
  }
  return [...new Set([...selected, ...values])];
}
