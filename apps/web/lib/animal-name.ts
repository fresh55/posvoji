// A letter of any alphabet, which is what decides whether a string has a case
// to read at all. A name of digits and punctuation has none, and comparing it
// against its own upper case would call it shouting.
const LETTER = /\p{L}/u;

// One word, for the purpose of a capital: a letter and the letters and
// combining marks after it. The hyphen and the apostrophe are left out
// deliberately, so "ANA-MARIJA" comes back as "Ana-Marija" rather than
// "Ana-marija", and a comma list keeps a capital on every animal in it.
const WORD = /(\p{L})([\p{L}\p{M}]*)/gu;

/**
 * An animal's name as a surface prints it.
 *
 * Two shelters type their listings in block capitals, and the dataset records
 * what the shelter wrote: 29 of 486 names arrived as KIKI, ROCKY, ČARLI,
 * "DISEL, LYANN, LUNA". On a card among four hundred ordinary names that is
 * not emphasis, it is a different shelter's data entry habit showing through,
 * and a screen reader may spell a fully capitalised word out letter by letter.
 *
 * Only a name that is upper case from end to end is touched. That is the one
 * case where nothing can be lost: a name with any lower-case letter in it is
 * the shelter's own spelling and is left exactly as it came, whether that is
 * "Tom in Lady", "Peter Zajec" or "McFly". Letters alone decide, so digits and
 * punctuation neither make a name shout nor stop it shouting.
 *
 * Display only. The dataset file is not rewritten, and nothing addressable is
 * derived from this: slugify lower-cases and strips marks before it builds a
 * path, so /zival/carli-bfae50 is the same address whichever case the name is
 * held in (lib/animal-path.ts).
 *
 * Applied where the dataset is read (loadDataset in lib/dataset.ts), so every
 * surface prints one spelling: the card, the dialog, the page heading and its
 * title, the og:title, the poster, the breadcrumb, the share text.
 */
export function displayName(name: string): string {
  if (!LETTER.test(name)) return name;
  if (name !== name.toLocaleUpperCase("sl")) return name;
  // The first letter is already the capital this wants, the whole name being
  // upper case; a capture rather than a slice so a letter outside the basic
  // plane is not cut in half.
  return name.replace(
    WORD,
    (_word, first: string, rest: string) =>
      first + rest.toLocaleLowerCase("sl"),
  );
}

// Seven listings in the dataset cover more than one animal, and they arrive
// spelled two ways: as a list of names ("Bria in Brin", "TOM in LADY",
// "DISEL, LYANN, LUNA") and, once, as a collective ("Božanska družina", a
// mother and her two sons). Either way one age, one sex and one size describe
// only one of them, so a row of facts states something untrue: 7, 12 and 12
// years stood under a single "7 let" pill, and a family under "Samec".
//
// Both tests are deliberately narrow. Every part of a list has to be a single
// capitalised name, which leaves "Peter Zajec" and "brezrepa tritačka Luna"
// the one animal each of them is; the collective is one morpheme rather than a
// vocabulary, and it is the only name in 488 carrying it.
const NAME_LIST = /\s*,\s*|\s+in\s+/;
const ONE_NAME = /^\p{Lu}[\p{L}'’-]*\.?$/u;
const COLLECTIVE_NAME = /družin/i;

/**
 * Whether a listing's name covers several animals.
 *
 * Only ever used to withhold a claim, never to make one, which is what keeps a
 * heuristic over the shelter's own spelling honest: the worst a false positive
 * costs is a fact left to the description, and the description is where a
 * listing like this says it properly anyway.
 */
export function namesSeveralAnimals(name: string | null | undefined): boolean {
  if (!name) return false;
  const parts = name.trim().split(NAME_LIST);
  return (
    COLLECTIVE_NAME.test(name) ||
    (parts.length > 1 && parts.every((part) => ONE_NAME.test(part)))
  );
}
