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
