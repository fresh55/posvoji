// The words a shelter's name opens with that name the kind of place rather
// than the place. Six of the seventeen shelters in the register have no logo,
// and the first letter of the full name printed four Z plates (Zavetišče ...)
// and two V (Veterina ...) down one grid: a monogram that is the same monogram
// for four entries identifies none of them.
//
// Matched against the fold below, so one entry covers both the diacritic and
// the ASCII spelling a source sometimes sends ("zavetisce" as well as
// "zavetišče"). English is here because the register is Slovenian but the site
// is not, and a name arriving in English should get the same treatment.
//
// "Obalno" is deliberately absent. It is an adjective that names one coast
// rather than a kind of institution, so "Obalno zavetišče (Marjetica Koper)"
// keeps its O.
const GENERIC_WORDS = new Set([
  "zavetisce",
  "zavetisca",
  "zavod",
  "veterina",
  "veterinarska",
  "veterinarski",
  "bolnica",
  "ambulanta",
  "za",
  "zapuscene",
  "zapuscena",
  "zivali",
  "animal",
  "animals",
  "shelter",
  "veterinary",
  "clinic",
  "hospital",
  "for",
  "the",
]);

/** Diacritics off and lowercased, for matching only. The letter this module
 *  returns is always cut from the name as written, so a shelter whose first
 *  distinctive word is "Črnomelj" gets Č and not C. */
function fold(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Punctuation carries no letter and cannot be a monogram, so it comes off both
// ends before a word is judged or read. It is what lets "(Veterina" match the
// generic list and what keeps a bracket out of the plate.
function letters(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * The letter a shelter without a logo is drawn with.
 *
 * The first character of the first word that is not one of the generic words
 * above, so "Veterinarska bolnica Brežice - zavetišče" is B and "Zavetišče
 * Johanca (Veterina Tolmin)" is J. The register's six logo-less shelters draw
 * five letters between them rather than two, and the pair that still collides
 * (Sia, Sevnica) collides on its own name.
 *
 * Only leading generic words are dropped, and the scan stops at the first word
 * it keeps: a shelter named after the word alone still gets a letter, because
 * a name that strips down to nothing falls back to its own first character.
 */
export function shelterInitial(name: string): string {
  for (const word of name.split(/\s+/)) {
    const letter = letters(word);
    if (letter.length === 0) continue;
    if (GENERIC_WORDS.has(fold(letter))) continue;
    return letter.slice(0, 1).toUpperCase();
  }
  const fallback = letters(name) || name;
  return fallback.slice(0, 1).toUpperCase();
}
