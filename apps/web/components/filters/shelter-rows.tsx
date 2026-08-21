"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { Check, ChevronRight } from "lucide-react";
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

// A toggle row is a <button>; a link row (href set) is an <a>. Both end up in
// the same refs map, keyboard-walked or scrolled to by value alone, so the
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
  /** The words for a sub-kilometre distance, in the reader's language. The
   *  rows take it as a prop rather than reading the locale themselves, which
   *  keeps them renderable outside a provider. */
  lessThanOneKm?: string;
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

  // A highlight arriving from the map scrolls its row into view, so the echo
  // is visible even when the matched shelter has scrolled off. `block:
  // "nearest"` means a row already on screen does not move at all. Instant,
  // not smooth: the repo already treats motion as something to justify (see
  // motion-reduce: in shelter-map.tsx), and a list that jumps rather than
  // glides never fights a scroll the visitor is mid-gesture on.
  //
  // Only highlighted[0] is ever scrolled to, and a list only acts when that
  // value is one of its own rows. A town can hold a live shelter and an
  // off-site one at once, and the live list and the off-site list both mount
  // this same effect against the same `highlighted` array (see
  // location-picker.tsx, which passes both lists the one hoveredMarkerValues
  // state), so both effects run. localRefs.get returns undefined for a value
  // that belongs to the other list, which makes the lookup itself the
  // arbiter: exactly one of the two lists ever holds a row for
  // highlighted[0], so exactly one of them ever calls scrollIntoView, and
  // the two can never fight over where the shared scroll container lands.
  const highlightedKey = highlighted?.join(",");
  useEffect(() => {
    if (!highlightedKey || pointerInsideRef.current) return;
    const first = highlighted?.[0];
    if (!first) return;
    localRefs.current
      .get(first)
      ?.scrollIntoView({ block: "nearest", behavior: "auto" });
    // highlightedKey is the dependency on purpose: it is derived from
    // `highlighted` in the same render, so the two never disagree, and
    // listing the array itself would fire this on every render that passes a
    // fresh-but-equal array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedKey]);

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
                  <span className="block truncate text-[11px] text-muted-foreground/80">
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
        return (
          <button
            key={value}
            type="button"
            ref={setRef}
            onClick={() => onToggle?.(value)}
            onKeyDown={(event) => moveFocus(event, value)}
            onPointerEnter={() => onHoverRow?.(value)}
            onPointerLeave={() => onHoverRow?.(null)}
            disabled={count === 0 && !checked}
            aria-pressed={checked}
            data-highlighted={isHighlighted || undefined}
            className={cn(
              // cursor-pointer because a bare <button> defaults to the arrow
              // cursor, not the hand: without it nothing at rest says this
              // row is clickable. Selected rows wear the same accent surface
              // the map gives a picked region (--filter-accent /
              // -foreground), so scanning the list at rest already answers
              // "what did I pick" instead of needing a hover to reveal it.
              // max-lg:min-h-11 is the 44px touch target, same rule as the
              // link row above.
              "flex w-full cursor-pointer items-center gap-2 rounded-ui px-2 py-1.5 text-left transition-colors max-lg:min-h-11 disabled:cursor-not-allowed disabled:opacity-40",
              checked
                ? "bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)] hover:bg-[var(--filter-accent)]"
                : isHighlighted
                  ? "bg-muted/50"
                  : "hover:bg-muted/50",
            )}
          >
            {/* Always laid out, so selecting a row doesn't shift the list. */}
            <Check
              className={cn("size-3.5 shrink-0", !checked && "opacity-0")}
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    !checked && "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {/* The count as a pill tucked against the name it belongs to,
                    not a number stranded across the row's own width. Same
                    quiet-badge shape the sidebar already uses for a count
                    (h-5 min-w-5 rounded-full, tabular-nums), so this reads as
                    the site's one way of showing "how many" rather than a
                    new one invented for this list. Its own muted surface
                    stays put whether the row is selected or not, the same
                    way a filter card's count never follows the card's own
                    accent. */}
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 shrink-0 rounded-full px-1 text-[11px] font-normal tabular-nums text-muted-foreground"
                >
                  {count}
                </Badge>
              </span>
              {sublabel && (
                <span className="block truncate text-[11px] text-muted-foreground/80">
                  {sublabel}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
