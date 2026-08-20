// The contract between the homepage "found an animal" strip and the location
// picker's municipality mode. The strip and the picker are far apart in the
// tree and the dialog is rendered twice (desktop toolbar, mobile dock), so
// the ask travels as a window event and each picker instance decides by
// breakpoint whether it is the visible one that should answer.

export const OPEN_MUNICIPALITY_LOOKUP_EVENT = "posvoji:municipality-lookup";

/** Query parameter that opens the lookup directly, so the state is linkable:
 *  /?najdena from a municipality's website lands in the občina search. */
export const FOUND_ANIMAL_PARAM = "najdena";

export function requestMunicipalityLookup(): void {
  window.dispatchEvent(new Event(OPEN_MUNICIPALITY_LOOKUP_EVENT));
}
