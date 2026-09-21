import type {
  AnimalAdoptionRequirements,
  AnimalSize,
  CoatLength,
  EnergyLevel,
  Sex,
  Species,
} from "@posvoji/schema";
import type { AnimalFields } from "@/lib/animal";
import type { Locale } from "@/lib/i18n";
import {
  TWO_TONED,
  type AgeGroup,
  type CoatColorFacet,
  type WaitingGroup,
  type CareKey,
  type FilterOption,
  type GoodWithKey,
  type HomeKey,
  type MultiGroup,
  type ToggleKey,
} from "./contracts";

// Filter cards and animal facts use the same wording for confirmed requirements.
export const ADOPTION_REQUIREMENT_LABELS = {
  onlyPet: { sl: "Edini ljubljenček", en: "Only pet" },
  indoorOnly: { sl: "Samo notranje bivanje", en: "Indoor-only home" },
  bondedPair: { sl: "Posvojitev v paru", en: "Adopt together" },
  experiencedCarer: { sl: "Izkušen skrbnik", en: "Experienced carer" },
  ongoingCare: { sl: "Potrebuje redno oskrbo", en: "Ongoing care" },
} satisfies Record<keyof AnimalAdoptionRequirements, Record<Locale, string>>;

const GROUP_LABELS: Record<Locale, Record<MultiGroup, string>> = {
  sl: {
    sex: "Spol",
    age: "Starost",
    size: "Velikost",
    energy: "Energija",
    coatColor: "Barva",
    coatLength: "Dolžina dlake",
    waiting: "Čas v zavetišču",
    shelter: "Zavetišče",
  },
  en: {
    sex: "Sex",
    age: "Age",
    size: "Size",
    energy: "Energy",
    coatColor: "Colour",
    coatLength: "Coat length",
    waiting: "Time in shelter",
    shelter: "Shelter",
  },
};

export function groupLabel(group: MultiGroup, locale: Locale): string {
  return GROUP_LABELS[locale][group];
}

// species pins a toggle to one species: FIV and FeLV are questions only a cat
// can be asked. Without it the toggle asks something every species can answer.
// Two readers spell the pin differently and both are right. The matcher below
// compares the animal's own species; the sidebar asks whether the control
// belongs on the tab the visitor is on, where rabbits fold into "other"
// (toggleFitsSpecies in engine.ts).
export type ToggleDef = {
  key: ToggleKey;
  label: string;
  species?: Species;
  matches: (animal: AnimalFields) => boolean;
};

