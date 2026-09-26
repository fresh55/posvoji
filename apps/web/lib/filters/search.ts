import type { AnimalFields } from "@/lib/animal";

// Finding an animal by the words a visitor arrives with. Someone who comes
// from a shelter's post, a friend's message or a poster has a name, and the
// panel had no way to ask for one. The same field answers a breed or a word
// from the shelter's description ("ovčar", "mirna") where the structured
// fields are empty: on the 25 Sep dataset 46 of 491 animals carry a breed and
// 462 a description.
//
// Every word of the query has to begin a word of the animal's name, breed or
// description. Begin and not contain: "ana" is inside six names on that
// dataset (Marjana, Hana, Romana ...) and begins one.

/** The longest query the address carries, in characters. A name is a word or
 *  two, and the cap bounds what a hand-written link can make every animal be
 *  tested against. */
export const MAX_QUERY_LENGTH = 60;

/** The query as the address holds it: trimmed, every run of whitespace one
 *  space, and cut at MAX_QUERY_LENGTH characters. Cut by code point, so an
 *  emoji at the edge is dropped whole rather than halved. */
export function tidyQuery(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const characters = Array.from(collapsed);
  if (characters.length <= MAX_QUERY_LENGTH) return collapsed;
  return characters.slice(0, MAX_QUERY_LENGTH).join("").trimEnd();
}

/** Text as both sides are compared: accents off, lowercase. NFD splits č š ž
 *  ć into a letter and a combining mark and the mark goes; đ has no
 *  decomposition, so it is named. "Ovčar", "ovcar" and "OVČAR" are one word. */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The folded words of a text: runs of letters and digits, so "Žan-Žak" is
 *  two words and "N. ovčarka / mešanka" three. */
export function searchWords(text: string): string[] {
  return foldText(text).match(WORD) ?? [];
}

const NO_WORDS: readonly string[] = [];

/** One text's words, unique and sorted, which is what hasPrefix searches. */
function wordList(text: string | undefined): readonly string[] {
  if (!text) return NO_WORDS;
  return [...new Set(searchWords(text))].sort();
}

/** Whether a word of the sorted list begins with the prefix. Every word that
 *  does sits in one run starting at the first word not below the prefix, so
 *  a binary search for that word answers it. */
function hasPrefix(words: readonly string[], prefix: string): boolean {
  let low = 0;
  let high = words.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (words[middle] < prefix) low = middle + 1;
    else high = middle;
  }
  return low < words.length && words[low].startsWith(prefix);
}

/** The descriptions a page loads after the grid (lib/animal-descriptions.ts),
 *  by animal id. */
export type DescriptionsById = Readonly<
  Record<string, { readonly description?: string } | undefined>
>;

/** Where a query found an animal, best first. A visitor typing a name wants
 *  that animal before every other that mentions it. */
export type SearchTier = "name" | "breed" | "description";

const TIER_ORDER: readonly SearchTier[] = ["name", "breed", "description"];

/** The words of the fields every animal carries with it, read once per list:
 *  the list is a prop that changes only with the dataset, so this is built
 *  once per page. Held weakly, like the filter index (lib/filters/engine.ts). */
type OwnWords = {
  readonly name: readonly (readonly string[])[];
  readonly breed: readonly (readonly string[])[];
  /** A description the animal carries itself. The grid's animals carry none,
   *  since the client payload leaves descriptions to the deferred file, but
   *  an animal from the dataset does. */
  readonly description: readonly (readonly string[])[];
};

const ownWords = new WeakMap<readonly AnimalFields[], OwnWords>();

function ownWordsOf(animals: readonly AnimalFields[]): OwnWords {
  const cached = ownWords.get(animals);
  if (cached) return cached;
  const built: OwnWords = {
    name: animals.map((animal) => wordList(animal.name)),
    breed: animals.map((animal) => wordList(animal.breed)),
    description: animals.map((animal) => wordList(animal.shortDescription)),
  };
  ownWords.set(animals, built);
  return built;
}

// The loaded descriptions' words, once per load. The file arrives once per
// page, so this is built the first time a query meets it and read from then
// on; 462 descriptions come to about 9ms on a desktop, which is not a cost to
// pay per keystroke.
const loadedWords = new WeakMap<DescriptionsById, Map<string, readonly string[]>>();

function loadedWordsOf(
  descriptions: DescriptionsById,
): Map<string, readonly string[]> {
  const cached = loadedWords.get(descriptions);
  if (cached) return cached;
  const built = new Map<string, readonly string[]>();
  for (const [id, detail] of Object.entries(descriptions)) {
    const words = wordList(detail?.description);
    if (words.length > 0) built.set(id, words);
  }
  loadedWords.set(descriptions, built);
  return built;
}

export type AnimalSearch<T> = {
  /** The animals the query finds, in the order they were given. The list
   *  itself, the same array, when there is nothing to search for. */
  readonly found: T[];
  /** Where the query found each animal, by id. Empty without a query. */
  readonly tiers: ReadonlyMap<string, SearchTier>;
};

const NO_TIERS: ReadonlyMap<string, SearchTier> = new Map();

/**
 * The animals whose name, breed or description holds every word of the
 * query, each word as the start of one of theirs.
 *
 * `descriptions` is the deferred file, absent until it has loaded: until then
 * an animal is searched by what it carries itself, and the search is simply
 * asked again once the file is in.
 */
export function searchAnimals<T extends AnimalFields>(
  animals: T[],
  query: string,
  descriptions?: DescriptionsById,
): AnimalSearch<T> {
  const wanted = [...new Set(searchWords(query))];
  // Nothing but punctuation asks nothing, like an empty field.
  if (wanted.length === 0) return { found: animals, tiers: NO_TIERS };
  const own = ownWordsOf(animals);
  const loaded = descriptions ? loadedWordsOf(descriptions) : undefined;
  const found: T[] = [];
  const tiers = new Map<string, SearchTier>();
  animals.forEach((animal, slot) => {
    const fields = [
      own.name[slot],
      own.breed[slot],
      loaded?.get(animal.id) ?? own.description[slot],
    ];
    let best = TIER_ORDER.length;
    for (const word of wanted) {
      const at = fields.findIndex((words) => hasPrefix(words, word));
      if (at === -1) return;
      best = Math.min(best, at);
    }
    found.push(animal);
    tiers.set(animal.id, TIER_ORDER[best]);
  });
  return { found, tiers };
}

/**
 * The list in the order a search reads it: the animals it found by name
 * first, then by breed, then by description alone, each run in the order it
 * was given. That order is the sort the visitor chose, so within a tier it
 * holds.
 *
 * An animal that is found by name is found by name whatever else the query
 * asked of it: "taras miren" puts Taras first although "miren" is only in
 * his description.
 */
export function rankBySearch<T extends AnimalFields>(
  sorted: T[],
  tiers: ReadonlyMap<string, SearchTier>,
): T[] {
  if (tiers.size === 0) return sorted;
  const runs: T[][] = TIER_ORDER.map(() => []);
  for (const animal of sorted) {
    const tier = tiers.get(animal.id);
    runs[tier === undefined ? runs.length - 1 : TIER_ORDER.indexOf(tier)].push(
      animal,
    );
  }
  return runs.flat();
}
