import type {
  AnimalSize, CoatColorCategory, CoatLength, EnergyLevel, Sex,
} from "@posvoji/schema";
import type { SpeciesTab } from "@/lib/species";

export type SpeciesFilter = "all" | SpeciesTab;
export type AgeGroup = "mladicek" | "odrasel" | "senior";
export type WaitingGroup = "over-6-months" | "over-1-year" | "over-3-years";

/** Colours with a paired swatch. Review categories are stored directly. */
export const TWO_TONED = ["black", "brown", "grey", "orange", "cream"] as const;
export type CoatColorFacet = CoatColorCategory;

// Cream categories are below the 15-animal option threshold. Keep their
// reviewed values in the dataset and group them with orange in the controls.
export function filterColour(category: CoatColorCategory | undefined): CoatColorFacet | undefined {
  if (category === "cream") return "orange";
  if (category === "cream-white") return "orange-white";
  return category;
}
export type MultiGroup =
  | "sex" | "age" | "size" | "energy" | "shelter"
  | "coatColor" | "coatLength" | "waiting";

// Yes/no properties an animal either has or doesn't. Every pick here has to
// hold, as in Družba: each is a guarantee of its own rather than an
// alternative of one attribute, which is what the OR sections offer. Sections
// combine with AND.
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

// What the visitor can offer, each one a need some animals have. A pick shows
// the animals that need it, so every key reads in one direction: "Lahko
// ponudim" and then the thing. Ordered from what most homes can give to what
// few can, so a visitor reads down until a row stops being about them.
//
// Household facts are not here. Whether the animal has to be the only pet is
// answered by Doma imam (goodWithMatches), and indoor-only is a shelter's
// house rule far more often than an animal's own need; both stay on the
// animal as facts.
export const CARE_KEYS = [
  "patient",
  "bonded-pair",
  "ongoing-care",
  "experienced-carer",
] as const;
export type CareKey = (typeof CARE_KEYS)[number];

export type Filters = {
  species: SpeciesFilter;
  sex: Sex[];
  age: AgeGroup[];
  size: AnimalSize[];
  energy: EnergyLevel[];
  coatColor: CoatColorFacet[];
  coatLength: CoatLength[];
  waiting: WaitingGroup[];
  shelter: string[];
  toggles: ToggleKey[];
  goodWith: GoodWithKey[];
  care: CareKey[];
};

export const EMPTY_FILTERS: Filters = {
  species: "all",
  sex: [],
  age: [],
  size: [],
  energy: [],
  coatColor: [],
  coatLength: [],
  waiting: [],
  shelter: [],
  toggles: [],
  goodWith: [],
  care: [],
};

// V zavetišču answers with thresholds, each inside the one before it, so
// two picks ask exactly what the wider one asks alone and the narrower tick
// would only sit there doing nothing. These groups take one answer at a time.
export const SINGLE_CHOICE_GROUPS: readonly MultiGroup[] = ["waiting"];

export const GROUPS: MultiGroup[] = [
  "sex", "age", "size", "energy", "waiting", "coatColor", "coatLength", "shelter",
];

/** All filter categories, used to group and label active chips. */
export type FilterFacet = MultiGroup | "toggles" | "goodWith" | "care";

export const FILTER_FACETS: FilterFacet[] = [
  ...GROUPS,
  "toggles",
  "goodWith",
  "care",
];

// city is the shelter's town, kept as its own field rather than a generic
// sublabel because the map places a marker from it.
export type FilterOption = { value: string; label: string; city?: string };
