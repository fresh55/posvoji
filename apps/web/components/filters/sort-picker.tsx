"use client";

import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  DoorOpen,
  Hourglass,
  Navigation,
  Sprout,
  TreeDeciduous,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { QUIET_TRIGGER_CLASS } from "@/components/filters/toolbar-trigger";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNearbyOrigin } from "@/hooks/use-nearby-origin";
import { ANIMAL_SORTS, effectiveSort, type AnimalSort } from "@/lib/sort";
import { cn } from "@/lib/utils";

// One mark per order, borrowed rather than invented wherever the site already
// has one. Hourglass is the wait, which is what the long-stay callout and the
// shelter card already draw it for. Sprout and TreeDeciduous are the two ends
// of the age filter's own grove: age-stage-icon.tsx adapts its mladicek and
// senior paths from these exact two icons, so "youngest first" and "oldest
// first" are marked with the plants the sidebar already grows. Navigation is
// the crosshair the location picker's own "Najbližje prvo" control wears, so
// the order and the control that grants it carry the same mark.
const SORT_ICONS: Record<AnimalSort, LucideIcon> = {
  "longest-in-shelter": Hourglass,
  "newest-arrivals": DoorOpen,
  youngest: Sprout,
  oldest: TreeDeciduous,
  name: ArrowDownAZ,
  nearest: Navigation,
};

/** The one sort control, in both places sorting is offered.
 *
 *  It spent this session's middle as a second, bespoke component: a text
 *  trigger opening a hand-built drawer of options, on the theory that sorting
 *  is a once-a-session act that should not hold a control's worth of room.
 *  Baymard's product-list testing says the opposite -- sorting is a primary
 *  product-finding tool, often reached for in preference to filtering, and the
 *  control has to stay reachable while the visitor scrolls rather than
 *  scrolling away with the top of the page. On a phone the place that is
 *  always reachable is the sheet behind the dock, so that is where sorting
 *  went, and a sheet has room for the same Select the desktop toolbar uses.
 *  From md the sticky toolbar has the room too (animal-filters.tsx), so the
 *  quiet trigger goes back on the row there and the sheet's copy stands down.
 *  Three placements, two dresses, one control, and a hand-rolled listbox
 *  less.
 *
 *  The trigger says "Razvrsti:" before the order wherever nothing above it
 *  does, which is both of the toolbar's rows. A quiet trigger draws no border
 *  until it is hovered, so without that word the control was a phrase between
 *  two small glyphs, and a phrase is read as a caption for whatever it comes
 *  to rest under.
 *
 *  `quiet` is the toolbar's dress: borderless until hovered, so a desktop row
 *  has one anchor instead of four framed boxes. Inside the sheet it is off,
 *  because there the Select is a control on its own and needs to look like
 *  one. */
