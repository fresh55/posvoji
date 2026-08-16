import type { Animal, Sex, Species } from "@posvoji/schema";
import type { Locale } from "@/lib/i18n";

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

function formatAge(months: number, locale: Locale): string {
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

// "Mačka · samica · 2 leti", skipping whatever we don't know.
export function animalMeta(animal: Animal, locale: Locale = "sl"): string {
  return [
    SPECIES[locale][animal.species],
    animal.sex ? SEX[locale][animal.sex] : "",
    animal.approximateAgeMonths !== undefined
      ? formatAge(animal.approximateAgeMonths, locale)
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
