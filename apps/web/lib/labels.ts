import type { LabelKey } from "@/lib/label-messages";
import type { AdoptionStatus, AnimalSize, Sex, Species } from "@posvoji/schema";
import { adoptableNow, stayStart, type AnimalFields } from "@/lib/animal";
import { namesSeveralAnimals } from "@/lib/animal-name";
import type { Locale } from "@/lib/i18n";
import { translateLabel as translate } from "@/lib/label-messages";
import {
  ageInMonths,
  FILTER_METADATA,
  type GoodWithKey,
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
// Exported because a second copy of this ladder in a component is a second
// place for it to be wrong.
export function pick(
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
  separator = " ",
): string {
  return `${n}${separator}${pick(n, forms)}`;
}

/**
 * "2 leti", "10 mesecev", "3 years".
 *
 * `separator` is what stands between the number and its unit. A parameter and
 * not a constant because one surface needs the two welded and the rest do not:
 * see NBSP and the card's age in animalMetaParts.
 */
export function formatAge(
  months: number,
  locale: Locale,
  separator = " ",
): string {
  if (locale === "en") {
    if (months < 12)
      return `${months}${separator}${months === 1 ? "month" : "months"}`;
    const years = Math.floor(months / 12);
    return `${years}${separator}${years === 1 ? "year" : "years"}`;
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
    return plural(months, ["mesec", "meseca", "meseci", "mesecev"], separator);
  }
  return plural(
    Math.floor(months / 12),
    ["leto", "leti", "leta", "let"],
    separator,
  );
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

// registerDateLabel moved to lib/date-label.ts, which imports nothing but the
// locale type. This file reaches the lib/filters barrel, and the footer needs
// the date on every page without the filter engine coming with it. Re-exported
// so the callers that already hold both are unchanged.
export { registerDateLabel } from "@/lib/date-label";

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

/** The same named selection on the map trigger, sidebar and phone filter row. */
export function shelterSelectionLabel(
  selected: ReadonlyArray<{ label: string }>,
  locale: Locale,
): string {
  if (selected.length === 0) return allShelters(locale);
  if (selected.length === 1) return selected[0].label;
  return `${locale === "en" ? "Selected" : "Izbrano"}: ${selected.length}`;
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

// What the next press on an armed region will do, said before it does it.
//
// On a pointer that cannot hover the first tap names a region and the second
// commits every shelter in it, and a name and two counts do not say what the
// second tap is about to take. "Osrednjeslovenska · 4 zavetišča · 31 živali"
// reads as a description of the shape; the visitor still has to guess that
// pressing it again picks all four. This is the sentence that stops the guess,
// and the callout and the region's own aria-label both carry it, so the eye
// and the screen reader are told the same thing.
//
// Both directions, because the commit is a toggle: a region whose shelters are
// all picked already is dropped by that second tap, and a callout promising to
// select them would be describing the opposite of what happens.
//
// shelterCount serves both verbs with no second set of forms. It returns the
// nominative, and the accusative "izbere"/"odstrani" put their object in is
// identical for a neuter noun in every form the ladder has: zavetišče,
// zavetišči, zavetišča, zavetišč.
export function regionCommitNote(
  n: number,
  dropping: boolean,
  locale: Locale,
): string {
  if (locale === "en") {
    return `${dropping ? "Removes" : "Selects"} ${shelterCount(n, locale)}`;
  }
  return `${dropping ? "Odstrani" : "Izbere"} ${shelterCount(n, locale)}`;
}

// An age of zero months is a number nobody says out loud. That phrase carries
// no numeral, so it ignores the separator and stays free to wrap.
export function ageLabel(
  months: number,
  locale: Locale,
  separator = " ",
): string {
  if (months === 0) return translate(locale, "lessThanMonth");
  return formatAge(months, locale, separator);
}

export function speciesLabel(species: Species, locale: Locale): string {
  return SPECIES[locale][species];
}

// What a species tab is called when it stands alone as the scope of a list:
// the species strip's own word where one is enough, and the noun phrase where
// the tab's word is not ("Ostale" is not a sentence on its own). The filter
// sheet's scope pill and the location picker's summary both say it, so it is
// written once here.
const SPECIES_SCOPE: Record<Locale, Record<SpeciesFilter, string>> = {
  sl: { all: "Vse živali", dog: "Psi", cat: "Mačke", other: "Ostale živali" },
  en: { all: "All animals", dog: "Dogs", cat: "Cats", other: "Other animals" },
};

export function speciesScopeLabel(
  species: SpeciesFilter,
  locale: Locale,
): string {
  return SPECIES_SCOPE[locale][species];
}

// The tab's animals counted in the two cases the grid's band of unanswered
// animals puts them in (components/unanswered-band.tsx): after "pri", the
// locative, whose dual and plural are one form, and after "Pokaži", the
// accusative, which takes the genitive plural from five up.
const TAB_AT: Record<SpeciesFilter, [string, string, string, string]> = {
  all: ["živali", "živalih", "živalih", "živalih"],
  dog: ["psu", "psih", "psih", "psih"],
  cat: ["mački", "mačkah", "mačkah", "mačkah"],
  other: ["drugi živali", "drugih živalih", "drugih živalih", "drugih živalih"],
};

const TAB_SHOWN: Record<SpeciesFilter, [string, string, string, string]> = {
  all: ["žival", "živali", "živali", "živali"],
  dog: ["psa", "psa", "pse", "psov"],
  cat: ["mačko", "mački", "mačke", "mačk"],
  other: ["drugo žival", "drugi živali", "druge živali", "drugih živali"],
};

const TAB_NOUN_EN: Record<SpeciesFilter, [string, string]> = {
  all: ["animal", "animals"],
  dog: ["dog", "dogs"],
  cat: ["cat", "cats"],
  other: ["other animal", "other animals"],
};

function tabCountEn(n: number, species: SpeciesFilter): string {
  return `${n} ${TAB_NOUN_EN[species][n === 1 ? 0 : 1]}`;
}

/** "pri 121 psih", "pri 1 mački": the count after "pri". */
export function tabCountAt(
  n: number,
  species: SpeciesFilter,
  locale: Locale,
): string {
  return locale === "sl" ? plural(n, TAB_AT[species]) : tabCountEn(n, species);
}

/** "Pokaži 119 psov", "Pokaži 2 mački": the count after "Pokaži". */
export function tabCountShown(
  n: number,
  species: SpeciesFilter,
  locale: Locale,
): string {
  return locale === "sl"
    ? plural(n, TAB_SHOWN[species])
    : tabCountEn(n, species);
}

/** The same animals as the object of "Pokaži": ga or jo, ju, jih. By the
 *  number itself rather than the numeral's form, since the pronoun stands for
 *  the animals and not for the word: 101 dogs are "jih", though the numeral
 *  takes the singular ("pri 101 psu"). Pes is masculine; mačka and žival,
 *  which the other tabs count in, are feminine. */
export function tabPronoun(
  n: number,
  species: SpeciesFilter,
  locale: Locale,
): string {
  if (locale === "en") return n === 1 ? "it" : "them";
  if (n === 1) return species === "dog" ? "ga" : "jo";
  return n === 2 ? "ju" : "jih";
}

/** The line under an animal's name: the species, then the breed where the
 *  shelter gave one. The dialog and the animal's own page both print it, and
 *  they used to answer differently: the dialog as this sentence, the page as
 *  a filled pill above a row of outlined ones. One helper, so the same fact
 *  is drawn one way wherever a name has a line under it.
 *
 *  Slovenian writes breed names lowercase, and the providers deliver them in
 *  every casing. English keeps the casing it was given. */
export function animalSubtitle(
  animal: { species: Species; breed?: string | null },
  locale: Locale,
): string {
  const breed =
    animal.breed && locale === "sl"
      ? animal.breed.toLocaleLowerCase("sl")
      : animal.breed;
  return [speciesLabel(animal.species, locale), breed]
    .filter(Boolean)
    .join(META_SEPARATOR);
}

/** The separator between the meta line's facts. Exported because the card
 *  draws the parts itself to dim these, and a private literal split back out
 *  of the joined string in another file is a contract nothing enforces. */
export const META_SEPARATOR = " · ";

/** How a separating middot is drawn wherever one appears between facts, so
 *  they read as words rather than as one string. Shared so the card's meta
 *  line and the shelter header's do not drift apart.
 *
 *  Muted at full strength. It was half, which measures 2.08:1 in light mode
 *  and 2.68:1 in dark, and this is text inside the paragraph rather than an
 *  aria-hidden ornament: a text pair that far under AA, at 12px, reads as a
 *  rendering fault and not as a quiet separator. Full muted is 5.54:1 and
 *  7.64:1, and it still recedes, because what recedes it is the step down
 *  from the facts either side of it: the card draws those in ink at 19.76:1,
 *  and a middot is a smaller glyph than the words it stands between. The
 *  shelter header's line is muted throughout, so there the middot stops being
 *  lighter than its neighbours, which is intended: one separator, drawn one
 *  way. */
export const META_DOT_CLASS = "text-muted-foreground";

/** How many facts the line may carry. Two is what the card's width buys on a
 *  phone: measured at 375px, a third fact wrapped onto a second line on most
 *  cards, which makes every card in that grid row taller. */
const META_PART_LIMIT = 2;

// Welds a number to its unit. Only the card's age asks for it, and only
// because its column is 164px wide on a phone.
const NBSP = "\u00a0";

/** The card's fact line, as its parts: "Mačka · starost 2 leti", skipping
 *  whatever we don't know. The card maps over these so it can style the
 *  separators without splitting a joined string back apart.
 *
 *  At most two facts, taken from a ranked list: the first two we know. An
 *  empty slot falls through to the next fact rather than leaving the line
 *  short, because a card whose age is missing used to read "Mačka" alone,
 *  which looks like something failed to load rather than like a fact we do
 *  not have.
 *
 *  `species` is the grid's active tab, and it decides where the ranking
 *  starts. When the tab names one species the word comes off the front,
 *  because the tab already said it and "Mačka" is nearly twice the width of
 *  "Pes", which is why the wrapping read as a cat problem. The merged Ostale
 *  tab holds rabbits and whatever else, so there the line still has to say
 *  which animal this is.
 *
 *  The order after that is how much each fact moves a decision. Age first.
 *  Then size: it is on 44% of dogs and 16% of cats, which is thin, but it is a
 *  thing people decide on. Then sex, which is the one here that does not
 *  change what a visitor taps next, so it only appears when nothing above it
 *  is known. Size is lowercased, because in a middot list of lowercase
 *  attributes "Srednja" reads as the start of a new sentence.
 *
 *  Which means the slots are not positional: one card can read "3 leta ·
 *  velika" beside another reading "velika · samica", and neither is wrong.
 *  That is the trade for a line that never stands short, and it is deliberate,
 *  not something to tidy back into fixed slots.
 *
 *  Sex stays a filter, a fact on the animal's own page, and a word in the link
 *  preview's sentence, which composes its own list for that reason
 *  (animal-share.ts). */
export function animalMetaParts(
  animal: AnimalFields,
  locale: Locale = "sl",
  now: Date = new Date(),
  species: SpeciesFilter = "all",
): string[] {
  const facts: string[] = [];
  // The species word, unless the tab the card is under has already said it.
  if (species !== "dog" && species !== "cat") {
    facts.push(speciesLabel(animal.species, locale));
  }
  // A listing covering several animals takes the one fact true of all of them
  // and stops, rather than falling through to the next single-animal one the
  // way a missing fact does. animal-facts.tsx argues the withholding; what is
  // decided here is that the card, having no description under it to answer
  // instead, says so in words.
  if (namesSeveralAnimals(animal.name)) {
    facts.push(translate(locale, "cardSeveralAnimals"));
    return facts;
  }
  const months = ageInMonths(animal, now);
  // Named, not bare. The grid's default order is the longest wait first, and
  // the wait mark stays off under that very sort, so "5 mesecev" alone read as
  // five months in the shelter with nothing on the card to say otherwise. The
  // animal's own page names the same number "Starost: 5 mesecev".
  //
  // NBSP because with the word in front the line no longer fits a 375px
  // card's 164px column, and the free wrap broke it after "starost 10" and
  // left "mesecev" below. Welding the number to its unit moved the break to
  // after "starost", which left the word alone at the end of the line with
  // its value under it. The cardAge message welds the word to the value too,
  // so the whole fact moves down as one piece and the line breaks at the
  // middot before it.
  if (months !== undefined) {
    const age = ageLabel(months, locale, NBSP);
    facts.push(translate(locale, "cardAge", { age }));
  }
  // Everything below is built only where the line still has room for it. This
  // runs for every card in a grid of sixty, and on the Vse tab the species and
  // the age already fill the line for all but a handful of animals, so the
  // labels below would be built and thrown away.
  if (facts.length < META_PART_LIMIT && animal.size) {
    facts.push(sizeLabel(animal.size, locale).toLocaleLowerCase(locale));
  }
  if (facts.length < META_PART_LIMIT) {
    const sex = sexFact(animal, locale);
    if (sex) facts.push(sex);
  }
  // Never longer than the limit. Three pushes above are unguarded: the species
  // word, the age, and the several-animals fact, and that last one returns
  // where it stands rather than falling through to the guarded pair.
  return facts;
}

// Whole months since intake, same arithmetic as ageInMonths in filters.ts but
// for a raw ISO date string rather than an Animal. Both sides are read in UTC,
// because a date-only string parses as UTC midnight and reading it locally
// moves it into the previous month west of Greenwich. An unparsable date, or
// one after the reference, means we can't say, not "0".
export function monthsInShelter(
  intakeDate: string,
  now: Date,
): number | undefined {
  const intake = new Date(intakeDate);
  if (Number.isNaN(intake.getTime())) return undefined;
  // A date after the reference is a typo in a listing, not a stay. The month
  // arithmetic below rounds a date later this month down to zero and would
  // print "manj kot mesec" for an animal that by the record has not arrived.
  // This also subsumes a negative span: once the instant is not in the future,
  // the UTC year-and-month ordering cannot run backwards either.
  if (intake.getTime() > now.getTime()) return undefined;
  return (
    (now.getUTCFullYear() - intake.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - intake.getUTCMonth())
  );
}

// Long stays are the norm in Slovenian shelters: at twelve months the mark
// would show on nearly half the animals and mean nothing. Three years keeps
// it to roughly one in five. The card and the dialog read this one constant,
// so they cannot disagree about who counts as waiting long.
export const LONG_STAY_MONTHS = 36;

/** The wait in whole months, and whether it is a floor: read from intakeBy,
 *  the latest day the shelter's words allow, so the real wait may be longer. */
export type Stay = { months: number; floor: boolean };

/** This animal's wait from stayStart's date, or undefined where there is none
 *  to read. */
export function stayOf(animal: AnimalFields, now: Date): Stay | undefined {
  const start = stayStart(animal);
  if (!start) return undefined;
  const months = monthsInShelter(start.date, now);
  if (months === undefined) return undefined;
  if (!start.floor) return { months, floor: false };
  // monthsInShelter counts calendar months and ignores the day, which a
  // floor cannot afford: from 2023-09-30 it says 36 on 2026-09-25, and "vsaj
  // 3 leta" would be five days early. A month counts once the day after its
  // anniversary has come, as waitingFrom in the filter reads it; a floor is
  // always a month's last day, so the anniversary day is at most that one.
  const whole = now.getUTCDate() <= Number(start.date.slice(8, 10)) ? months - 1 : months;
  // "At least less than a month" says nothing.
  return whole > 0 ? { months: whole, floor: true } : undefined;
}

// A floor, said the way each language says it: Slovenian in a word, English
// on the number. "Waiting at least 4 years" also overran the card's mark in a
// 320px column, where "Waiting 4+ years" fits.
const FLOOR_DURATION: Record<Locale, (months: number) => string> = {
  sl: (months) => `vsaj ${ageLabel(months, "sl")}`,
  en: (months) => ageLabel(months, "en", "+ "),
};

/** "3 leta", or "vsaj 3 leta" where the wait is a floor. Every sentence the
 *  duration goes into reads either way. */
export function stayDuration(stay: Stay, locale: Locale): string {
  return stay.floor
    ? FLOOR_DURATION[locale](stay.months)
    : ageLabel(stay.months, locale);
}

// The wait of an animal that has waited long and is actually up for
// adoption, or undefined.
export function longStay(animal: AnimalFields, now: Date): Stay | undefined {
  // Reserved and held animals are not waiting for this visitor's decision.
  if (!adoptableNow(animal.status)) return undefined;
  const stay = stayOf(animal, now);
  if (!stay || stay.months < LONG_STAY_MONTHS) return undefined;
  return stay;
}

/** How loudly a surface states the wait: a plain fact, or the plea. */
export type StayTone = "quiet" | "plea";

/**
 * What this animal's wait says and how loudly, or nothing at all.
 *
 * One owner for a decision three surfaces used to make for themselves: the
 * dialog's shelter box, the poster's tile and the poster's plea line each
 * re-derived which statuses have a stay to state, where the three-year line
 * falls and which of the four plea sentences to use. They had already drifted
 * apart once, so the rule lives here and a surface only dresses the answer.
 *
 * The date is parsed once, which is why this does not call longStay.
 */
export function stayStatement(
  animal: AnimalFields,
  locale: Locale,
  now: Date,
): { tone: StayTone; text: string } | undefined {
  // An adopted animal has left, so its stay is history and says nothing.
  if (animal.status === "adopted") return undefined;
  const stay = stayOf(animal, now);
  if (!stay) return undefined;
  const { months } = stay;
  const duration = stayDuration(stay, locale);

  if (months < LONG_STAY_MONTHS || !adoptableNow(animal.status)) {
    return { tone: "quiet", text: translate(locale, "factStayValue", { duration }) };
  }

  // An animal that came in before its first birthday prints the same number
  // twice: the age fact says "Starost: 4 leta" and the plea says it waited 4
  // leta. That is 56 of the 96 long-stay animals whose age we know. Both
  // numbers now name themselves, so the repeat no longer reads as a bug; the
  // tail stays because it says something true about a life that the two
  // numbers only imply. The gate is the arrival age, not a birth in the
  // shelter, which is why the sentence says "skoraj". Without a known age
  // there is no repeated number to explain and the plainer sentence is the
  // honest one.
  const ageMonths = ageInMonths(animal, now);
  const wholeLife = ageMonths !== undefined && ageMonths - months < 12;
  const key = animal.name
    ? wholeLife
      ? "longStayWholeLife"
      : "longStay"
    : wholeLife
      ? "longStayWholeLifeUnnamed"
      : "longStayUnnamed";
  return {
    tone: "plea",
    text: translate(locale, key, { name: animal.name ?? "", duration }),
  };
}

const STATUS_KEYS: Record<
  Exclude<AdoptionStatus, "unknown">,
  LabelKey
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

/** The animal's sex as a fact for a middot list, or nothing where it is not a
 *  fact we have. sexLabel hands back the filter option's capitalised label and
 *  a list of lowercase attributes wants it lowercase, and the unknown case has
 *  to be taken off before sexLabel will accept it at all.
 *
 *  Shared with the link preview's sentence (animal-share.ts), which composes a
 *  different list out of the same words. The lists stay apart on purpose; this
 *  is only the one word both of them spell the same way. */
export function sexFact(
  animal: Pick<AnimalFields, "sex">,
  locale: Locale,
): string | undefined {
  if (!animal.sex || animal.sex === "unknown") return undefined;
  return sexLabel(animal.sex, locale).toLocaleLowerCase(locale);
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
const GOOD_WITH_CHIP_KEYS: Record<GoodWithKey, LabelKey> = {
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
//
// In front, only when a capitalised word follows: "Zavetišče Ljubljana" is
// the noun and a name, and the name stands alone. "Zavetišče za zapuščene
// živali Gorenjske" is a phrase the noun heads, and without it the line would
// read "za zapuščene živali Gorenjske", a fragment. None of the eleven live
// names is shaped that way; the municipal shelters that are tend to be.
// Spelled with both cases rather than the i flag, which would fold the
// lookahead's uppercase class too.
const SHELTER_NOUN = /^[Zz]avetišče\s+(?=\p{Lu})|\s*[—–-]\s*[Zz]avetišče$/u;

// Any trailing parenthetical. In this registry every one of them names the
// operator rather than the shelter: "(Marjetica Koper)" is the municipal
// company behind "Obalno zavetišče". A chip or a card footer identifies, it
// does not attribute, and the operator is on the shelter's own page one press
// away. Named for what it matches and not for what it means, because the
// pattern cannot tell an operator from a future name that disambiguates two
// shelters in brackets; if one ever appears, this is the line that has to
// learn the difference.
const SHELTER_TRAILING_PAREN = /\s*\([^()]*\)\s*$/u;

/** A shelter's name without its trailing operator parenthetical: "Obalno
 *  zavetišče (Marjetica Koper)" wrapped to two lines in the picker, and the
 *  bracket names the company behind the shelter rather than the shelter. Left
 *  alone when stripping would leave a fragment. The first half of
 *  shelterChipLabel, which is what the picker rows print. */
export function shelterListLabel(name: string): string {
  const stripped = name.replace(SHELTER_TRAILING_PAREN, "").trim();
  return stripped.length >= 3 ? stripped : name;
}

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
  const withoutOperator = shelterListLabel(name);
  return keep(withoutOperator.replace(SHELTER_NOUN, ""), withoutOperator);
}

/** Orders shelters by the name a picker row prints (shelterChipLabel), so
 *  every list of them in the picker reads in one order: by the full name,
 *  seven of eleven stood under Z, sorted by a word the row no longer shows. */
export function byShelterName(a: { label: string }, b: { label: string }): number {
  return shelterChipLabel(a.label).localeCompare(shelterChipLabel(b.label), "sl");
}

export function sizeLabel(size: AnimalSize, locale: Locale): string {
  return (
    FILTER_METADATA.size.find((option) => option.value === size)?.labels[
      locale
    ] ?? size
  );
}

/** A facet count, explicitly distinguished from the shelter’s full roster. */
export function filteredAnimalCount(n: number, locale: Locale): string {
  return n > 0
    ? animalCount(n, locale)
    : `${animalCount(n, locale)} ${locale === "sl" ? "s temi filtri" : "with these filters"}`;
}
