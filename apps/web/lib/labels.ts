import type { AdoptionStatus, AnimalSize, Sex, Species } from "@posvoji/schema";
import type { AnimalFields } from "@/lib/animal";
import type { Locale, TranslationKey } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import {
  ageInMonths,
  FILTER_METADATA,
  type CareKey,
  type GoodWithKey,
  type HomeKey,
  type SpeciesFilter,
} from "@/lib/filters";

const SPECIES: Record<Locale, Record<Species, string>> = {
  sl: {
    dog: "Pes",
    cat: "Mačka",
    rabbit: "Zajček",
    other: "Druga žival",
  },
  en: {
    dog: "Dog",
    cat: "Cat",
    rabbit: "Rabbit",
    other: "Other animal",
  },
};

// Slovenian has a dual, so 1, 2, 3-4 and 5+ each take a different form.
function pick(
  n: number,
  forms: [string, string, string, string],
): string {
  const rest = n % 100;
  if (rest === 1) return forms[0];
  if (rest === 2) return forms[1];
  if (rest === 3 || rest === 4) return forms[2];
  return forms[3];
}

function plural(
  n: number,
  forms: [string, string, string, string],
): string {
  return `${n} ${pick(n, forms)}`;
}

export function formatAge(months: number, locale: Locale): string {
  if (locale === "en") {
    if (months < 12) return `${months} ${months === 1 ? "month" : "months"}`;
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  if (months < 12) {
    // Nominative plural for 3 and 4: "trije meseci", "štirje meseci". The
    // third slot held "mesece", which is the accusative, and every place this
    // string lands is nominative: the card's middot list, the dialog's
    // "Starost:" badge, the "V zavetišču:" aside. The years array below never
    // showed the same bug because neuter nominative and accusative plural are
    // both "leta".
    //
    // That makes ageLabel explicitly nominative. The one accusative context on
    // the site is the dialog's longStay sentence, and it is safe only because
    // LONG_STAY_MONTHS is 36 and it can never be handed a month string. If
    // that constant ever drops below 12, that sentence needs its own forms.
    return plural(months, ["mesec", "meseca", "meseci", "mesecev"]);
  }
  return plural(Math.floor(months / 12), ["leto", "leti", "leta", "let"]);
}

// "1 žival", "2 živali", "5 živali" for result counts.
const ANIMAL_FORMS: [string, string, string, string] = [
  "žival",
  "živali",
  "živali",
  "živali",
];

// "1 zavetišče", "2 zavetišči", "3 zavetišča", "5 zavetišč" for coverage.
const SHELTER_FORMS: [string, string, string, string] = [
  "zavetišče",
  "zavetišči",
  "zavetišča",
  "zavetišč",
];

export function animalCount(n: number, locale: Locale): string {
  return locale === "sl"
    ? plural(n, ANIMAL_FORMS)
    : `${n} ${n === 1 ? "animal" : "animals"}`;
}

export function shelterCount(n: number, locale: Locale): string {
  return locale === "sl"
    ? plural(n, SHELTER_FORMS)
    : `${n} ${n === 1 ? "shelter" : "shelters"}`;
}

/**
 * The date the shelter register was published, for the provenance line the
 * shelters index and every shelter page carry.
 *
 * Read as UTC, because a date-only string parses as UTC midnight and reading
 * it locally moves it into the previous day west of Greenwich. An unparseable
 * value prints as it was written rather than as "Invalid Date".
 *
 * Numeric in Slovenian, and not out of preference. The line reads
 * "Vir: UVHVVR ..., stanje 23. 2. 2026." and after "stanje" the date is
 * genitive: "23. februarja 2026". Intl has no genitive month, dateStyle
 * "long" gives the nominative "23. februar 2026", and the sentence shipped
 * ungrammatical on the shelters index and on every shelter page. A month
 * table of our own would be a second date formatter to keep in step with
 * this one; a numeric date has no case to get wrong at all.
 *
 * English keeps the long form. "as of 23 February 2026" is already
 * grammatical there, and that sentence is the only place either string
 * appears, so the two locales do not have to agree on shape.
 */
// Two formatters, built once. Constructing an Intl.DateTimeFormat is the
// expensive half of formatting one date, and the build calls this on every
// shelter page in both locales; the shapes never vary, so there is nothing to
// build per call.
const REGISTER_DATE_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  sl: new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }),
};

