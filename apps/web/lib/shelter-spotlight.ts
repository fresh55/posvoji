// The contract between an animal card's shelter name and the location
// picker's map. The card and the picker are far apart in the tree and the
// dialog is rendered twice (desktop toolbar, mobile dock), so the ask travels
// as a window event and each picker instance decides by breakpoint whether it
// is the visible one that should answer.

export const SHELTER_SPOTLIGHT_EVENT = "posvoji:shelter-spotlight";

/** Which shelter the map should light up, by the id the filter options, the
 *  map pins and the list rows are all keyed by. */
export type ShelterSpotlightDetail = { shelterId: string };

export function requestShelterSpotlight(shelterId: string): void {
  window.dispatchEvent(
    new CustomEvent<ShelterSpotlightDetail>(SHELTER_SPOTLIGHT_EVENT, {
      detail: { shelterId },
    }),
  );
}
