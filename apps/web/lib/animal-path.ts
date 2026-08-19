import type { Animal } from "@posvoji/schema";
import type { Locale } from "@/lib/i18n";

// One readable address per animal per language: its name, a short suffix cut
// from its id, the shelter's town, and the shelter itself. Those are the words
// people type into a search engine ("posvojitev pes ljubljana"), and the
// suffix is what keeps two animals called Luna apart.
const PREFIX: Record<Locale, string> = {
  sl: "/zival",
  en: "/en/animal",
};

// NFD splits c-caron into a c and a combining mark, and the mark is dropped
// on the next line. These letters carry no mark to split off, so they are
// spelled out here rather than lost with the rest of the punctuation.
const WHOLE_LETTERS: Record<string, string> = {
  đ: "d",
  ð: "d",
  ł: "l",
  ø: "o",
  ß: "ss",
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, (letter) => WHOLE_LETTERS[letter] ?? "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// FNV-1a over the animal's id ("muri:16836"), kept to its top 24 bits. The id
// holds for as long as the shelter keeps the listing up, so the address does
// too. Six hex digits stay short enough to read out while leaving a dataset of
// a few thousand animals room not to repeat one.
function idSuffix(id: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 8).toString(16).padStart(6, "0");
}

export type AnimalPathParts = {
  animal: string;
  city: string;
  shelter: string;
};

/** The three segments of an animal's address, and the route's own params. */
export function animalPathParts(animal: Animal): AnimalPathParts {
  const name = animal.name ? slugify(animal.name) : "";
  return {
    animal: `${name || animal.species}-${idSuffix(animal.id)}`,
    // A town or a shelter id that folds away to nothing would leave an empty
    // segment behind, and an empty segment is a different route.
    city: slugify(animal.shelter.city) || "slovenija",
    shelter: slugify(animal.shelter.id) || "zavetisce",
  };
}

/** The animal's own page: what a share hands over, in the reader's language. */
export function animalPath(animal: Animal, locale: Locale): string {
  const parts = animalPathParts(animal);
  return `${PREFIX[locale]}/${parts.animal}/${parts.city}/${parts.shelter}`;
}

const PATHNAME = new RegExp(
  `^(?:${Object.values(PREFIX).join("|")})/([^/]+)/([^/]+)/([^/]+)/?$`,
);

/**
 * The animal segment of a path written by animalPath. Only that segment names
 * the animal: the town and the shelter are there for the reader and for
 * search, and a shelter that moves town must not strand the links it already
 * handed out.
 */
export function animalSlugFromPath(pathname: string): string | null {
  const match = PATHNAME.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function findAnimalBySlug(
  animals: readonly Animal[],
  slug: string,
): Animal | undefined {
  return animals.find((animal) => animalPathParts(animal).animal === slug);
}
