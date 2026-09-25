import { useCallback, useState } from "react";

import {
  PICKER_SPLIT_QUERY,
  SHORT_VIEWPORT_QUERY,
} from "@/lib/viewport-queries";

export { SHORT_VIEWPORT_QUERY };

/** A pointer that can aim and hover, which is what decides where an open puts
 *  focus. Named rather than written out at the call site, the same as NO_HOVER
 *  in shelter-map.tsx: the test stubs matchMedia and has to answer the exact
 *  string the component asks for, and a literal in both files drifts silently.
 */
export const FINE_POINTER = "(pointer: fine)";

/** A viewport whose map view writes the animal counts on its coins, which is
 *  where the map, not the list, is the way into the picker.
 *
 *  The coins count from a stage 608px wide inside its padding (COUNT_TOO_SMALL
 *  in map-marker.tsx), and below lg the stage is the dialog's 94vw less 32px
 *  of padding: 94% of 688px is 647px, less the 32 is 615, which clears it. So
 *  43rem, and a tablet held upright is on the right side of it. It opened on
 *  its list, eleven rows in two columns over 250px of empty dialog, with the
 *  one view that could show it where the animals are a tab away.
 *
 *  Named for the test stubs, like FINE_POINTER. */
export const MAP_LEADS_QUERY = "(min-width: 43rem)";

export function hasFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(FINE_POINTER).matches ?? false;
}

/** Whether this screen reads the picker off its list: a phone held upright.
 *  The list is where it opens, and where a pick made on its small map is read
 *  back, as the checked row and its details. Everywhere else the map carries
 *  the pick itself: split, the list stands beside it, and a tablet's map names
 *  every picked coin and counts every shelter. A phone with no height to spare
 *  keeps its map too, which a raised list would cover.
 *
 *  Split is asked outright. The other two cover it today only because 43rem
 *  is under split's 64rem and split's other arm is a short screen, and a split
 *  screen answering yes would move focus off a map target still in view.
 *
 *  Also the one test for where a pick sends focus, since the map target that
 *  took the press goes out of sight only where the list replaces it. */
export function listLeads(): boolean {
  if (typeof window === "undefined") return true;
  const matches = (query: string) =>
    window.matchMedia?.(query).matches ?? false;
  return (
    !matches(PICKER_SPLIT_QUERY) &&
    !matches(SHORT_VIEWPORT_QUERY) &&
    !matches(MAP_LEADS_QUERY)
  );
}

/** Owns the phone sheet and the once-per-open landing decision. Where the list
 *  stands beside the map (picker-split in globals.css) there is no dock state
 *  to speak of: both are on screen whatever this holds. */
export function useLocationPickerMotion(open: boolean) {
  const [sheetOpen, setSheetOpen] = useState(true);
  // The open the view was last chosen for, chosen in that open's own render.
  // An effect chose it a render late, and everywhere the answer is the map
  // that second pass re-rendered the whole dialog, its rows and its plate, to
  // change nothing on screen. State and not a ref, because it is read while
  // rendering.
  const [landed, setLanded] = useState(false);
  if (landed !== open) {
    setLanded(open);
    if (open) setSheetOpen(listLeads());
  }

  const landSpotlight = useCallback(() => {
    setLanded(true);
    setSheetOpen(true);
  }, []);

  return {
    sheetOpen,
    setSheetOpen,
    landSpotlight,
  };
}
