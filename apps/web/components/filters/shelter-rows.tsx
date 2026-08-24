"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { Check, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { ShelterDetails } from "@/components/filters/shelter-details";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatKm } from "@/lib/geo";
import type { ShelterSummary } from "@/lib/shelter-summary";
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
const EMPTY_SUMMARIES = new Map<string, ShelterSummary>();

// ShelterDetails answers a shelter it knows nothing about by rendering null,
// but the wrapper below it carries the panel's own fill, inset and separator,
// so something has to ask the same question before it paints. That something
// is the early return further down: a shelter with nothing to say is given no
// info control and no Collapsible at all, rather than a control that turns and
// reveals a blank strip. Keep the test in step with the one at the top of
// shelter-details.tsx.
function hasDetails(summary: ShelterSummary | undefined): boolean {
  if (!summary) return false;
  return (
    summary.species.length > 0 ||
    (summary.faces?.length ?? 0) > 0 ||
    summary.longestWaiting !== undefined
  );
}

// The rows take every word they show as a prop, so they stay renderable
// outside a locale provider. The one thing that breaks that is ShelterDetails,
// which reads the locale itself, and it is only ever mounted for the shelter
// that is open. A caller that hands in neither onToggleExpanded nor summaries
// therefore still renders anywhere; a caller that hands in both is asking for
// a panel and has to be inside I18nProvider, which the picker is.
//
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
  countLabel,
  labelledBy,
  scrollTo,
  summaries = EMPTY_SUMMARIES,
  expanded,
  onToggleExpanded,
  infoLabel,
  hideInfoLabel,
  infoText,
  hideInfoText,
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
  /** What the count pill means, in the reader's language, given the number it
   *  is showing. The pill is inside the toggle, so its digits land in that
   *  button's accessible name: without this a row announced as "Zavetišče
   *  Ljubljana 50 Ljubljana · 113 km", two bare numbers where only one of them
   *  said what it counted. Given, the digits go aria-hidden and this speaks in
   *  their place. Same caller-supplies-the-words idiom as lessThanOneKm. */
  countLabel?: (count: number) => string;
  /** Ties the rows to the heading that explains them, by that heading's id. A
   *  screen reader walking this list otherwise hears row after row with
   *  nothing saying which list it is in, which matters most for the off-roster
   *  group: its rows are links out, and the only thing marking them as "no
   *  animals listed" is a heading they have no relationship to. Given, the
   *  container becomes a labelled group; omitted, it stays a plain div, so a
   *  caller with one unlabelled list adds no empty landmark. */
  labelledBy?: string;
  /** What each shelter is beyond its name and its count, keyed by the same
   *  value the counts map uses. Only read for the one shelter that is open, so
   *  a caller with no dataset behind it (the map gallery, tests) can leave it
   *  out; a shelter missing from the map, or one the map has nothing to say
   *  about, opens to nothing rather than to an empty strip. */
  summaries?: Map<string, ShelterSummary>;
  /** The one shelter whose details are open, or null. Controlled by the
   *  caller, never held here: one-at-a-time is a rule about the whole list and
   *  the picker is the only thing that sees the whole list. Undefined leaves
   *  every row closed. */
  expanded?: string | null;
  /** Asks about a shelter without changing whether it is picked. Given, every
   *  toggle row grows an info control beside its toggle; omitted, the row
   *  holds nothing but the toggle and no collapsible is built around it at
   *  all, which is what the off-site link list and any caller without
   *  summaries want. Never called for a link row.
   *
   *  It is a toggle, not an open: the caller decides whether the value handed
   *  in becomes the new open shelter or closes the one already open. */
  onToggleExpanded?: (value: string) => void;
  /** The accessible name for that control while the row is closed, built from
   *  the shelter's own label. Same idiom as lessThanOneKm: the words come from
   *  the caller, so the rows stay renderable outside a locale provider. */
  infoLabel?: (label: string) => string;
  /** The accessible name for the same control once the row is open. It has to
   *  say the shelter's name the way infoLabel does, because a screen reader
   *  walking the list hears the control on its own, out of the row's
   *  context. */
  hideInfoLabel?: (label: string) => string;
  /** The tooltip's words while the row is closed, with no shelter name in
   *  them: the name is right there in the row the control sits in. */
  infoText?: string;
  /** The same for the open state. Both are tooltip-only, so neither costs the
   *  row any width; infoLabel and hideInfoLabel are what a screen reader gets,
   *  and each is expected to contain its tooltip's string verbatim so the
   *  accessible name still holds the visible label (WCAG 2.5.3). */
  hideInfoText?: string;
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
  //
  // The info control stays out of the walk, and the walk stays one stop per
  // shelter. Every control in this list is in the tab order already, so the
  // arrows are a shortcut over shelters rather than the only way through, and
  // the tab order is what reaches the second control inside a row: arrows
  // between items, Tab within one, the same division a composite widget makes.
  // Folded in, ArrowDown would have to answer "the next shelter" and "this
  // shelter's other control" with one key. Nothing inside the opened panel is
  // focusable either (ShelterDetails carries no button at all), so opening a
  // row adds no stop the walk would otherwise strand.
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

  // One provider for the whole list rather than one per row: the delays are
  // shared state, and the skip window is what lets a pointer run down the
  // column of controls and read them without waiting out the delay again on
  // each. The numbers live in ui/tooltip.tsx now, so every tooltip on the site
  // waits the same wait without three call sites agreeing to by hand.
  return (
    <TooltipProvider>
      <div
        role={labelledBy ? "group" : undefined}
        aria-labelledby={labelledBy}
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
                  // The inset focus ring the toggle and the info control
                  // already take, for the same reason: this row sits inside a
                  // scroller, and a ring drawn outside the box is what the
                  // container clips first.
                  "flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left transition-colors max-lg:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                  isHighlighted ? "bg-muted/50" : "hover:bg-muted/50",
                )}
              >
                <span className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-muted-foreground">
                    {label}
                  </span>
                  {sublabel && (
                    <span className="block truncate text-2xs text-muted-foreground">
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
          const summary = summaries.get(value);
          const isExpanded = expanded === value;
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
          // shelter and can never also re-open the details describing it. The
          // info control is that second act: it opens the panel and leaves the
          // selection where it is, and the two verbs stay orthogonal in the other
          // direction too, because closing the panel goes nowhere near onToggle.
          //
          // The control's slot no longer needs an inert span holding it open. It
          // used to come and go with `checked`, and the rows either side of a
          // pick would have had their count pills shoved sideways by its arrival;
          // now every toggle row has one, so every row's pills line up by
          // default.
          //
          // The surface classes, the hover tint and the hover reporting all sit
          // on the wrapper, so the tint covers the row edge to edge and hovering
          // the info control still lights up the shelter's marker on the map.
          const row = (
            <div
              key={value}
              data-shelter-row={value}
              onPointerEnter={() => onHoverRow?.(value)}
              onPointerLeave={() => onHoverRow?.(null)}
              className={cn(
                // pr-2 only. The left inset moved onto the toggle, so the 8px
                // the row used to hold outside every control is inside the one
                // that answers a press there: the wrapper carries no onClick,
                // and padding that tinted under the pointer and showed a hand
                // cursor while doing nothing was promising a press it could not
                // take. What is left on this side is the gutter the info
                // control sits against, which is its own target's business.
                "flex w-full items-center gap-1 rounded-ui pr-2 transition-colors",
                // The cursor a disabled row shows over that gutter, said here
                // because the div is the only thing covering it. The dimming is
                // not here any more: it used to sit on this wrapper and took
                // the info control down with it, and that control is live on a
                // disabled row on purpose, since a row reading zero is exactly
                // the row whose details say why. It dims the toggle instead,
                // which is the part that is actually barred.
                //
                // Hover is the one that had to be taken away rather than
                // repeated: CSS :hover reaches a div whatever the disabled
                // button inside it does, so a dead row would have started
                // tinting under the pointer.
                disabled && "cursor-not-allowed",
                isHighlighted
                  ? "bg-muted/50"
                  : !disabled && "hover:bg-muted/50",
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
                className={cn(
                  // pl-2 is the row's left inset, held by the control that
                  // answers a press on it rather than by the wrapper around it.
                  // cursor-pointer because preflight gives every button the
                  // arrow cursor, not the hand. max-lg:min-h-11 is the 44px
                  // touch target, same rule as the link row above. The focus
                  // ring is drawn inside the button's own box, because the row
                  // leaves no room outside it; animal-card.tsx already uses an
                  // inset outline for the same reason.
                  "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-ui py-1.5 pl-2 text-left max-lg:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed",
                  // The dimming the wrapper used to do for the whole row.
                  disabled && "opacity-40",
                )}
              >
                {/* Always laid out, so selecting a row doesn't shift the list. */}
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    checked
                      ? "text-[var(--filter-accent-strong)]"
                      : "opacity-0",
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
                        "h-5 min-w-5 shrink-0 rounded-full px-1 text-2xs font-normal tabular-nums",
                        checked &&
                          "bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]",
                      )}
                    >
                      {countLabel ? (
                        <>
                          <span aria-hidden>{count}</span>
                          <span className="sr-only">{countLabel(count)}</span>
                        </>
                      ) : (
                        count
                      )}
                    </Badge>
                  </span>
                  {sublabel && (
                    <span className="block truncate text-2xs text-muted-foreground">
                      {sublabel}
                    </span>
                  )}
                </span>
              </button>

              {/* On every toggle row a caller has something to open for, picked
                or not: looking a shelter over before committing to it is the
                ordinary use, and the row's own click cannot serve it, because
                that click toggles. At every breakpoint, too. The control was
                lg-and-up once because the card it opened was max-lg:hidden;
                the panel it opens now is inline in the list and reads at every
                width, so gating it would take shelter inspection away from
                phones for no reason left standing.

                A disabled row keeps its control, at full strength. Its panel
                is measured against every animal in the shelter, never against
                the active filters, so a row reading zero is exactly the row
                whose details answer why, and dimming the one live control on
                that row along with the dead one was both a contrast failure
                and a lie about what could be pressed. The opacity sits on the
                toggle now. cursor-pointer is stated here because the wrapper
                hands down cursor-not-allowed over its gutter and this control
                is not the part that is barred.

                A shelter with nothing to say gets no control at all: see the
                hasDetails gate below, which is the same test the panel's fill
                is drawn behind.

                A chevron, not a circled i. The two glyphs promise different
                things: an i is the mark for a tip or a popover, something small
                that floats and goes away, and a chevron is the mark for a row
                that opens where it sits. This one opens where it sits, so an i
                on it mis-sold the press, and a caption above the list explaining
                what the i did was the price of that. The chevron needs no
                caption, which is the whole reason to prefer it.

                The glyph rotates, the box never moves. A wider open state was
                tried first, with the words next to the chevron, and the width
                for them came out of the shelter's own name: the row being read
                was the one row whose name truncated, worst in the sheet, and
                the count pill shifted under it as the panel opened. The words
                are worth saying, so they are said in the tooltip and in the
                accessible name, where they cost the row nothing. Never an X:
                the panel is part of the row, not a thing laid over it.

                Bare, with hover doing the rest. A border was tried to say
                "control", and it was only ever needed to prop up the i; a
                chevron at the end of a row already reads as one, and twelve
                bordered circles down a narrow list read as a second column of
                pills competing with the counts. */}
              {onToggleExpanded && hasDetails(summary) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        aria-label={
                          isExpanded
                            ? hideInfoLabel?.(label)
                            : infoLabel?.(label)
                        }
                        className={cn(
                          // max-lg:size-11 is the 44px touch target the toggle
                          // and the link row already take below lg, same rule and
                          // same breakpoint. The focus ring is inset for the same
                          // reason the toggle's is: the wrapper's padding leaves
                          // no room to draw it outside.
                          "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-ui transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] max-lg:size-11",
                          isExpanded
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-4" aria-hidden />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden />
                        )}
                      </button>
                    </CollapsibleTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={6}>
                    {isExpanded ? hideInfoText : infoText}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );

          // Nothing to open: the row is the whole item, exactly as it was before
          // any of this. Building a Collapsible around it would only add a div
          // between the list's grid and its cells.
          //
          // Two ways to have nothing to open, and the same answer to both. The
          // caller may not deal in details at all, or this one shelter may have
          // none: hasDetails is the same test the panel's own fill is drawn
          // behind, so a shelter with nothing to say now has no control offered
          // for it either, rather than a chevron that turns and reveals a blank
          // strip. It is the control that was lying, not the panel.
          if (!onToggleExpanded || !hasDetails(summary)) return row;

          return (
            <Collapsible
              key={value}
              open={isExpanded}
              onOpenChange={() => onToggleExpanded(value)}
              // The Collapsible is the grid cell now, holding the row and the
              // panel beneath it, so the span belongs here rather than on the
              // content. Between sm and lg the list is two columns, and a panel
              // squeezed into half of one would set the species chips and the
              // photo fan wrapping under a row that does not wrap. Spanning both
              // columns costs a reflow of the cells after this one for as long as
              // the panel is open, which is the cheaper of the two: the shelter
              // being read stays where it was and grows, and only the list under
              // it moves. lg:col-span-1 is the reset; the single-column grid
              // there would otherwise still be carrying sm:col-span-2.
              className={cn(isExpanded && "sm:col-span-2 lg:col-span-1")}
            >
              {row}
              <CollapsibleContent>
                {/* Inset to the label column, past the check glyph: 8px of the
                  toggle's own pl-2 plus the check's 14px puts the fill at 22px,
                  and the panel's px-2 then lands the content at 30px, exactly
                  where the shelter's name starts above it. The inset is doing
                  real work, not decoration. bg-muted/30 sits a hair under the
                  bg-muted/50 a hovered or map-highlighted row carries, and at
                  that distance a hovered row directly above an open panel would
                  read as one block; the left edge is what keeps them two
                  things. The separator says the same again for anyone who
                  cannot see the fill at all.

                  bg-muted/30 is also load-bearing for ShelterDetails: the photo
                  fan's ring is a color-mix of exactly this fill over the
                  picker's background, so an overlap cuts rather than haloes.
                  Change one and change the other. */}
                <div className="ml-5.5 border-t border-border/60 bg-muted/30 px-2 py-2">
                  <ShelterDetails summary={summary} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
