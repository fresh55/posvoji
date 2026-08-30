import type { AnimalSize, EnergyLevel, Sex } from "@posvoji/schema";
import type { Locale } from "@/lib/i18n";
import { homePath } from "@/lib/shelter-path";
import {
  LEGACY_TAB_SLUGS,
  SPECIES_TAB_ORDER,
  SPECIES_TAB_SLUGS,
} from "@/lib/species";
import {
  EMPTY_FILTERS,
  GROUPS,
  type AgeGroup,
  type CareKey,
  type Filters,
  type GoodWithKey,
  type HomeKey,
  type MultiGroup,
  type SpeciesFilter,
  type ToggleKey,
} from "./contracts";
import { pruneHiddenFilters } from "./engine";
import {
  FILTER_METADATA,
  TOGGLES,
  type FilterValueDefinition,
} from "./metadata";

// URL codecs. Slovenian, ASCII-only params: ?vrsta=pes&spol=samica&starost=mladicek
// The tab slugs live in lib/species.ts, which imports nothing but a type, so
// the tabs and the portal can read them without pulling this module and its
// dependencies along.
const PARAM_NAMES: Record<MultiGroup, string> = {
  sex: "spol",
  age: "starost",
  size: "velikost",
  energy: "energija",
  shelter: "zavetisce",
};

type ValueGroup = "goodWith" | "home" | "care";

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
    params.set("vrsta", SPECIES_TAB_SLUGS[filters.species]);
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

/**
 * The animals grid showing one shelter and nothing else.
 *
 * Built through serializeFilters rather than by spelling the query, because
 * PARAM_NAMES is private and parseFilters drops a param it does not know
 * without complaining: a link that spelled its own key would keep working as a
 * link and quietly stop filtering. The same name is what prehydration-script.ts
 * watches to hide the results until the filter has been applied, so a hand
 * written key would also flash the unfiltered grid.
 */
export function shelterAnimalsPath(shelterId: string, locale: Locale): string {
  const query = serializeFilters({ ...EMPTY_FILTERS, shelter: [shelterId] });
  return `${homePath(locale)}?${query}`;
}

// Unknown slugs are dropped silently: a stale shared link should degrade to
// fewer filters, not break the page. So is anything the link's own species tab
// hides, such as a cat-only toggle carried onto ?vrsta=pes.
// What one param is allowed to put into state. Four of the five groups are
// bounded by their own metadata, but Zavetisce is not: its slugs are shelter
// ids, which the codec passes through because it has no dataset to check them
// against. Everything downstream then pays per value: a chip in the sticky
// header, and a full pass over the dataset to price that chip (chipGain in
// animal-grid.tsx). ?zavetisce= with five thousand ids in it was five thousand
// of each, on the phone, from a link anyone can write. The cap is well past
// the longest real selection, which is every shelter in the country at eleven.
const MAX_VALUES_PER_PARAM = 32;
// Past the longest real slug, which is ten characters.
const MAX_VALUE_LENGTH = 64;

// The comma-separated values of one param, bounded and deduplicated before
// anything is looked up. An empty one is dropped rather than kept: ?zavetisce=,
// used to parse to a single "" shelter, which no animal has, so the page went
// to nothing matching behind a chip with no words on it and no way to reason
// about what was on.
function paramValues(params: URLSearchParams, name: string): string[] {
  // getAll and not get: this codec writes one param carrying a comma list, but
  // a URL is free to repeat a param instead, and hand-edited and hand-built
  // links do. get() returns only the first, so ?spol=samec&spol=samica quietly
  // filtered on samec alone. Joining the repeats reads both shapes as the one
  // list they mean, and the dedup below covers a value written in both.
  //
  // No empty-string guard: an absent or empty param splits to [""], which the
  // length filter drops, so the empty case already lands on [].
  const raw = params.getAll(name).join(",");
  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(
          (value) => value.length > 0 && value.length <= MAX_VALUE_LENGTH,
        ),
    ),
  ].slice(0, MAX_VALUES_PER_PARAM);
}

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const slug = params.get("vrsta");
  // The legacy lookup keeps links shared before a species tab was folded into
  // "other" filtering the way they used to, near enough: ?vrsta=zajcek now
  // opens the whole small-animal tab.
  const species: SpeciesFilter =
    SPECIES_TAB_ORDER.find((tab) => SPECIES_TAB_SLUGS[tab] === slug) ??
    (slug !== null && Object.hasOwn(LEGACY_TAB_SLUGS, slug)
      ? LEGACY_TAB_SLUGS[slug]
      : undefined) ??
    "all";
  // No second dedupe below: paramValues has already made the slugs unique, and
  // every slug-to-value lookup here is one-to-one.
  const values = (group: MultiGroup): string[] =>
    paramValues(params, PARAM_NAMES[group])
      .map((valueSlug) => fromSlug(group, valueSlug))
      .filter((value): value is string => value !== undefined);
  const toggles = paramValues(params, "lastnosti").filter(
    (toggleSlug): toggleSlug is ToggleKey =>
      TOGGLES.some((toggle) => toggle.key === toggleSlug),
  );
  const codedValues = (group: ValueGroup): string[] =>
    paramValues(params, VALUE_PARAM_NAMES[group])
      .map((valueSlug) => valueFromSlug(group, valueSlug))
      .filter((value): value is string => value !== undefined);
  return pruneHiddenFilters({
    species,
    sex: values("sex") as Sex[],
    age: values("age") as AgeGroup[],
    size: values("size") as AnimalSize[],
    energy: values("energy") as EnergyLevel[],
    shelter: values("shelter"),
    toggles,
    goodWith: codedValues("goodWith") as GoodWithKey[],
    home: codedValues("home") as HomeKey[],
    care: codedValues("care") as CareKey[],
  });
}
