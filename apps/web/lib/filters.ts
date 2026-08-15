import { Species, type Animal, type AnimalSize, type Sex } from "@posvoji/schema";

export type SpeciesFilter = "all" | Species;
export type AgeGroup = "mladicek" | "odrasel" | "senior";
export type MultiGroup = "sex" | "age" | "size" | "shelter";

// Yes/no properties an animal either has or doesn't, kept apart from the
// choose-among groups because they combine with AND: asking for cepljenje and
// sterilizacija means both, not either.
export type ToggleKey = "sterilizacija" | "cepljenje" | "cip";

export type Filters = {
  species: SpeciesFilter;
  sex: Sex[];
  age: AgeGroup[];
  size: AnimalSize[];
  shelter: string[];
  toggles: ToggleKey[];
};

export const EMPTY_FILTERS: Filters = {
  species: "all",
  sex: [],
  age: [],
  size: [],
  shelter: [],
  toggles: [],
};

export const GROUPS: MultiGroup[] = ["sex", "age", "size", "shelter"];

export const GROUP_LABELS: Record<MultiGroup, string> = {
  sex: "Spol",
  age: "Starost",
  size: "Velikost",
  shelter: "Zavetišče",
};

export type ToggleDef = {
  key: ToggleKey;
  label: string;
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
];

export function toggleLabel(key: ToggleKey): string {
  return TOGGLES.find((t) => t.key === key)?.label ?? key;
}

function matchesToggles(animal: Animal, selected: ToggleKey[]): boolean {
  return TOGGLES.every(
    (toggle) => !selected.includes(toggle.key) || toggle.matches(animal),
  );
}

// Boundaries in months: under a year is a baby, past eight a senior.
const PUPPY_MAX_EXCLUSIVE = 12;
const ADULT_MAX_EXCLUSIVE = 96;

export function ageInMonths(animal: Animal, now: Date): number | undefined {
  if (animal.approximateAgeMonths !== undefined) {
    return animal.approximateAgeMonths;
  }
  if (animal.birthDate) {
    const birth = new Date(animal.birthDate);
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 +
      (now.getMonth() - birth.getMonth());
    return Math.max(0, months);
  }
  return undefined;
}

function ageGroup(months: number): AgeGroup {
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
  applied: { toggles: ToggleKey[]; skipGroup?: MultiGroup },
): boolean {
  return (
    matchesSpecies(animal, filters.species) &&
    matchesToggles(animal, applied.toggles) &&
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
    shelter: new Map<string, number>(),
  };
  for (const group of GROUPS) {
    const applied = { toggles: filters.toggles, skipGroup: group };
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
    const applied = {
      toggles: filters.toggles.filter((key) => key !== toggle.key),
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

// A toggle that every animal passes (or none do) can't narrow anything.
export function visibleToggles(animals: Animal[]): ToggleDef[] {
  return TOGGLES.filter((toggle) => {
    const matching = animals.filter((a) => toggle.matches(a)).length;
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
  now: Date,
): Record<MultiGroup, boolean> {
  const distinct = {
    sex: new Set<string>(),
    age: new Set<string>(),
    size: new Set<string>(),
    shelter: new Set<string>(),
  };
  for (const animal of animals) {
    for (const group of GROUPS) {
      const value = groupValue(animal, group, now);
      if (value !== undefined) distinct[group].add(value);
    }
  }
  return {
    sex: distinct.sex.size >= 2,
    age: distinct.age.size >= 2,
    size: distinct.size.size >= 2,
    shelter: distinct.shelter.size >= 2,
  };
}

export type FilterOption = { value: string; label: string; sublabel?: string };

const SEX_OPTIONS: FilterOption[] = [
  { value: "male", label: "Samec" },
  { value: "female", label: "Samica" },
];

const AGE_OPTIONS: FilterOption[] = [
  { value: "mladicek", label: "Mladiček" },
  { value: "odrasel", label: "Odrasel" },
  { value: "senior", label: "Senior" },
];

const SIZE_OPTIONS: FilterOption[] = [
  { value: "small", label: "Majhna" },
  { value: "medium", label: "Srednja" },
  { value: "large", label: "Velika" },
];

// Exhaustive like groupValue: a new group names its own options rather than
// inheriting whichever branch happens to be last.
export function groupOptions(
  group: MultiGroup,
  animals: Animal[],
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
        .map(([value, { name, city }]) => ({
          value,
          label: name,
          sublabel: city,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "sl"));
    }
    case "sex":
      return SEX_OPTIONS;
    case "age":
      return AGE_OPTIONS;
    case "size":
      return SIZE_OPTIONS;
  }
}

export function optionLabel(
  group: MultiGroup,
  value: string,
  animals: Animal[],
): string {
  const option = groupOptions(group, animals).find((o) => o.value === value);
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

const VALUE_SLUGS: Record<Exclude<MultiGroup, "shelter">, [string, string][]> = {
  sex: [
    ["male", "samec"],
    ["female", "samica"],
  ],
  age: [
    ["mladicek", "mladicek"],
    ["odrasel", "odrasel"],
    ["senior", "senior"],
  ],
  size: [
    ["small", "majhna"],
    ["medium", "srednja"],
    ["large", "velika"],
  ],
};

const PARAM_NAMES: Record<MultiGroup, string> = {
  sex: "spol",
  age: "starost",
  size: "velikost",
  shelter: "zavetisce",
};

function toSlug(group: MultiGroup, value: string): string {
  if (group === "shelter") return value;
  return VALUE_SLUGS[group].find(([v]) => v === value)?.[1] ?? value;
}

function fromSlug(group: MultiGroup, slug: string): string | undefined {
  if (group === "shelter") return slug;
  return VALUE_SLUGS[group].find(([, s]) => s === slug)?.[0];
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
  // Commas are legal unencoded, and these links get shared by hand.
  return params.toString().replace(/%2C/g, ",");
}

// Unknown slugs are dropped silently: a stale shared link should degrade to
// fewer filters, not break the page.
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
  return {
    species,
    sex: values("sex") as Sex[],
    age: values("age") as AgeGroup[],
    size: values("size") as AnimalSize[],
    shelter: values("shelter"),
    toggles: [...new Set(toggles)],
  };
}

export function activeFilterCount(filters: Filters): number {
  return (
    GROUPS.reduce((sum, group) => sum + filters[group].length, 0) +
    filters.toggles.length
  );
}