export function registerDateLabel(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return REGISTER_DATE_FORMAT[locale].format(date);
}

/**
 * "11 deli podatke" and "503 živali čakajo na dom", declined.
 *
 * Here rather than in the page that prints them, because a verb agreeing with
 * a numeral is a property of Slovenian and not of one page: this file already
 * owns every other count on the site and its own dual/plural ladder, and a
 * second copy of that ladder in a component is a second place for it to be
 * wrong. The numeral is printed by the caller, so only the words are chosen.
 */
export function sharesDataLabel(n: number, locale: Locale): string {
  if (locale === "en") return n === 1 ? "shares data" : "share data";
  return pick(n, [
    "deli podatke",
    "delita podatke",
    "delijo podatke",
    "deli podatke",
  ]);
}

export function waitingLabel(n: number, locale: Locale): string {
  if (locale === "en") return "waiting";
  return pick(n, [
    "čaka na dom",
    "čakata na dom",
    "čakajo na dom",
    "čaka na dom",
  ]);
}

// Deliberately count-free. The picker's roster is the whole UVHVVR registry,
// live shelters and the ones with nothing listed alike, which is a different
// number from the live-shelter count the hero states in the same breath
// ("11 zavetišč · osveženo ..."). A number here ("Vseh 17 zavetišč") read as
// a second, disagreeing answer to the same question the hero had just
// answered; naming no count sidesteps the contradiction instead of picking a
// side. The "X od Y zavetišč" wording below keeps its total, because that
// sentence is explicitly about the registry ("X of Y"), not a bare headline
// count.
export function allShelters(locale: Locale): string {
  return locale === "en" ? "All shelters" : "Vsa zavetišča";
}

// "X od Y zavetišč", the trigger's answer once something is picked. The noun
// sits after "od", so it is genitive, and it agrees with the total rather
// than with the selection: genitive singular is "zavetišča" and every count
// above one takes "zavetišč". shelterCount cannot stand in for it, because
// SHELTER_FORMS is nominative, which is what made a one-shelter registry read
// "1 od 1 zavetišč". English agrees with the total the same way.
export function sheltersOf(
  selected: number,
  total: number,
  locale: Locale,
): string {
  if (locale === "en") {
    return `${selected} of ${total} ${total === 1 ? "shelter" : "shelters"}`;
  }
  return `${selected} od ${total} ${total === 1 ? "zavetišča" : "zavetišč"}`;
}

// What the picker's trigger and the Kje row both say they are showing: the
// whole country until something is picked, and "X od Y zavetišč" after that.
// One helper because three surfaces state it now (the toolbar trigger, the
// sidebar row, the sheet row) and a second copy of the branch would be free to
// answer differently from the dialog it opens.
export function shelterScopeLabel(
  selected: number,
  total: number,
  locale: Locale,
): string {
  return selected === 0
    ? allShelters(locale)
    : sheltersOf(selected, total, locale);
}

export function sheltersMissingFromMap(n: number, locale: Locale): string {
  if (locale === "en") {
    return `${shelterCount(n, locale)} ${n === 1 ? "is" : "are"} not on the map.`;
  }
  const verb = pick(n, ["ni", "nista", "niso", "ni"]);
  return `${shelterCount(n, locale)} ${verb} na zemljevidu.`;
}

// What one region click took off the filter, for the picker's live region: a
// running total cannot say that twelve shelters just came off. The participle
// agrees with the count the same way the verb above it does, so a dual is not
// read out as a plural.
export function sheltersDropped(n: number, locale: Locale): string {
  if (locale === "en") return `Removed ${shelterCount(n, locale)}.`;
  const participle = pick(n, [
    "Odstranjeno",
    "Odstranjeni",
    "Odstranjena",
    "Odstranjenih",
  ]);
  return `${participle} ${shelterCount(n, locale)}.`;
}

// An age of zero months is a number nobody says out loud.
export function ageLabel(months: number, locale: Locale): string {
  if (months === 0) return translate(locale, "lessThanMonth");
  return formatAge(months, locale);
}

export function speciesLabel(species: Species, locale: Locale): string {
  return SPECIES[locale][species];
}

