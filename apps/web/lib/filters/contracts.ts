import type { AnimalSize, EnergyLevel, Sex } from "@posvoji/schema";
import type { SpeciesTab } from "@/lib/species";

export type SpeciesFilter = "all" | SpeciesTab;
export type AgeGroup = "mladicek" | "odrasel" | "senior";
export type MultiGroup = "sex" | "age" | "size" | "energy" | "shelter";

// Yes/no properties an animal either has or doesn't. Choices within this
// section combine with OR, and sections combine with AND. Every section works
// this way except Družba, whose choices are constraints of one household
// rather than alternatives of one attribute.
export const TOGGLE_KEYS = [
  "sterilizacija",
  "cepljenje",
  "cip",
  "brez-fiv",
  "brez-felv",
] as const;
export type ToggleKey = (typeof TOGGLE_KEYS)[number];

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

/** Every question the filter asks, as one union. MultiGroup covers the five
 *  that share a codec; the four below each carry their own key type, so they
 *  are named here rather than folded in. The chips row is the one surface that
 *  has to talk about all nine at once: it groups by facet and it draws one
 *  icon per facet, and both need a single name for "which question is this". */
export type FilterFacet = MultiGroup | "toggles" | "goodWith" | "home" | "care";

export const FILTER_FACETS: FilterFacet[] = [
  ...GROUPS,
  "toggles",
  "goodWith",
  "home",
  "care",
];

// city is the shelter's town, kept as its own field rather than a generic
// sublabel because the map places a marker from it.
export type FilterOption = { value: string; label: string; city?: string };
