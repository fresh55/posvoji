import type { Animal, Sex, Species } from "@posvoji/schema";

const SPECIES: Record<Species, string> = {
  dog: "Pes",
  cat: "Mačka",
  rabbit: "Kunec",
  other: "Druga žival",
};

const SEX: Record<Sex, string> = {
  male: "samec",
  female: "samica",
  unknown: "",
};

/** Slovenian has a dual, so 1/2/3-4/5+ each take a different form. */
function plural(n: number, forms: [string, string, string, string]): string {
  const rest = n % 100;
  if (rest === 1) return `${n} ${forms[0]}`;
  if (rest === 2) return `${n} ${forms[1]}`;
  if (rest === 3 || rest === 4) return `${n} ${forms[2]}`;
  return `${n} ${forms[3]}`;
}

export function formatAge(months: number): string {
  if (months < 12) return plural(months, ["mesec", "meseca", "mesece", "mesecev"]);
  return plural(Math.floor(months / 12), ["leto", "leti", "leta", "let"]);
}

export function speciesLabel(species: Species): string {
  return SPECIES[species];
}

/** "Mačka · samica · 2 leti" — only the parts we actually know. */
export function animalMeta(animal: Animal): string {
  return [
    SPECIES[animal.species],
    animal.sex ? SEX[animal.sex] : "",
    animal.approximateAgeMonths !== undefined
      ? formatAge(animal.approximateAgeMonths)
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
