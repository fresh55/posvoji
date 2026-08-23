"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { Check, ChevronRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatKm } from "@/lib/geo";
import { cn } from "@/lib/utils";

export type ShelterRow = {
  value: string;
  label: string;
  city?: string;
  km?: number;
  /** Set on a registry shelter with nothing to filter by: the row links to
   *  its own page instead of toggling a selection. Every toggle-only prop
   *  below (counts, selected, onToggle) plays no part in a row carrying
   *  this. */
  href?: string;
};

// What a row registers: a toggle row registers its toggle <button>, never the
// wrapper around it, and a link row (href set) registers its <a>. Both end up
// in the same refs map, keyboard-walked or scrolled to by value alone, so the
// map and the keyboard code that reach into it do not need to know which
// element kind they got.
type ShelterRowElement = HTMLButtonElement | HTMLAnchorElement;

// Stable empty defaults, so a caller rendering link rows only is not made to
// fabricate a Map and an array it will never read from.
const EMPTY_COUNTS = new Map<string, number>();
const EMPTY_SELECTED: string[] = [];

// The list is not a fallback for narrow screens. It is the accessible path, it
// always holds every shelter including the ones no marker could be placed for,
// and its rows are the full size target for anyone who cannot hit a region.
// Both the sidebar and the expanded map show the same rows.
export function ShelterRows({
  rows,
  counts = EMPTY_COUNTS,
  selected = EMPTY_SELECTED,
  onToggle,
  refs,
  className,
  highlighted,
  onHoverRow,
  onExitTop,
  lessThanOneKm,
  scrollTo,
  onInfo,
  infoLabel,
}: {
  rows: ShelterRow[];
  /** Per-shelter animal count, shown as a badge on a toggle row. Unused by a
   *  link row; omit when every row in the list carries an href. */
  counts?: Map<string, number>;
  selected?: string[];
  /** Toggles a row's selection. Never called for a link row, which navigates
   *  instead; omit when every row in the list carries an href. */
  onToggle?: (value: string) => void;
  refs?: RefObject<Map<string, ShelterRowElement>>;
  className?: string;
  /** Values lit up because their marker is hovered on the map. */
  highlighted?: string[];
  /** Fired on row pointer enter/leave, so the map can highlight the matching
   *  marker and region. Null on leave. Fires for both row kinds. */
  onHoverRow?: (value: string | null) => void;
  /** ArrowUp on the first row leaves the list upward, so the search box and
   *  the rows read as one keyboard surface. */
  onExitTop?: () => void;
  /** The one row to bring into view, when there is one. Separate from
   *  `highlighted` on purpose: the tint and the scroll answer to different
   *  things. A hover always tints, but it only scrolls while the caller has
   *  nothing on screen worth more than the hover, and the caller is the only
   *  one that knows. Undefined scrolls nothing. A value belonging to the other
   *  list is simply not found here, which is what lets both lists take the
   *  same one without fighting over the scroller. */
  scrollTo?: string;
  /** The words for a sub-kilometre distance, in the reader's language. The
   *  rows take it as a prop rather than reading the locale themselves, which
   *  keeps them renderable outside a provider. */
  lessThanOneKm?: string;
  /** Asks about a shelter without changing whether it is picked. Given, a
   *  picked toggle row grows a small info control beside the toggle; omitted,
   *  the row holds nothing but the toggle, which is what the rows inside a
   *  group card want. Never called for a link row. */
  onInfo?: (value: string) => void;
  /** The accessible name for that control, built from the shelter's own
   *  label. Same idiom as lessThanOneKm: the words come from the caller, so
   *  the rows stay renderable outside a locale provider. */
  infoLabel?: (label: string) => string;
}) {
  const localRefs = useRef(new Map<string, ShelterRowElement>());
  // True while the pointer sits inside the list. `highlighted` only ever
  // comes from the map (see location-picker.tsx: a row's own pointer hover
  // feeds a different piece of state, onHoverRow, not this prop), so the
  // effect below is already safe from a row lighting itself up. This flag
  // guards the other direction instead: someone scrolling the list by hand
  // must never have it yanked out from under their pointer by a hover event
  // landing on the map at the same time.
  const pointerInsideRef = useRef(false);

  // The row the caller named is brought into view, so an echo is visible even
  // when the matched shelter has scrolled off. `block: "nearest"` means a row
  // already on screen does not move at all. Instant, not smooth: the repo
  // already treats motion as something to justify (see motion-reduce: in
  // shelter-map.tsx), and a list that jumps rather than glides never fights a
  // scroll the visitor is mid-gesture on.
  //
  // A town can hold a live shelter and an off-site one at once, and the live
  // list and the off-site list both mount this effect against the one
  // `scrollTo` the picker hands them, so both run. localRefs.get returns
  // undefined for a value that belongs to the other list, which makes the
  // lookup itself the arbiter: exactly one of the two ever holds that row, so
  // exactly one of them ever calls scrollIntoView, and the two can never fight
  // over where the shared scroll container lands.
  useEffect(() => {
    if (!scrollTo || pointerInsideRef.current) return;
    localRefs.current
      .get(scrollTo)
      ?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [scrollTo]);

  // Arrow keys walk the enabled toggle rows only. A link row takes the tab
  // order's own focus instead and never joins this walk, and a disabled
  // toggle row cannot take focus, so skipping both is what keeps the walk
  // from dead-ending.
  const moveFocus = (event: KeyboardEvent, value: string) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = rows.filter(
      (row) =>
        !row.href &&
        ((counts.get(row.value) ?? 0) > 0 || selected.includes(row.value)),
    );
    const index = enabled.findIndex((row) => row.value === value);
    if (index < 0) return;
    if (event.key === "ArrowUp" && index === 0) {
      onExitTop?.();
      return;
    }
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : event.key === "ArrowUp"
            ? index - 1
            : Math.min(index + 1, enabled.length - 1);
    localRefs.current.get(enabled[next].value)?.focus();
  };

  return (
    <div
      className={cn("space-y-0.5", className)}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
      }}
    >
      {rows.map(({ value, label, city, km, href }) => {
        const isHighlighted = highlighted?.includes(value) ?? false;
        const sublabel = [
          city,
          km === undefined ? undefined : formatKm(km, lessThanOneKm),
        ]
          .filter(Boolean)
          .join(" · ");
        const setRef = (node: ShelterRowElement | null) => {
          if (node) localRefs.current.set(value, node);
          else localRefs.current.delete(value);
          if (!refs) return;
          if (node) refs.current.set(value, node);
          else refs.current.delete(value);
        };

        // A registry shelter with nothing to filter by: there is a page for
        // it, so the row is a link out rather than a dead toggle. It copies
        // a toggle row's layout down to the size-3.5 spacer where the check
        // sits, so the two lists share their columns.
        if (href) {
          return (
            <a
              key={value}
              ref={setRef}
              href={href}
              onPointerEnter={() => onHoverRow?.(value)}
              onPointerLeave={() => onHoverRow?.(null)}
              data-highlighted={isHighlighted || undefined}
              className={cn(
                // max-lg:min-h-11 is the 44px touch target the comment above
                // this function promises; lg and up keeps the denser row.
                // Touch targets across the map dialog gate at lg rather than
                // md, because lg is where the picker's list dock switches
                // from a bottom sheet to a side panel, which is where the
                // mobile layout actually ends (see location-picker.tsx's
                // close button for the full statement of this rule).
                "flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left transition-colors max-lg:min-h-11",
                isHighlighted ? "bg-muted/50" : "hover:bg-muted/50",
              )}
            >
              <span className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-muted-foreground">
                  {label}
                </span>
                {sublabel && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {sublabel}
                  </span>
                )}
              </span>
              <ChevronRight
                className="size-3 shrink-0 text-muted-foreground/60"
                aria-hidden
              />
            </a>
          );
        }

        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const disabled = count === 0 && !checked;
        // Selection puts nothing on the row's surface at all: any shared fill,
        // however faint, makes two adjacent picked rows read as one shape,
        // because the 2px gap between rows is thinner than the eye needs. What
        // says "picked" is the check, the label's weight and the count pill's
        // tint, three marks that sit inside each row and cannot merge across
        // two. The surface is left free to answer hover and the map's marker
        // highlight, the same way on every row.
        //
        // The row is a wrapper holding two controls rather than one control,
        // because a toggle and a question are two different acts. Every target
        // in this picker reports aria-pressed, and activating a pressed
        // control has to flip it, so a click on a picked row drops that
        // shelter and can never also re-open the card describing it. The info
        // control is that second act: it opens the card and leaves the
        // selection where it is. Its slot is held open by an inert span on the
        // rows that do not have it, so picking a row does not shove the count
        // pills of the rows around it sideways.
        //
        // The surface classes, the hover tint and the hover reporting all sit
        // on the wrapper, so the tint covers the row edge to edge and hovering
        // the info control still lights up the shelter's marker on the map.
        return (
          <div
            key={value}
            data-shelter-row={value}
            onPointerEnter={() => onHoverRow?.(value)}
            onPointerLeave={() => onHoverRow?.(null)}
            className={cn(
              "flex w-full items-center gap-1 rounded-ui px-2 transition-colors",
              // The three things a disabled row used to get for free from the
              // <button> that was the whole row, said outright now that the
              // surface is a div. The dimming and the cursor cover the padding
              // either side of the toggle, which the button's own copies of
              // them no longer reach. Hover is the one that had to be taken
              // away rather than repeated: CSS :hover reaches a div whatever
              // the disabled button inside it does, so a dead row would have
              // started tinting under the pointer.
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
              isHighlighted ? "bg-muted/50" : !disabled && "hover:bg-muted/50",
            )}
          >
            <button
              type="button"
              ref={setRef}
              onClick={() => onToggle?.(value)}
              onKeyDown={(event) => moveFocus(event, value)}
              disabled={disabled}
              aria-pressed={checked}
              data-highlighted={isHighlighted || undefined}
              // cursor-pointer because preflight gives every button the arrow
              // cursor, not the hand: without it nothing at rest says this row
              // is clickable, and the same rule is why the wrapper cannot hand
              // its own cursor down to this one. max-lg:min-h-11 is the 44px
              // touch target, same rule as the link row above. The focus ring
              // is drawn inside the button's own box, because the wrapper's
              // padding leaves no room outside it; animal-card.tsx already
              // uses an inset outline for the same reason.
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-ui py-1.5 text-left max-lg:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed"
            >
              {/* Always laid out, so selecting a row doesn't shift the list. */}
              <Check
                className={cn(
                  "size-3.5 shrink-0",
                  checked ? "text-[var(--filter-accent-strong)]" : "opacity-0",
                )}
                strokeWidth={2.25}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      checked ? "font-medium" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                  {/* The count as a pill tucked against the name it belongs
                      to, not a number stranded across the row's own width.
                      Same quiet-badge shape the sidebar already uses for a
                      count (h-5 min-w-5 rounded-full, tabular-nums), so this
                      reads as the site's one way of showing "how many" rather
                      than a new one invented for this list. On a picked row it
                      takes the accent tint: with the row surface kept clear,
                      the pill is the mark that stays visible at the right edge
                      when the left half of a long name is all a narrow panel
                      shows.

                      An unpicked pill keeps the secondary variant's own
                      foreground rather than overriding it to muted. Muted ink
                      on the secondary surface measured 4.35:1, under the 4.5
                      that 11px text has to clear, and the count is the number
                      the row is picked on, not decoration. The variant's own
                      pairing is the quiet one that was already designed to
                      clear it. */}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-5 min-w-5 shrink-0 rounded-full px-1 text-[11px] font-normal tabular-nums",
                      checked &&
                        "bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]",
                    )}
                  >
                    {count}
                  </Badge>
                </span>
                {sublabel && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {sublabel}
                  </span>
                )}
              </span>
            </button>

            {/* Only where a caller has something to open, and only on a row
                that is picked: an unpicked row's own click already opens the
                card, so a second control saying the same thing would be one
                too many. Hidden below lg because the card it opens is
                max-lg:hidden, and a control that visibly does nothing is worse
                than no control. */}
            {onInfo &&
              (checked ? (
                <button
                  type="button"
                  onClick={() => onInfo(value)}
                  aria-label={infoLabel?.(label)}
                  className="hidden size-6 shrink-0 cursor-pointer items-center justify-center rounded-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              ) : (
                <span aria-hidden className="hidden size-6 shrink-0 lg:block" />
              ))}
          </div>
        );
      })}
    </div>
  );
}