export function SortPicker({
  value,
  onChange,
  disabled = false,
  quiet = true,
  labelledBy,
  className,
}: {
  value: AnimalSort;
  onChange: (sort: AnimalSort) => void;
  disabled?: boolean;
  quiet?: boolean;
  /** The id of a caption already saying what this control does, which the
   *  sheet draws above the row (filter-sheet.tsx). With one the trigger takes
   *  its name from that caption plus the order it shows, so the visible label
   *  and the announced one are the same words. Without one the trigger names
   *  itself, which is the toolbar's case: there the control stands alone in a
   *  row of other controls with no caption to borrow. */
  labelledBy?: string;
  className?: string;
}) {
  const { messages } = useI18n();
  const labels: Record<AnimalSort, string> = {
    "longest-in-shelter": messages.sortLongestInShelter,
    "newest-arrivals": messages.sortNewestArrivals,
    youngest: messages.sortYoungest,
    oldest: messages.sortOldest,
    name: messages.sortName,
    nearest: messages.sortNearest,
  };

  // Najbližje is on offer only once something has granted a point to measure
  // from, which on this site is the location picker's nearby control and
  // nothing else. Both placements read the same store, so the option appears in
  // the toolbar and in the sheet on the same commit.
  //
  // No mounted flag is needed for the hydration guard: useNearbyOrigin is a
  // useSyncExternalStore whose server snapshot is null, and React reads that
  // snapshot for the hydrating render too, so the server's list of orders and
  // the first client render's list are the same list. The option arrives in the
  // commit after, when there is nothing left to mismatch against.
  const origin = useNearbyOrigin();
  const sorts = origin
    ? ANIMAL_SORTS
    : ANIMAL_SORTS.filter((sort) => sort !== "nearest");
  // A shared link can carry ?razvrsti=najblizje to somebody who has granted
  // nothing, and the option it names is then not in the list below. The grid
  // falls back to the default for that link (effectiveSort in lib/sort.ts), so
  // the trigger names the order the grid actually used rather than one the
  // visitor cannot pick.
  const shown = effectiveSort(value, origin?.at);
  // The order's own text, carried by an id so a caption outside this component
  // can be named together with it. aria-labelledby takes ids and nothing else,
  // so the value the trigger already draws is what the second half of the name
  // points at rather than a repeat of it in an attribute.
  const valueId = labelledBy ? `${labelledBy}-value` : undefined;

  return (
    <Select
      value={shown}
      disabled={disabled}
      onValueChange={(sort) => onChange(sort as AnimalSort)}
    >
      <SelectTrigger
        size="sm"
        // The same words as the trigger draws, in the same order. A combobox
        // takes no name from its contents (the accname spec allows that for
        // neither of this control's roles), so the name has to be written;
        // what it must not be is a second wording. It read "Razvrsti živali:
        // Najdlje v zavetišču" while the screen said "Razvrsti: Najdlje v
        // zavetišču", which is a visible label the spoken name does not
        // contain, and speech input is driven by the visible one.
        aria-label={
          labelledBy ? undefined : `${messages.sortCaption}: ${labels[shown]}`
        }
        aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
        className={cn(
          // text-sm, the size the species tabs across the row from it are
          // set at. At text-xs this was the smallest type on the page and the
          // only control in the toolbar drawn below the row's own size, which
          // read as a caption rather than as the other half of the bar. The
          // trigger keeps its size="sm" height, so the row's geometry is
          // unchanged; only the label grows the 2px.
          //
          // The 44px floor asks the pointer rather than the width. A 1024px
          // laptop window is a mouse and a 1180px tablet is a thumb, and the
          // width gate had it the other way round: measured at 1180x820 with a
          // coarse pointer this trigger was 32px.
          "text-sm pointer-coarse:min-h-11",
          // The label takes the room between the two icons instead of
          // floating in the middle of it. The trigger is justify-between and
          // the value is the middle of its three children, so a trigger given
          // a width to spread over -- w-full, which is what the filter sheet
          // hands it -- pushed the arrow and the chevron to the ends and left
          // the name centred between them, reading as a caption rather than
          // as the value of a control. Growing it costs the toolbar nothing:
          // that trigger is w-fit, so there is no spare width to claim.
          //
          // Set here and through the child variant ui/select.tsx dresses the
          // value with, because Radix's SelectValue drops the className it is
          // handed. min-w-0 is what lets the truncate below actually bite,
          // and text-left is the one that undoes the centring: a trigger is a
          // button, and a button's text is centred by the browser. No
          // justify-* here, since the value's own flex row already starts at
          // the start.
          "*:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:text-left",
          quiet && cn(QUIET_TRIGGER_CLASS, "data-[state=open]:border-border"),
          className,
        )}
      >
        <ArrowDownNarrowWide
          className="size-3.5 shrink-0 text-muted-foreground pointer-coarse:size-4"
          aria-hidden
        />
        {/* The word that makes this a control rather than a caption. Quiet in
            the toolbar, the trigger drew a bare order between a 14px arrow and
            a chevron, and on the home page that phrase comes to rest 12px
            under Srečko's own caption, on his centre line and in louder ink
            than it (home-cat.tsx). A visitor read the two as one block and
            took the order for a fact about the cat: that he is the animal who
            has waited longest. A phrase under a picture is a caption, so the
            phrase stops being a bare one.

            Only where nothing above the control already says it. The filter
            sheet's header says the same word over its own sort row
            (filter-sheet.tsx), and this would be a second copy of it 6px
            below the first.

            Measured on the built page: the trigger grows from 186 to 253px
            and no width from 768 to 1440 gains a pixel of horizontal scroll.
            From lg it is the whole of the toolbar's right cluster, since the
            location picker stands down beside the filter panel; below lg the
            species strip it shares the row with is min-w-0 and gives way by
            scrolling, which is what it does already. shrink-0 so the order
            beside it is what gives way inside the trigger. */}
        {!labelledBy && (
          <span className="shrink-0 text-muted-foreground">
            {messages.sortCaption}:
          </span>
        )}
        {/* The label used to go at max-sm, so a phone got an arrow and a
            chevron in a box and nothing saying what either did. That was to
            leave the species tabs beside it room to breathe; the tabs have
            had the phone's row to themselves since they stopped fitting one,
            and the rows this control does share with them, from md up, have
            336px to spare at the narrowest of them. Truncation, not
            hiding, is what a long sort name gets: the trigger keeps whatever
            width its placement gives it and the name gives way inside, on the
            width the trigger's own classes above give this value. */}
        <SelectValue>
          <span id={valueId} className="truncate">
            {labels[shown]}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {/* The open menu says what it is a menu of. A list of orders dropped
            from a quiet trigger in a toolbar, or floating over a filter sheet,
            otherwise leaves the visitor to infer that from the options alone.
            Radix ties the label to the group it heads, so screen readers
            announce the heading with the list rather than as a stray line;
            the label is a div and not an item, so neither focus nor the
            keyboard's type-ahead can land on it. */}
        <SelectGroup>
          <SelectLabel>{messages.sortBy}</SelectLabel>
          {sorts.map((sort) => {
            const Icon = SORT_ICONS[sort];
            return (
              <SelectItem
                key={sort}
                value={sort}
                // 32px is what the stock item measures, which is fine for a
                // mouse and under the 44px every other control in the filter
                // sheet keeps for a thumb. The floor lifts on a coarse
                // pointer, which is the question being asked; a width gate
                // gave a touch tablet the mouse's height.
                className="pointer-coarse:min-h-11"
              >
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {labels[sort]}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
