import type {
  AnimalSize, CoatColorCategory, CoatLength, EnergyLevel, Sex,
} from "@posvoji/schema";
import type { SpeciesTab } from "@/lib/species";

export type SpeciesFilter = "all" | SpeciesTab;
export type AgeGroup = "mladicek" | "odrasel" | "senior";
export type WaitingGroup = "over-6-months" | "over-1-year" | "over-3-years";

/**
 * The colours whose two-toned form is its own answer.
 *
 * Only black, brown and grey get a pair. COLOUR-REVIEW.md already sets the
 * bar for giving a colour its own option at 15 animals, in the rule that
 * folds Cream into Orange below that; the two-toned counts are 83, 35 and 20
 * against 9 for orange and 4 for cream.
 */
export const TWO_TONED = ["black", "brown", "grey"] as const satisfies
  readonly CoatColorCategory[];

/**
 * What the Barva filter offers, which is finer than the colour the review
 * records.
 *
 * A reviewed coatColor is the one colour that dominates, and on its own it
 * put 83 of the 146 animals classified black behind a plain black swatch
 * when over half of them are black and white. Petfinder splits the same way
 * and for the same reason: Black and Black & White / Tuxedo are separate
 * options there, and every one of its two-toned options pairs with white,
 * because white is the colour that visibly splits an animal.
 *
 * Derived rather than stored: the two facts it is built from are both
 * reviewed, and a third copy of them in the payload is a third thing to keep
 * in step. See coatColorFacet.
 */
export type CoatColorFacet =
  | CoatColorCategory
  | `${(typeof TWO_TONED)[number]}-white`;
export type MultiGroup =
  | "sex" | "age" | "size" | "energy" | "shelter"
  | "coatColor" | "coatLength" | "waiting";

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

// Home filters match confirmed answers only.
export const HOME_KEYS = ["apartment", "indoor-only", "only-pet"] as const;
export type HomeKey = (typeof HOME_KEYS)[number];

// Not a warning but a way in: it exists for visitors who came looking for the
// animal that needs more from them, and who would otherwise never find it.
export const CARE_KEYS = [
  "patient",
  "bonded-pair",
  "experienced-carer",
  "ongoing-care",
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
  home: HomeKey[];
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
  home: [],
  care: [],
};

export const GROUPS: MultiGroup[] = [
  "sex", "age", "size", "energy", "waiting", "coatColor", "coatLength", "shelter",
];

/** All filter categories, used to group and label active chips. */
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
