// The contract between the homepage "found an animal" button and the location
// picker's municipality mode. The button and the picker are far apart in the
// tree and the dialog is rendered twice (desktop toolbar, mobile dock), so
// the ask travels as a window event and each picker instance decides by
// breakpoint whether it is the visible one that should answer.

export const OPEN_MUNICIPALITY_LOOKUP_EVENT = "posvoji:municipality-lookup";

/** The lookup as a page of its own, per locale. Here and not beside the page
 *  component: the footer links to these from a client tree (portal-shell.tsx
 *  is "use client"), and the page component imports loadDataset, which is fs.
 *  This contract file is the one place both sides can already reach. */
export const FOUND_ANIMAL_PATHS = {
  sl: "/najdena-zival",
  en: "/en/found-animal",
} as const;

/** Query parameter that opens the lookup directly, so the state is linkable:
 *  /?najdena from a municipality's website lands in the občina search. */
export const FOUND_ANIMAL_PARAM = "najdena";

export function requestMunicipalityLookup(): void {
  window.dispatchEvent(new Event(OPEN_MUNICIPALITY_LOOKUP_EVENT));
}
