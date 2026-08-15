import type { Animal, Sex, Species } from "@posvoji/schema";

const SPECIES: Record<Species, string> = {
  dog: "Pes",
  cat: "Mačka",
  rabbit: "Zajček",
  other: "Druga žival",
};

const SEX: Record<Sex, string> = {
  male: "samec",
  female: "samica",
  unknown: "",
};

// Slovenian has a dual, so 1, 2, 3-4 and 5+ each take a different form.
export function plural(n: number, forms: [string, string, string, string]): string {
  const rest = n % 100;
  if (rest === 1) return `${n} ${forms[0]}`;
  if (rest === 2) return `${n} ${forms[1]}`;
  if (rest === 3 || rest === 4) return `${n} ${forms[2]}`;
  return `${n} ${forms[3]}`;
}

// "1 mesec", "2 meseca", "3 mesece", "5 mesecev".
export const MONTH_FORMS: [string, string, string, string] = [
  "mesec",
  "meseca",
  "mesece",
  "mesecev",
];

// "1 leto", "2 leti", "3 leta", "5 let".
export const YEAR_FORMS: [string, string, string, string] = [
  "leto",
  "leti",
  "leta",
  "let",
];

function formatDuration(months: number): string {
  if (months < 12) return plural(months, MONTH_FORMS);
  return plural(Math.floor(months / 12), YEAR_FORMS);
}

// "1 žival", "2 živali", "5 živali" for result counts.
export const ANIMAL_FORMS: [string, string, string, string] = [
  "žival",
  "živali",
  "živali",
  "živali",
];

// "1 zavetišče", "2 zavetišči", "3 zavetišča", "5 zavetišč" for coverage.
export const SHELTER_FORMS: [string, string, string, string] = [
  "zavetišče",
  "zavetišči",
  "zavetišča",
  "zavetišč",
];

// "Mačka · samica · 2 leti", skipping whatever we don't know.
export function animalMeta(animal: Animal): string {
  return [
    SPECIES[animal.species],
    animal.sex ? SEX[animal.sex] : "",
    animal.approximateAgeMonths !== undefined
      ? formatDuration(animal.approximateAgeMonths)
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// Whole months: a wait this long doesn't get more useful by naming the day,
// and rounding down never overstates it.
export function waitingLabel(months: number): string {
  if (months < 1) return "čaka manj kot mesec";
  return `čaka ${formatDuration(months)}`;
}
