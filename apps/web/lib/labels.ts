import type { Animal, AdoptionStatus, AnimalSize, Sex, Species } from "@posvoji/schema";
import type { Locale, TranslationKey } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import { ageInMonths, FILTER_METADATA } from "@/lib/filters";

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

const SEX: Record<Locale, Record<Sex, string>> = {
  sl: { male: "samec", female: "samica", unknown: "" },
  en: { male: "male", female: "female", unknown: "" },
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
    return plural(months, ["mesec", "meseca", "mesece", "mesecev"]);
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

export function allShelters(n: number, locale: Locale): string {
  if (locale === "en") return `All ${shelterCount(n, locale)}`;
  if (n === 1) return "Edino zavetišče";
  if (n === 2) return "Obe zavetišči";
  if (n === 3 || n === 4) return `Vsa ${n} zavetišča`;
  return `Vseh ${n} zavetišč`;
}

export function sheltersMissingFromMap(n: number, locale: Locale): string {
  if (locale === "en") {
    return `${shelterCount(n, locale)} ${n === 1 ? "is" : "are"} not on the map.`;
  }
  const verb = pick(n, ["ni", "nista", "niso", "ni"]);
  return `${shelterCount(n, locale)} ${verb} na zemljevidu.`;
}

// An age of zero months is a number nobody says out loud.
export function ageLabel(months: number, locale: Locale): string {
  if (months === 0) return translate(locale, "lessThanMonth");
  return formatAge(months, locale);
}

// "Mačka · samica · 2 leti", skipping whatever we don't know.
export function animalMeta(
  animal: Animal,
  locale: Locale = "sl",
  now: Date = new Date(),
): string {
  const months = ageInMonths(animal, now);
  return [
    SPECIES[locale][animal.species],
    animal.sex ? SEX[locale][animal.sex] : "",
    months !== undefined ? ageLabel(months, locale) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// Whole months since intake, same arithmetic as ageInMonths in filters.ts but
// for a raw ISO date string rather than an Animal. Both sides are read in UTC,
// because a date-only string parses as UTC midnight and reading it locally
// moves it into the previous month west of Greenwich. A negative span (future
// date) or an unparsable one means we can't say, not "0".
export function timeInShelter(
  intakeDate: string,
  locale: Locale,
  now: Date,
): string | undefined {
  const intake = new Date(intakeDate);
  if (Number.isNaN(intake.getTime())) return undefined;
  const months =
    (now.getUTCFullYear() - intake.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - intake.getUTCMonth());
  if (months < 0) return undefined;
  return ageLabel(months, locale);
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

export function sizeLabel(size: AnimalSize, locale: Locale): string {
  return (
    FILTER_METADATA.size.find((option) => option.value === size)?.labels[
      locale
    ] ?? size
  );
}
