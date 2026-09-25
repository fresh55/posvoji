import type {
  AnimalAdoptionRequirements,
  AnimalSize,
  CoatLength,
  EnergyLevel,
  Sex,
  Species,
} from "@posvoji/schema";
import { hasTestResult, type AnimalFields } from "@/lib/animal";
import type { Locale } from "@/lib/i18n";
import {
  filterColour,
  type AgeGroup,
  type CoatColorFacet,
  type WaitingGroup,
  type CareKey,
  type FilterOption,
  type GoodWithKey,
  type MultiGroup,
  type SpeciesFilter,
  type ToggleKey,
} from "./contracts";

// What the animal's facts say about a stated requirement. Each is the need
// behind one "Lahko ponudim" row in the same words, so a visitor who ticked
// "Dnevno nego" reads "Potrebuje dnevno nego" on the animal.
export const ADOPTION_REQUIREMENT_LABELS = {
  indoorOnly: { sl: "Potrebuje dom brez izhoda", en: "Needs an indoor-only home" },
  onlyPet: { sl: "Mora biti edina žival pri hiši", en: "Needs to be the only pet" },
  bondedPair: { sl: "Posvoji se samo v paru", en: "Adopted only as a pair" },
  experiencedCarer: { sl: "Potrebuje izkušeno roko", en: "Needs an experienced hand" },
  ongoingCare: { sl: "Potrebuje dnevno nego", en: "Needs daily care" },
} satisfies Record<keyof AnimalAdoptionRequirements, Record<Locale, string>>;