// Nouns, not adjectives: Slovenian would force a gender on "cepljen" that
// "živali" doesn't share.
const TOGGLE_DEFS: ToggleDef[] = [
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

// The pin as one rule, read by both the matcher and the denominator below.
function appliesToSpecies(
  only: Species | undefined,
  species: Species,
): boolean {
  return only === undefined || only === species;
}

// A pinned toggle answers for its own species alone, whatever the record says.
// A dog's record can carry a negative FIV field, filled in rather than tested,
// and "Brez FIV" on that dog states a fact that cannot exist. Wrapped at the
// definition, so every reader of matches inherits it: the dialog's badges, the
// poster's tiles and the filter index.
function pinned(toggle: ToggleDef): ToggleDef {
  const { species, matches } = toggle;
  if (!species) return toggle;
  return {
    ...toggle,
    matches: (animal) =>
      appliesToSpecies(species, animal.species) && matches(animal),
  };
}

export const TOGGLES: readonly ToggleDef[] = TOGGLE_DEFS.map(pinned);

/** The questions this species can be asked, answered or not. The dialog folds
 *  its health row to "Veterinarsko urejeno" once every one of them is
 *  answered, and a dog is not two answers short for never having been asked
 *  about FIV. Built from the rule the matchers are gated on, so the fold and
 *  the badge row cannot disagree. */
export function togglesAskedOf(species: Species): ToggleDef[] {
  return TOGGLES.filter((toggle) => appliesToSpecies(toggle.species, species));
}

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
  coatColor: CoatColorFacet;
  coatLength: CoatLength;
  waiting: WaitingGroup;
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
  // Ordered dark to light, which is the order the sidebar's palette draws
  // them in. Unordered, the grid was six chips in no relation to each other;
  // as a ramp it reads as one set, and a reader looking for a pale animal
  // knows which end to look at. Multicolour last, as docs/COLOUR-REVIEW.md
  // asks. The slug is what the URL carries, so the order is display only.
  //
  // Each two-toned answer follows the colour it is made of, so Črna and
  // Črno-bela are neighbours and the choice between them is the easy one to
  // see. See CoatColorFacet for why only three colours have a pair.
  coatColor: [
    { value: "black", slug: "crna", labels: { sl: "Črna", en: "Black" } },
    { value: "black-white", slug: "crno-bela", labels: { sl: "Črno-bela", en: "Black and white" } },
    { value: "brown", slug: "rjava", labels: { sl: "Rjava", en: "Brown" } },
    { value: "brown-white", slug: "rjavo-bela", labels: { sl: "Rjavo-bela", en: "Brown and white" } },
    { value: "grey", slug: "siva", labels: { sl: "Siva", en: "Grey" } },
    { value: "grey-white", slug: "sivo-bela", labels: { sl: "Sivo-bela", en: "Grey and white" } },
    { value: "orange", slug: "oranzna", labels: { sl: "Oranžna", en: "Orange" } },
    { value: "cream", slug: "kremna", labels: { sl: "Kremna", en: "Cream" } },
    { value: "white", slug: "bela", labels: { sl: "Bela", en: "White" } },
    { value: "multicolour", slug: "vecbarvna", labels: { sl: "Večbarvna", en: "Multicolour" } },
  ],
  coatLength: [
    { value: "short", slug: "kratka", labels: { sl: "Kratka", en: "Short" } },
    { value: "medium", slug: "srednja", labels: { sl: "Srednja", en: "Medium" } },
    { value: "long", slug: "dolga", labels: { sl: "Dolga", en: "Long" } },
    { value: "hairless", slug: "brez-dlake", labels: { sl: "Brez dlake", en: "Hairless" } },
  ],
  waiting: [
    { value: "over-6-months", slug: "nad-6-mesecev", labels: { sl: "Več kot 6 mesecev", en: "Over 6 months" } },
    { value: "over-1-year", slug: "nad-1-leto", labels: { sl: "Več kot 1 leto", en: "Over 1 year" } },
    { value: "over-3-years", slug: "nad-3-leta", labels: { sl: "Več kot 3 leta", en: "Over 3 years" } },
  ],
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
    {
      value: "indoor-only",
      slug: "samo-notranje-bivanje",
      labels: ADOPTION_REQUIREMENT_LABELS.indoorOnly,
    },
    { value: "only-pet", slug: "edini-ljubljencek", labels: ADOPTION_REQUIREMENT_LABELS.onlyPet },
  ],
  care: [
    {
      value: "patient",
      slug: "potrpezljiv",
      labels: {
        sl: "Potrpežljiv človek",
        en: "Patient person",
      },
    },
    {
      value: "bonded-pair",
      slug: "posvojitev-v-paru",
      labels: ADOPTION_REQUIREMENT_LABELS.bondedPair,
    },
    {
      value: "experienced-carer",
      slug: "izkusen-skrbnik",
      labels: ADOPTION_REQUIREMENT_LABELS.experiencedCarer,
    },
    {
      value: "ongoing-care",
      slug: "potrebuje-redno-oskrbo",
      // The filter names the need; the animal's facts keep the full sentence.
      labels: { ...ADOPTION_REQUIREMENT_LABELS.ongoingCare, sl: "Redna oskrba" },
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

/**
 * Which Barva answer an animal is, from the two facts the review records.
 *
 * The reviewed coatColor says which colour dominates and whiteMarkings says
 * whether the white on the animal is a bib or half of it. Only a major white
 * moves it, and only for the three colours that have a two-toned answer: a
 * mostly-white animal is already White, and Multicolour is already the answer
 * for a coat with no dominant colour at all.
 *
 * An animal nobody has judged the white on reads as minor, so the catalogue
 * behaves exactly as it did before the review records this.
 */
export function coatColorFacet(
  animal: Pick<AnimalFields, "coatColor" | "whiteMarkings">,
): CoatColorFacet | undefined {
  const colour = animal.coatColor;
  if (colour === undefined) return undefined;
  if (animal.whiteMarkings !== "major") return colour;
  return TWO_TONED.some((value) => value === colour)
    ? (`${colour}-white` as CoatColorFacet)
    : colour;
}

// Exhaustive like groupValue: a new group names its own options rather than
// inheriting whichever branch happens to be last.
export function groupOptions(
  group: MultiGroup,
  animals: AnimalFields[],
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
    case "coatColor":
    case "coatLength":
    case "waiting":
      return FILTER_METADATA[group].map(({ value, labels }) => ({
        value,
        label: labels[locale],
      }));
  }
}

export function optionLabel(
  group: MultiGroup,
  value: string,
  animals: AnimalFields[],
  locale: Locale = "sl",
): string {
  const option = groupOptions(group, animals, locale).find(
    (candidate) => candidate.value === value,
  );
  return option?.label ?? value;
}
