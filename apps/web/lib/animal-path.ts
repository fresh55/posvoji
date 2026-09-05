import type { AnimalFields } from "@/lib/animal";
import type { Locale } from "@/lib/i18n";
import { decodeOrRaw } from "@/lib/location-search";

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
export function animalPathParts(animal: AnimalFields): AnimalPathParts {
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
export function animalPath(animal: AnimalFields, locale: Locale): string {
  const parts = animalPathParts(animal);
  return `${PREFIX[locale]}/${parts.animal}/${parts.city}/${parts.shelter}`;
}

// The printable sheet's own segment, hung off the animal's address. A page
// and not a query, because a static export builds pages: a print stylesheet
// that switched itself on for ?plakat would still have to ship inside the
// animal page, and the sheet is a different document from the one a visitor
// browses. It is named in the reader's language for the same reason the rest
// of the path is.
const POSTER_SEGMENT: Record<Locale, string> = {
  sl: "plakat",
  en: "poster",
};

/** The animal's A4 sheet, one segment past its own page. */
export function posterPath(animal: AnimalFields, locale: Locale): string {
  return `${animalPath(animal, locale)}/${POSTER_SEGMENT[locale]}`;
}

// Three segments and no more, so a poster's address is not read as an
// animal's. The dialog host runs this over the live location, and a fourth
// segment means the visitor is on the sheet rather than in the list.
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
  // decodeOrRaw and not a bare decode: this runs inside the dialog host's
  // useMemo, off the live location, so a malformed escape in a path anyone
  // can hold would throw during render. A slug that will not decode simply
  // matches no animal, which is what a bad address should do.
  return match?.[1] ? decodeOrRaw(match[1]) : null;
}

export function findAnimalBySlug<T extends AnimalFields>(
  animals: readonly T[],
  slug: string,
): T | undefined {
  return animals.find((animal) => animalPathParts(animal).animal === slug);
}

// Which photo of the animal a link opens on, counted from one. Slovenian like
// `zival`, and the same word in both languages: an address is one address
// whichever language the page it names is read in.
//
// Written by the share sheet and nowhere else. Stepping through the photos
// does not rewrite the address, so the parameter says where a visitor was
// when they handed the link on rather than where they are now.
export const PHOTO_PARAM = "foto";

/**
 * The photo a query names, as an index into the animal's own photos, or
 * undefined when it names none.
 *
 * Anything but a whole number above zero is nobody's photo: `?foto=0`,
 * `?foto=2.5` and `?foto=jutri` all read as no parameter at all, so a
 * hand-edited link degrades to the page it would have opened anyway. Whether
 * the index is one this animal has is the caller's question, because only the
 * caller knows how many photos there are.
 */
export function photoFromSearch(search: string): number | undefined {
  const named = new URLSearchParams(search).get(PHOTO_PARAM);
  if (named === null) return undefined;
  const position = Number(named);
  if (!Number.isInteger(position) || position < 1) return undefined;
  return position - 1;
}

/**
 * The caller's half of the rule above: the photo a link named, as an index the
 * animal actually has, and the first photo for anything else.
 *
 * A link that has outlived a photo still opens the animal it was written for.
 * Both surfaces that answer `?foto=` used to spell this out themselves, in two
 * different ways, so a change to the fallback had two places to land and one
 * of them was easy to miss.
 */
export function clampPhotoIndex(
  asked: number | undefined,
  count: number,
): number {
  if (asked === undefined || !Number.isInteger(asked)) return 0;
  if (asked < 0 || asked >= count) return 0;
  return asked;
}

/**
 * An animal's page, on one of its photos. The first photo is left unnamed:
 * that is the page's own address, and a link that says nothing extra is the
 * one people read out loud.
 */
export function pathWithPhoto(path: string, index: number | undefined): string {
  if (index === undefined || !Number.isInteger(index) || index < 1) return path;
  return `${path}?${PHOTO_PARAM}=${index + 1}`;
}