const GROUP_LABELS: Record<Locale, Record<MultiGroup, string>> = {
  sl: {
    sex: "Spol",
    age: "Starost",
    size: "Velikost",
    energy: "Energija",
    coatColor: "Barva",
    coatLength: "Dolžina dlake",
    // Names the wait and fits beside Ponastavi in the 224px sidebar, where
    // "Čas v zavetišču" did not.
    waiting: "Čaka na dom",
    shelter: "Zavetišče",
  },
  en: {
    sex: "Sex",
    age: "Age",
    size: "Size",
    energy: "Energy",
    coatColor: "Colour",
    coatLength: "Coat length",
    // Not "Waiting for a home", which does not fit beside Reset in the 224px
    // sidebar.
    waiting: "Waiting",
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
  /** Whether the record says anything either way. What a filter hides for
   *  having no answer is counted from this, not from a failed match: a "no"
   *  is an answer. */
  answered: (animal: AnimalFields) => boolean;
};

// A test result is an answer when it came back one way or the other.
// Nouns, not adjectives: Slovenian would force a gender on "cepljen" that
// "živali" doesn't share.
const TOGGLE_DEFS: ToggleDef[] = [
  {
    key: "sterilizacija",
    label: "Sterilizacija",
    matches: (animal) => animal.medical?.neutered === true,
    answered: (animal) => animal.medical?.neutered !== undefined,
  },
  {
    key: "cepljenje",
    label: "Cepljenje",
    matches: (animal) => animal.medical?.vaccinated === true,
    answered: (animal) => animal.medical?.vaccinated !== undefined,
  },
  {
    key: "cip",
    label: "Čip",
    matches: (animal) => animal.medical?.microchipped === true,
    answered: (animal) => animal.medical?.microchipped !== undefined,
  },
  // Only a recorded negative counts. An untested cat is "unknown", and letting
  // that through would sell a maybe as an all-clear on the one question these
  // filters exist to answer.
  {
    key: "brez-fiv",
    label: "Brez FIV",
    species: "cat",
    matches: (animal) => animal.medical?.fiv === "negative",
    answered: (animal) => hasTestResult(animal.medical?.fiv),
  },
  {
    key: "brez-felv",
    label: "Brez FeLV",
    species: "cat",
    matches: (animal) => animal.medical?.felv === "negative",
    answered: (animal) => hasTestResult(animal.medical?.felv),
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
  const { species, matches, answered } = toggle;
  if (!species) return toggle;
  return {
    ...toggle,
    matches: (animal) =>
      appliesToSpecies(species, animal.species) && matches(animal),
    answered: (animal) =>
      appliesToSpecies(species, animal.species) && answered(animal),
  };
}

/** Whether a toggle is a question this animal can be asked at all. A dog is
 *  not missing an FIV result; nobody asked. */
export function toggleAsks(toggle: ToggleDef, species: Species): boolean {
  return appliesToSpecies(toggle.species, species);
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
// goodWith and care are not MultiGroups, but their values are coded the same
// way and want the same one place to name them.
type ValueGroup = "goodWith" | "care";
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
  care: CareKey;
};

/** The canonical metadata for coded filter values. */
export type FilterValueDefinition<Value extends string = string> = {
  readonly value: Value;
  readonly slug: string;
  readonly labels: Readonly<Record<Locale, string>>;
  /** The value on its own, for the active-filter chip, where the section
   *  heading that gives the label its sense is not on screen. Only where the
   *  label does not stand alone. */
  readonly chip?: Readonly<Record<Locale, string>>;
  /** Which animals the option shows, drawn under its label, for a section
   *  whose labels cannot say it alone (Lahko ponudim). Short: the sidebar
   *  gives the line 136px. */
  readonly description?: Readonly<Record<Locale, string>>;
  /** The same line on a species tab whose animals it would misdescribe. */
  readonly descriptionOnTab?: Partial<
    Readonly<Record<Exclude<SpeciesFilter, "all">, Readonly<Record<Locale, string>>>>
  >;
};

export const FILTER_METADATA = {
  // Each paired colour follows its solid colour; multicolour stays last.
  coatColor: [
    { value: "black", slug: "crna", labels: { sl: "Črna", en: "Black" } },
    { value: "black-white", slug: "crno-bela", labels: { sl: "Črno-bela", en: "Black and white" } },
    { value: "brown", slug: "rjava", labels: { sl: "Rjava", en: "Brown" } },
    { value: "brown-white", slug: "rjavo-bela", labels: { sl: "Rjavo-bela", en: "Brown and white" } },
    { value: "grey", slug: "siva", labels: { sl: "Siva", en: "Grey" } },
    { value: "grey-white", slug: "sivo-bela", labels: { sl: "Sivo-bela", en: "Grey and white" } },
    { value: "orange", slug: "oranzna", labels: { sl: "Oranžna", en: "Orange" } },
    { value: "orange-white", slug: "oranzno-bela", labels: { sl: "Oranžno-bela", en: "Orange and white" } },
    { value: "cream", slug: "kremna", labels: { sl: "Kremna", en: "Cream" } },
    { value: "cream-white", slug: "kremno-bela", labels: { sl: "Kremno-bela", en: "Cream and white" } },
    { value: "white", slug: "bela", labels: { sl: "Bela", en: "White" } },
    { value: "multicolour", slug: "vecbarvna", labels: { sl: "Večbarvna", en: "Multicolour" } },
  ],
  // The chip names the coat as well. "Srednja" alone was also Velikost's
  // answer, so the chips row could hold two identical pills and a screen
  // reader heard "Odstrani filter Srednja" twice.
  coatLength: [
    { value: "short", slug: "kratka", labels: { sl: "Kratka", en: "Short" }, chip: { sl: "Kratka dlaka", en: "Short coat" } },
    { value: "medium", slug: "srednja", labels: { sl: "Srednja", en: "Medium" }, chip: { sl: "Srednja dlaka", en: "Medium coat" } },
    { value: "long", slug: "dolga", labels: { sl: "Dolga", en: "Long" }, chip: { sl: "Dolga dlaka", en: "Long coat" } },
    { value: "hairless", slug: "brez-dlake", labels: { sl: "Brez dlake", en: "Hairless" } },
  ],
  // "Nad", not "Več kot": with the hourglass beside it, "Več kot 6 mesecev"
  // no longer fit the sidebar's label slot and broke over two lines. The chip
  // has no section heading to lean on, so it says what the card's badge says
  // ("Čaka 4 leta").
  //
  // A no-break space ties each number to its unit, so a label that wraps in
  // the phone sheet breaks as "Nad / 6 mesecev" and never inside the
  // duration. The slugs keep their hyphens.
  waiting: [
    { value: "over-6-months", slug: "nad-6-mesecev", labels: { sl: "Nad 6\u00a0mesecev", en: "Over 6\u00a0months" }, chip: { sl: "Čaka nad 6\u00a0mesecev", en: "Waiting over 6\u00a0months" } },
    { value: "over-1-year", slug: "nad-1-leto", labels: { sl: "Nad 1\u00a0leto", en: "Over 1\u00a0year" }, chip: { sl: "Čaka nad 1\u00a0leto", en: "Waiting over 1\u00a0year" } },
    { value: "over-3-years", slug: "nad-3-leta", labels: { sl: "Nad 3\u00a0leta", en: "Over 3\u00a0years" }, chip: { sl: "Čaka nad 3\u00a0leta", en: "Waiting over 3\u00a0years" } },
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
  // Each label finishes the section's heading, "Lahko ponudim: dnevno nego",
  // the way Družba's finish "Doma imam". Short enough for the sidebar's 96px
  // label slot beside the count, measured: "Vsakodnevno nego" was 110px and
  // "Dom za dve živali" 100px, and both broke over two lines. The line under
  // each label ("Gredo samo v paru") is what says "dva" means two animals,
  // and the chip, which has no such line, says it whole.
  //
  // The slugs are the ones the section had as Posebna skrb, so shared links
  // keep working.
  care: [
    {
      value: "patient",
      slug: "potrpezljiv",
      labels: { sl: "Potrpežljivost", en: "Patience" },
      // What is left of specialNeeds once the two needs below take their own
      // animals (careMatches): about two thirds shy, the rest unwell in a way
      // that asks for time rather than daily care.
      description: { sl: "Plahe ali občutljive živali", en: "Shy or sensitive animals" },
    },
    {
      value: "bonded-pair",
      slug: "posvojitev-v-paru",
      labels: { sl: "Dom za dva", en: "A home for two" },
      chip: { sl: "Dom za dve živali", en: "A home for two animals" },
      description: { sl: "Gredo samo v\u00a0paru", en: "Adopted only as a pair" },
    },
    {
      value: "ongoing-care",
      slug: "potrebuje-redno-oskrbo",
      labels: { sl: "Dnevno nego", en: "Daily care" },
      chip: { sl: "Dnevna nega", en: "Daily care" },
      description: { sl: "Zdravila, dieta ali pomoč", en: "Medication, diet or help" },
    },
    {
      value: "experienced-carer",
      slug: "izkusen-skrbnik",
      labels: { sl: "Izkušeno roko", en: "Experience" },
      chip: { sl: "Izkušena roka", en: "Experience" },
      // Nineteen of the twenty-one are dogs, most of them large guardian breeds or
      // dogs wary of strangers. Saying so is what stops someone who grew up
      // with a dog from reading the row as theirs.
      description: { sl: "Močni ali nezaupljivi psi", en: "Powerful or wary dogs" },
      // The cats this row holds are the other two, and both are cats so
      // frightened of people that their shelters ask for someone who has
      // won one over before. "Psi" on the cat tab described nobody there.
      descriptionOnTab: {
        cat: { sl: "Zelo plahe mačke", en: "Very fearful cats" },
        other: { sl: "Zahtevnejše živali", en: "Demanding animals" },
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

export type CareOption = {
  key: CareKey;
  label: string;
  description: string;
};

export function careOptions(
  locale: Locale = "sl",
  species: SpeciesFilter = "all",
): CareOption[] {
  return FILTER_METADATA.care.map((option) => {
    const onTab: FilterValueDefinition["descriptionOnTab"] =
      "descriptionOnTab" in option ? option.descriptionOnTab : undefined;
    const description =
      (species === "all" ? undefined : onTab?.[species]) ?? option.description;
    return {
      key: option.value,
      label: option.labels[locale],
      description: description[locale],
    };
  });
}

/** A coded value as its chip says it: the chip wording where the label needs
 *  its heading to make sense, the label otherwise. Every chip but a shelter's
 *  and Družba's is named here. */
export function valueChipLabel(
  group: MetadataGroup,
  value: string,
  locale: Locale,
): string {
  const options: readonly FilterValueDefinition[] = FILTER_METADATA[group];
  const option = options.find((candidate) => candidate.value === value);
  return option?.chip?.[locale] ?? option?.labels[locale] ?? value;
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
    case "coatColor":
      return FILTER_METADATA.coatColor
        .filter(({ value }) => filterColour(value) === value)
        .map(({ value, labels }) => ({ value, label: labels[locale] }));
    case "sex":
    case "age":
    case "size":
    case "energy":
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
  if (group === "coatColor") {
    return FILTER_METADATA.coatColor.find((option) => option.value === value)?.labels[locale] ?? value;
  }
  const option = groupOptions(group, animals, locale).find(
    (candidate) => candidate.value === value,
  );
  return option?.label ?? value;
}