// "Mačka · 2 leti", skipping whatever we don't know.
//
// `species` is the grid's active tab. When it names one species, the word
// comes off: the tab already said it, and repeating it costs the line the room
// it needs. At a 390px phone the content box is 145px and
// "Mačka · samica · 11 mesecev" is 192px, so 263 of 503 cards wrapped and
// orphaned the unit onto a second line ("Mačka · samica · 11" / "mesecev").
// Without the species word exactly one animal in the registry still wraps.
// "Mačka" is 43px against "Pes" at 24px, which is why this read as a cat
// problem.
//
// Size takes the slot the species word vacated, and only that slot. It is on
// 44% of dogs and 16% of cats, which is thin, but it is the only field left
// with enough coverage to be worth a place, and it is a thing people decide
// on. Lowercased, because in a middot list of lowercase attributes "Srednja"
// reads as the start of a new sentence.
//
// Two items is what the card's width buys at a 375px phone, not three. Three
// wrapped onto a second line on 55 of 60 rendered cards on the Vse tab and on
// 33 of 60 on Psi, which left cards in a row disagreeing in height. Sex is the
// item that gave up its slot, because it is the one fact on the line that does
// not change what a visitor taps next. It stays a filter, and it stays a fact
// on the animal's own page.
/** The separator between the meta line's facts. Exported because the card
 *  draws the parts itself to dim these, and a private literal split back out
 *  of the joined string in another file is a contract nothing enforces. */
export const META_SEPARATOR = " · ";

/** How a separating middot is drawn wherever one appears between facts: half
 *  strength, so the facts read as words rather than as one string. Shared so
 *  the card's meta line and the shelter header's do not drift apart. */
export const META_DOT_CLASS = "text-muted-foreground/50";

/** The facts themselves, in order, with the empty ones dropped. The card maps
 *  over these so it can style the separators without splitting the joined
 *  string back apart; animalMeta below is this joined, for the callers that
 *  want one string. */
export function animalMetaParts(
  animal: AnimalFields,
  locale: Locale = "sl",
  now: Date = new Date(),
  species: SpeciesFilter = "all",
): string[] {
  const months = ageInMonths(animal, now);
  // Only a tab that names one species has already said the word. The merged
  // Ostale tab holds rabbits and whatever else, so there the line still has
  // to say which animal this is.
  const named = species === "dog" || species === "cat";
  return [
    named ? "" : speciesLabel(animal.species, locale),
    months !== undefined ? ageLabel(months, locale) : "",
    named && animal.size
      ? sizeLabel(animal.size, locale).toLocaleLowerCase(locale)
      : "",
  ].filter(Boolean);
}

export function animalMeta(
  animal: AnimalFields,
  locale: Locale = "sl",
  now: Date = new Date(),
  species: SpeciesFilter = "all",
): string {
  return animalMetaParts(animal, locale, now, species).join(META_SEPARATOR);
}

// Whole months since intake, same arithmetic as ageInMonths in filters.ts but
// for a raw ISO date string rather than an Animal. Both sides are read in UTC,
// because a date-only string parses as UTC midnight and reading it locally
// moves it into the previous month west of Greenwich. A negative span (future
// date) or an unparsable one means we can't say, not "0".
export function monthsInShelter(
  intakeDate: string,
  now: Date,
): number | undefined {
  const intake = new Date(intakeDate);
  if (Number.isNaN(intake.getTime())) return undefined;
  const months =
    (now.getUTCFullYear() - intake.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - intake.getUTCMonth());
  if (months < 0) return undefined;
  return months;
}

export function timeInShelter(
  intakeDate: string,
  locale: Locale,
  now: Date,
): string | undefined {
  const months = monthsInShelter(intakeDate, now);
  if (months === undefined) return undefined;
  return ageLabel(months, locale);
}

// Long stays are the norm in Slovenian shelters: at twelve months the mark
// would show on nearly half the animals and mean nothing. Three years keeps
// it to roughly one in five. The card and the dialog read this one constant,
// so they cannot disagree about who counts as waiting long.
export const LONG_STAY_MONTHS = 36;

// The wait in months of an animal that has waited long and is actually up
// for adoption, or undefined. Reserved and held animals are not waiting for
// the visitor's decision, and an adopted one's stay is history.
export function longStayMonths(animal: AnimalFields, now: Date): number | undefined {
  if (!animal.intakeDate) return undefined;
  // An allowlist and not a denylist of the other three. A fifth status added
  // to the schema would silently inherit the mark under a denylist, and this
  // is a plea about an animal a visitor can still act on: available, or an
  // unknown that the shelter's own listing still carries.
  if (animal.status !== "available" && animal.status !== "unknown") {
    return undefined;
  }
  const months = monthsInShelter(animal.intakeDate, now);
  if (months === undefined || months < LONG_STAY_MONTHS) return undefined;
  return months;
}

