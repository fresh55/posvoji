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
  SelectItem,
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
 *  Two placements, one control, and a hand-rolled listbox less.
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
  className,
}: {
  value: AnimalSort;
  onChange: (sort: AnimalSort) => void;
  disabled?: boolean;
  quiet?: boolean;
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

  return (
    <Select
      value={shown}
      disabled={disabled}
      onValueChange={(sort) => onChange(sort as AnimalSort)}
    >
      <SelectTrigger
        size="sm"
        // The name carries the active sort as well as the visible label does,
        // because this control is worth finding by either.
        aria-label={`${messages.sortBy}: ${labels[shown]}`}
        className={cn(
          // text-sm, the size the species tabs across the row from it are
          // set at. At text-xs this was the smallest type on the page and the
          // only control in the toolbar drawn below the row's own size, which
          // read as a caption rather than as the other half of the bar. The
          // trigger keeps its size="sm" height, so the row's geometry is
          // unchanged; only the label grows the 2px.
          "text-sm max-lg:min-h-11",
          quiet && cn(QUIET_TRIGGER_CLASS, "data-[state=open]:border-border"),
          className,
        )}
      >
        <ArrowDownNarrowWide
          className="size-3.5 shrink-0 text-muted-foreground max-lg:size-4"
          aria-hidden
        />
        {/* The label used to go at max-sm, so a phone got an arrow and a
            chevron in a box and nothing saying what either did. That was to
            leave the species tabs beside it room to breathe; the tabs have
            had a row of their own since they stopped fitting one, and this
            control no longer shares a row with them at all. Truncation, not
            hiding, is what a long sort name gets: the trigger keeps whatever
            width its placement gives it and the name gives way inside. */}
        <SelectValue>
          <span className="truncate">{labels[shown]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {sorts.map((sort) => {
          const Icon = SORT_ICONS[sort];
          return (
            <SelectItem key={sort} value={sort}>
              <Icon
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              {labels[sort]}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
