// Where the found-animal flow lives, as one contract both sides can reach.
// The lookup used to be a tab inside the homepage map dialog; it is a page
// now, and the dialog does one job, filtering by shelter.

/** The lookup as a page of its own, per locale. Here and not beside the page
 *  component: the footer links to these from a client tree (portal-shell.tsx
 *  is "use client"), and the page component imports loadDataset, which is fs.
 *  This contract file is the one place both sides can already reach. */
export const FOUND_ANIMAL_PATHS = {
  sl: "/najdena-zival",
  en: "/en/found-animal",
} as const;

/** The query parameter the lookup used to be linkable by, back when it was a
 *  mode of the homepage dialog. Municipality websites published /?najdena, so
 *  the homepage still reads it and sends the visitor to the page above; see
 *  components/found-animal-redirect.tsx. */
export const FOUND_ANIMAL_PARAM = "najdena";

/** What a link may name the place in. This page exists so an občina's website
 *  or a post in a group can point at it, and both keys open the lookup on the
 *  place they name rather than on an empty box; see
 *  components/filters/municipality-finder.tsx. Slovenian in both locales,
 *  because a published link is copied as it is written and the two are the
 *  same address.
 *
 *  Beside FOUND_ANIMAL_PATHS and not in the component, for the same reason
 *  every other param this app reads is a named export: PHOTO_PARAM,
 *  SORT_PARAM, FOUND_ANIMAL_PARAM. A public contract is not a string literal
 *  in a render. */
export const FOUND_ANIMAL_PLACE_PARAMS = ["kraj", "posta"] as const;