const STATUS_KEYS: Record<
  Exclude<AdoptionStatus, "unknown">,
  TranslationKey
> = {
  available: "statusAvailable",
  reserved: "statusReserved",
  adopted: "statusAdopted",
  hold: "statusHold",
};

export function statusLabel(
  status: AdoptionStatus,
  locale: Locale,
): string | undefined {
  if (status === "unknown") return undefined;
  return translate(locale, STATUS_KEYS[status]);
}

export function sexLabel(
  sex: Exclude<Sex, "unknown">,
  locale: Locale,
): string {
  return (
    FILTER_METADATA.sex.find((option) => option.value === sex)?.labels[
      locale
    ] ?? sex
  );
}

// A chip names the household, not the card. The card label answers the section
// heading ("Doma imam: Psa"), but a chip stands on its own in a row next to the
// species chips, where "Psa" would read as a list of dogs.
const GOOD_WITH_CHIP_KEYS: Record<GoodWithKey, TranslationKey> = {
  kids: "goodWithChipKids",
  dogs: "goodWithChipDogs",
  cats: "goodWithChipCats",
};

export function goodWithChipLabel(key: GoodWithKey, locale: Locale): string {
  return translate(locale, GOOD_WITH_CHIP_KEYS[key]);
}

// "Zavetišče" as a leading or trailing word in a shelter's own name, with
// whatever separator carries it. Not a word boundary in the middle: "Obalno
// zavetišče (Marjetica Koper)" opens with the adjective that distinguishes it,
// and dropping the noun out of the middle of that leaves nonsense.
const SHELTER_NOUN = /^zavetišče\s+|\s*[—–-]\s*zavetišče$/iu;

// Any trailing parenthetical. In this registry every one of them names the
// operator rather than the shelter: "(Marjetica Koper)" is the municipal
// company behind "Obalno zavetišče". A chip or a card footer identifies, it
// does not attribute, and the operator is on the shelter's own page one press
// away. Named for what it matches and not for what it means, because the
// pattern cannot tell an operator from a future name that disambiguates two
// shelters in brackets; if one ever appears, this is the line that has to
// learn the difference.
const SHELTER_TRAILING_PAREN = /\s*\([^()]*\)\s*$/u;

/** A shelter's name with the word "zavetišče" and any trailing operator
 *  parenthetical taken off it, for a chip or a card's shelter line.
 *
 *  On a 390px phone "Zavetišče Mala hiša" is 180px, half the row, and five of
 *  the registry's shelters open with that same word: a truncating pill would
 *  cut away the half that says which shelter and keep the half that says what
 *  every shelter is. The pin on the chip already carries the noun, the same
 *  way the household chips drop theirs (goodWithChipLabel above). The
 *  parenthetical goes for the same reason: it is what pushed three of the
 *  registry's names onto a second line without saying which shelter.
 *
 *  Left alone when stripping would leave a fragment: some names carry the
 *  noun in the middle, and one or two are nothing else. */
export function shelterChipLabel(name: string): string {
  // Each strip is guarded on its own. Guarding them together meant a name
  // whose noun strip left a fragment got its operator back too, which is not
  // what either strip promises.
  const keep = (candidate: string, fallback: string) =>
    candidate.trim().length >= 3 ? candidate.trim() : fallback;
  const withoutOperator = keep(name.replace(SHELTER_TRAILING_PAREN, ""), name);
  return keep(withoutOperator.replace(SHELTER_NOUN, ""), withoutOperator);
}

// Both of these read as full phrases already ("Primeren za stanovanje"), so a
// chip needs no second wording the way the household questions do.
export function homeLabel(key: HomeKey, locale: Locale): string {
  return (
    FILTER_METADATA.home.find((option) => option.value === key)?.labels[
      locale
    ] ?? key
  );
}

export function careLabel(key: CareKey, locale: Locale): string {
  return (
    FILTER_METADATA.care.find((option) => option.value === key)?.labels[
      locale
    ] ?? key
  );
}

export function sizeLabel(size: AnimalSize, locale: Locale): string {
  return (
    FILTER_METADATA.size.find((option) => option.value === size)?.labels[
      locale
    ] ?? size
  );
}
