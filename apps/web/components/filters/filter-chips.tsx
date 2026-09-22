"use client";

import { ListFilter, PawPrint, Undo2, X } from "lucide-react";
import {
  AnimatePresence,
  domMax,
  m,
  useReducedMotion,
} from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import { useI18n } from "@/components/i18n-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CoatColorChipSwatch } from "@/components/filters/coat-cards";
import { useScrollEdgeFadesX } from "@/hooks/use-scroll-edge-fades";
import { FACET_ICONS, filterValueGlyph } from "@/lib/animal-icons";
import { jumpToFilterSection } from "@/components/filters/filter-section-header";
import { SECTION_OF_FACET } from "@/components/filters/use-filter-sections";
import { groupLabel, type FilterFacet } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import {
  SCROLL_STRIP,
  SCROLL_STRIP_MARK,
  scrollChildIntoViewX,
} from "@/lib/scroll-strip";
import { cn } from "@/lib/utils";

export type Chip = {
  key: string;
  /** Which of the nine questions set this. Drives the grouping, and the icon
   *  wherever the answer has no mark of its own. */
  facet: FilterFacet;
  /** The answer itself, as the filter stores it. Carried apart from the key
   *  because it is what picks the glyph: Samec and Samica are one facet and
   *  two symbols, and a row that drew the facet gave them one. */
  value: string;
  label: string;
  /** How many more animals show if this one comes off. Undefined when the
   *  answer was not worth a pass over the dataset; zero is a real answer. */
  gain?: number;
  onRemove: () => void;
};

/** Values in one facet past which the row shows a summary instead of every
 *  one. Two still fit and still say more than a count does. */
const COLLAPSE_AT = 3;

/** Chips past which the rest go behind a "+N". A bound on how tall the row
 *  can get, which is what the sticky header at lg is paying for: nine facets
 *  at two values each would otherwise be eighteen pills, wrapping to four
 *  lines of pinned chrome. The phone's in-flow row is not sticky and wraps
 *  narrower, so it passes a cap of its own (animal-filters.tsx). */
const MAX_VISIBLE = 8;

/** The same bound in flow, where a line is narrower and the pills are 44px
 *  tall rather than 28. Measured at 375px: five pills plus the "+N" is three
 *  lines, which is as much of the grid as a row above it may take. */
const FLOW_VISIBLE = 5;

/** Chips past which the sheet's Kje section shows a "+N" instead of the rest.
 *  The same bound the row above keeps, at the size a section can afford: three
 *  shelter names wrap to two lines on a phone and a fourth would push the
 *  first filter section under the fold. */
const SCOPE_VISIBLE = 3;

// Shared by all three shapes in the row, and by the removable chip the filter
// sheet's Kje section draws under its scope row.
//
// rounded-ui and not rounded-full. These sit in the same bar as the species
// tabs and do a closely related job -- pick a species, drop a filter -- and
// they were two different pill shapes eight pixels apart. The rule the rest
// of the app already half-followed is now the whole rule: rounded-ui is a
// thing you press, rounded-full is a count (the Filtri badge, the shelter
// row's tally, shelter-rows.test.tsx asserts it).
//
// On a coarse pointer the pill grows to hold a 44px target on its own rather
// than laying an invisible overlay over a 28px one: an overlay would reach
// past the pill's edge into the gap and steal the neighbour's first few
// pixels.
//
// The pointer and not the width. The width gate handed 44px to a 1024px
// laptop window, which is a mouse, and withheld it from a 1180px tablet,
// which is a thumb: measured there, every pill in this row was 28px.
//
// border-ring with the ring, because this shape has a border to move. The
// hand-rolled ring-2 was the odd one out against every primitive's ring-3.
//
// The colour is stated here and not by each shape, because on all three of
// them this line is the pill: a chip has no fill and no shadow, so the frame
// is the whole of what says a thing is there to be pressed. --border measured
// 1.26:1 against the bar in light mode and 1.47:1 in dark, which is a divider's
// strength; --control-border is 3.66:1 and 3.77:1, the 3:1 SC 1.4.11 asks of a
// boundary that identifies a control. The two shapes that mean something by
// their border still say it over this: the "+N" adds border-dashed and a
// marked pill takes --brand-border, which is 3.27:1 since the same audit.
//
// The height, the radius, the border and the coarse-pointer floor are the
// pill, whichever of the two shapes below is drawn; only the padding and where
// the ring is answered differ. Stated once, so a row that has already had to
// settle rounded-full against rounded-ui once does not get to drift again.
const CHIP_FRAME =
  "inline-flex h-7 shrink-0 items-center rounded-ui border border-control-border text-xs transition-colors pointer-coarse:min-h-11";

const CHIP_PILL = cn(
  CHIP_FRAME,
  "gap-1.5 px-2.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:px-3",
);

// The same pill with two controls in it, for the row beside a panel a filter
// can be gone back to. The label half goes to the section that set this
// filter; the cross takes it off, which is what the whole pill did and what
// the cross alone has always looked like it did.
//
// The padding and the ring move out of the shape and into the halves: each
// half carries its own, so pressing near an edge cannot land on the pill's
// own border rather than on either control, and the keyboard ring follows
// whichever half has focus (focus-within, since the shape is a span now).
//
// overflow-hidden and no radius on the halves: rounded-ui is one custom
// utility and there is no rounded-l-ui to pair it with, so the shape clips
// the hover fills to its own corners instead. A ring is drawn outside the box
// and is the element's own, so the clip never reaches it.
const CHIP_SPLIT = cn(
  CHIP_FRAME,
  "overflow-hidden focus-within:border-ring focus-within:ring-3 focus-within:ring-ring",
);

/** What both halves are: a box filling the pill's height, answering a pointer
 *  in its own half of it and nowhere else. */
const CHIP_HALF =
  "flex items-center self-stretch outline-none transition-colors hover:bg-muted";

/** The label half: everything the pill says, and the press that goes to it. */
const CHIP_JUMP = cn(CHIP_HALF, "min-w-0 shrink gap-1.5 pl-2.5 pr-1.5");

/** The cross half. Narrower than the label's, because it holds one 12px mark,
 *  and 44px wide on a finger.
 *
 *  Both halves take the pill's own coarse-pointer floor rather than splitting
 *  it. What that floor was won for still holds: the row used to draw a 24px
 *  circle inside a 28px pill with an invisible 44px overlay over it, and the
 *  fix was to make the pill itself the target, measured at 1180x820 where
 *  every pill in this row came to 28px (mobile-filter-hardening.test.tsx).
 *  Two controls in one pill is not that circle -- neither is an overlay, and
 *  neither overhangs its neighbour -- but a finger is owed 44px by whichever
 *  of them it lands on, so self-stretch gives both the pill's height and
 *  min-w-11 gives this one its width. */
//
// `group` on the half and not on the pill: the mark inside it darkens for a
// pointer on the cross, which is the control that mark belongs to. On the
// single-button shape the same class comes from CHIP_REMOVABLE, where the
// whole pill is that control.
const CHIP_CROSS = cn(
  CHIP_HALF,
  "group shrink-0 justify-center pl-1.5 pr-2.5 pointer-coarse:min-w-11 pointer-coarse:px-0",
);

/** The ground a pill takes while it is the one worth dropping. */
const CHIP_BLOCKED = "border-brand-border bg-brand text-brand-foreground";

// The look a pill wears when pressing it takes its filter off, which is every
// pill but the "+N".
const CHIP_REMOVABLE =
  "group bg-background text-foreground hover:border-brand-border hover:bg-muted active:bg-muted";

/** Where the row is drawn. The band is the sticky bar at lg; flow is under
 *  it on a phone (animal-filters.tsx). Everything the two do differently
 *  follows from this one answer, so it is asked once, here, rather than
 *  arriving as a boolean per difference. */
export type ChipRowPlacement = "band" | "flow";

/** The shape each placement gives the row.
 *
 *  `scrolls` is the whole of the difference underneath: a strip that scrolls
 *  sideways needs the edge fades, the mark a child is scrolled into view by,
 *  and the vertical room a 44px pill takes inside a box sized to 28px. In
 *  flow the row wraps into a page that already scrolls, so it needs none of
 *  them, and a second horizontal scroller under the species strip is the
 *  objection that kept this row off phones until now.
 *
 *  The band keeps the strip although it wraps from sm: measured at 1024px
 *  with nine pills it does not overflow at all, and at 200% text it overflows
 *  by 22px. The strip is what that case falls back on. */
const PLACEMENT: Record<
  ChipRowPlacement,
  {
    visible: number;
    scrolls: boolean;
    jumps: boolean;
    box: string;
    pills: string;
    pill?: string;
  }
> = {
  band: {
    visible: MAX_VISIBLE,
    scrolls: true,
    // Beside the panel, so a pill has a section to go back to and is drawn as
    // two controls. Below lg the filters are in a sheet the visitor opens
    // instead, there is nowhere to go, and the pill keeps the single press it
    // has always had over its whole 44px.
    jumps: true,
    // SCROLL_STRIP is the fade, the scroll padding that keeps a focused pill
    // out from under it, and the horizontal room the focus ring needs; the
    // couplings between those three are on the constant. The -my/py pair is
    // this row's own vertical half of it: it holds the pills' 44px, which the
    // scroll box would otherwise clip to its own content height.
    box: cn(
      SCROLL_STRIP,
      "min-w-0 pointer-coarse:-my-2.5 pointer-coarse:py-2.5",
    ),
    // w-max is the strip's own width, a row as wide as its content for the
    // strip to scroll. It wraps from sm, where there is width to wrap into.
    pills: "w-max sm:w-auto sm:flex-wrap",
  },
  flow: {
    visible: FLOW_VISIBLE,
    scrolls: false,
    jumps: false,
    // min-w-0 and nothing else: the box is as wide as the column and the
    // pills wrap inside it.
    box: "min-w-0",
    pills: "flex-wrap",
    // Narrows CHIP_PILL's own pointer-coarse:px-3. Measured at 375px, three
    // typical pills came to 110, 112 and 111 wide and missed one line by 6px.
    pill: "pointer-coarse:px-2.5",
  },
};

/** What every pill row wears at both placements. */
const PILL_ROW = "flex items-center gap-1.5 pointer-coarse:gap-2";

type Run = { facet: FilterFacet; chips: Chip[] };

type Item =
  | { id: string; kind: "chip"; chip: Chip }
  | { id: string; kind: "group"; run: Run }
  | { id: string; kind: "more"; hidden: number };

/** Marks a stop the arrow keys can land on, and the handle the row uses to
 *  find it again. A map of node refs would have been the other way, and it
 *  cannot be read where this row needs it: focus moves in a key handler and
 *  in an effect, both of which can ask the DOM directly. */
const STOP = "data-chip-stop";

function stopNode(toolbar: HTMLElement | null, id: string): HTMLElement | null {
  if (!toolbar) return null;
  return (
    [...toolbar.querySelectorAll<HTMLElement>(`[${STOP}]`)].find(
      (node) => node.getAttribute(STOP) === id,
    ) ?? null
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Hands focus to whatever comes after the row on the page.
 *
 *  For the one keystroke that takes the row away with it: taking off the last
 *  filter unmounts everything the keyboard was standing on, and focus fell to
 *  the body, which puts the next Tab back at the top of the document. What
 *  follows the row is the page the visitor was reading, which is where
 *  someone who has just dropped their last filter was heading anyway.
 *
 *  Only something that can take focus. In document order the first candidate
 *  after either row is not a card: after the phone's row it is BackToTop,
 *  which is inert until the page has scrolled two screens, and after the
 *  band's row at lg it is the phone row's own pill, which is display:none.
 *  focus() on either is a no-op, and the keystroke that reached here would
 *  have left focus on the body after all. Skipping them lands on the dock's
 *  Filtri button on a phone (measured at 375px) and on the first card at lg.
 *
 *  Read off computed display and not off getClientRects: jsdom lays nothing
 *  out, so every rect there is empty, while display:none is a stylesheet fact
 *  both can answer. */
function canTakeFocus(node: HTMLElement): boolean {
  if (node.closest("[inert]")) return false;
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    if (getComputedStyle(el).display === "none") return false;
  }
  return true;
}

function focusAfterRow(toolbar: HTMLElement | null): void {
  if (!toolbar) return;
  const next = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
    (node) =>
      !toolbar.contains(node) &&
      canTakeFocus(node) &&
      Boolean(
        toolbar.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );
  next?.focus();
}

export function FilterChips({
  chips,
  onClearAll,
  undo,
  stuck = false,
  placement = "band",
  className,
}: {
  chips: Chip[];
  onClearAll: () => void;
  /** Offered for a few seconds after a clear, in place of the chips it took
   *  away. Absent the rest of the time. */
  undo?: () => void;
  /** The filter state matches nothing. The row then names the chip that is
   *  costing the most, because it is the way out and the visitor has no other
   *  means of telling which of five pills is the one to drop. */
  stuck?: boolean;
  /** Which of the two mounts this is. Defaults to the band, which is the one
   *  that has always been here. */
  placement?: ChipRowPlacement;
  className?: string;
}) {
  const { locale, messages, t } = useI18n();
  const reduceMotion = useReducedMotion();
  const shape = PLACEMENT[placement];
  // Whether the row ends in its own clear-everything. The band's is the last
  // thing in the strip, after the pills it clears, at every result count. In
  // flow the sheet's footer holds a clear one tap away the whole time, so the
  // row spends a line on one only where clearing is the point of the screen.
  const clear = shape.scrolls || stuck;
  const scrollRef = useScrollEdgeFadesX<HTMLDivElement>();
  const toolbarRef = useRef<HTMLElement>(null);

  const [expanded, setExpanded] = useState<FilterFacet[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  /** Which stop takes focus once a keypress has removed a chip. Null when the
   *  removal came from a pointer, which leaves focus alone on purpose. */
  const refocusTo = useRef<string | null>(null);

  // Chips arrive in the order the panel asks its questions, and a facet's own
  // values in the order they were picked (toggle appends). Both are worth
  // keeping: the row reads as a smaller copy of the panel beside it, and two
  // visitors with the same filters see the same row. Ordering by when each
  // chip appeared instead would have made the row a private history, and it
  // is the scroll below, not the order, that decides whether a new chip is
  // somewhere the eye can find it.
  const runs: Run[] = [];
  for (const chip of chips) {
    const last = runs[runs.length - 1];
    if (last && last.facet === chip.facet) last.chips.push(chip);
    else runs.push({ facet: chip.facet, chips: [chip] });
  }

  // The chip whose removal buys the most, worked out only when nothing
  // matches. At any other time this is a hover-time answer (the tooltips
  // below); on screen permanently it would be five numbers competing with
  // five labels.
  const blocker = stuck
    ? chips.reduce<Chip | null>(
        (best, chip) =>
          (chip.gain ?? 0) > 0 && (chip.gain ?? 0) > (best?.gain ?? 0)
            ? chip
            : best,
        null,
      )
    : null;

  // Its facet unfolds, whatever the fold threshold says. A summary pill stands
  // for several answers at once, so marking one would point at three shelters
  // and say "drop this"; and it would have had to carry two different numbers,
  // the values it hides and the animals it costs, a pill's width apart.
  const unfolded = blocker ? [...expanded, blocker.facet] : expanded;

  const all = runs.flatMap((run): Item[] =>
    run.chips.length >= COLLAPSE_AT && !unfolded.includes(run.facet)
      ? [{ id: `group:${run.facet}`, kind: "group", run }]
      : run.chips.map((chip) => ({ id: chip.key, kind: "chip", chip })),
  );

  // The cap stands down while the row is naming a way out: the mark is only
  // worth drawing if it is on screen, and with nothing matching there are no
  // cards below for a taller row to push down.
  const hidden =
    showAll || blocker ? 0 : Math.max(0, all.length - shape.visible);
  const items: Item[] =
    hidden > 0
      ? [...all.slice(0, shape.visible), { id: "more", kind: "more", hidden }]
      : all;

  // Every stop the arrow keys walk, in the order they are drawn. Inline, clear
  // is one of them: it belongs to this row, and leaving it out would mean the
  // only way to reach it is to tab past every chip, which is the cost the
  // roving tabindex is here to remove. Without one, the stop must not be
  // listed either: a stop nobody renders takes the tabIndex 0 on an empty row
  // and hands focus nowhere.
  const stops = clear
    ? [...items.map((item) => item.id), "clear"]
    : items.map((item) => item.id);
  const activeId = focusId && stops.includes(focusId) ? focusId : stops[0];

  const count = chips.length;
  const stopsKey = stops.join("|");
  const blockerKey = blocker?.key ?? null;

  useEffect(() => {
    // A mark nobody can see is not a way out. With nothing matching, the row
    // uncaps itself and can run well past a phone's width, and the pill worth
    // pressing is as likely to be at the end of that as at the start.
    //
    // Nothing to bring into view when the row wraps: every pill it holds is
    // already on screen, and the box has no scrollLeft to write.
    if (!shape.scrolls || !blockerKey) return;
    scrollChildIntoViewX(stopNode(toolbarRef.current, blockerKey), {
      smooth: !reduceMotion,
    });
  }, [blockerKey, reduceMotion, shape.scrolls]);
  const chipsKey = chips.map((chip) => chip.key).join("|");
  const seenChips = useRef<string[]>([]);

  useEffect(() => {
    // A filter picked in the sheet lands in a row the sheet was covering. If
    // it landed past the right edge of a phone, the visitor closes the sheet
    // onto no visible evidence that anything happened. A wrapping row has no
    // right edge to land past, which is the whole of why the phone's row
    // wraps, so there is nothing for this to do there.
    //
    // One at a time only. A restored undo or a fresh page brings back several
    // at once, and there is no single one of those to point at. A chip folded
    // into a facet's summary has no stop of its own either; folding takes
    // three, so that facet has been standing on screen for two picks already.
    //
    // A page that opens on exactly one chip counts as one arrival, so this
    // fires on mount for a single-facet deep link. That is the case the helper
    // exists for: scrollIntoView would hand the visitor's first Tab press to
    // this pill's remove button (see lib/scroll-strip.ts).
    const keys = chipsKey === "" ? [] : chipsKey.split("|");
    const added = keys.filter((key) => !seenChips.current.includes(key));
    seenChips.current = keys;
    if (!shape.scrolls || added.length !== 1) return;
    scrollChildIntoViewX(stopNode(toolbarRef.current, added[0]), {
      smooth: !reduceMotion,
    });
  }, [chipsKey, reduceMotion, shape.scrolls]);

  // By id and not by position. A removed pill fades out before it is taken
  // out of the DOM, so counting nodes for a render or two after a removal
  // counts one that is on its way out; an id belongs to one pill only, and
  // the departing one's is no longer in `stops`.
  //
  // The id was chosen from the stops before the removal, and one of those can
  // go with it: the phone's row draws its clear only while nothing matches,
  // so taking off the pill that was blocking the results takes the clear
  // after it out of the row in the same render. The last stop left is the
  // fallback, which is the pill before the one removed.
  useEffect(() => {
    const id = refocusTo.current;
    if (id === null) return;
    refocusTo.current = null;
    const last = stops[stops.length - 1];
    const next =
      stopNode(toolbarRef.current, id) ??
      (last !== undefined ? stopNode(toolbarRef.current, last) : null);
    if (!next) return;
    setFocusId(next.getAttribute(STOP) ?? id);
    next.focus();
    // `stops` is read for the fallback only and follows stopsKey exactly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey]);

  if (count === 0 && !undo) return null;

  const focus = (id: string) => {
    setFocusId(id);
    stopNode(toolbarRef.current, id)?.focus();
  };

  /** Where focus goes once a chip the keyboard removed is gone.
   *
   *  Shared by the two keystrokes that can remove one: Delete or Backspace on
   *  the row, and Enter or Space on the pill itself. The second is a click as
   *  far as the DOM is concerned, so it used to take the pointer path and
   *  leave focus on the body, which puts the next Tab back at the top of the
   *  document. `at` is the removed chip's index in `stops`. */
  const restoreFocusAfterRemove = (at: number) => {
    if (count === 1 && !undo) {
      // This one takes the row with it. Move first, while there is still a
      // row to move out of.
      focusAfterRow(toolbarRef.current);
      return;
    }
    // The next pill along, or the one before it at the end of the row.
    // Inline, clear outlives every chip and is the stop after the last of
    // them; below, the row ends at the last pill, so the one before it is
    // the last stop this row has to offer.
    refocusTo.current = stops[at + 1] ?? stops[at - 1] ?? null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Where focus actually is, not where the last render thought it was.
    // These two part company the moment two keys arrive inside one task,
    // which is what an auto-repeating arrow key does: focus has already moved
    // and the state behind it has not, so every repeat after the first walked
    // from the same stale stop.
    const focused = document.activeElement?.getAttribute?.(STOP) ?? null;
    const at = stops.indexOf(focused && stops.includes(focused) ? focused : activeId);
    if (at === -1) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      focus(stops[(at + step + stops.length) % stops.length]);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focus(event.key === "Home" ? stops[0] : stops[stops.length - 1]);
      return;
    }
    // The row is an inventory of things to take off, so the keys that mean
    // "take this off" everywhere else mean it here too, without having to
    // land on a separate control first.
    if (event.key === "Delete" || event.key === "Backspace") {
      const item = items.find((candidate) => candidate.id === stops[at]);
      if (item?.kind !== "chip") return;
      event.preventDefault();
      restoreFocusAfterRemove(at);
      item.chip.onRemove();
    }
  };

  // Two pixels tighter per side when wrapping: at 375 three typical pills
  // measured 110, 112 and 111 wide at px-3 and missed one line by 6px.
  const pill = cn(CHIP_PILL, shape.pill);

  // Whether this placement offers a way back at all is the table's answer;
  // whether this facet has a section to go back to is SECTION_OF_FACET's.
  const jumpFor = (chip: Chip) => {
    const section = SECTION_OF_FACET[chip.facet];
    if (!shape.jumps || !section) return undefined;
    return () => jumpToFilterSection(section, !reduceMotion);
  };

  // "Show me all of these" belonged to a filter state that is about to stop
  // existing. Carried over, the next pills a visitor picks would arrive
  // already unfolded and uncapped for no reason they could see.
  const clearAll = () => {
    setExpanded([]);
    setShowAll(false);
    onClearAll();
  };

  const row = (
    <>
      {/* No caption below md: the pills are the caption, and the number that
          would sit here is already on the Filtri button in the dock, which is
          on screen the whole time and counts the same values. Two copies of
          one number cost this row thirty-four pixels of a track that had
          three hundred and thirty, on the screen with the least of it. Past
          md there is room for the words, so they come back.

          aria-hidden either way: the toolbar's own name below says the same
          thing, with the count, at every width. */}
      <span
        aria-hidden
        className="hidden shrink-0 text-xs text-muted-foreground md:inline"
      >
        {messages.activeFilters}
      </span>

      {/* min-w-0 in both shapes: the default shrink is what lets this box
          take the width it needs and no more. It used to be flex-1, which on
          a wide screen parked the clear a thousand pixels to the right of the
          last pill it clears, with the whole empty middle of the row between
          them. What the two shapes differ in is on PLACEMENT above. */}
      <div
        // Both only where there is a scroll: the hook masks whichever edge
        // still has content past it, and the mark says a child can be
        // scrolled into view in here. A wrapping box can do neither.
        ref={shape.scrolls ? scrollRef : undefined}
        {...(shape.scrolls ? { [SCROLL_STRIP_MARK]: "" } : {})}
        className={shape.box}
      >
        <div className={cn(PILL_ROW, shape.pills)}>
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item) => (
              <m.span
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="inline-flex"
              >
                {item.kind === "chip" ? (
                  <ChipButton
                    stop={item.id}
                    chip={item.chip}
                    blocked={blocker?.key === item.chip.key}
                    tabIndex={activeId === item.id ? 0 : -1}
                    onFocus={() => setFocusId(item.id)}
                    onRemove={(fromKeyboard) => {
                      if (fromKeyboard)
                        restoreFocusAfterRemove(stops.indexOf(item.id));
                      item.chip.onRemove();
                    }}
                    onJump={jumpFor(item.chip)}
                    className={shape.pill}
                  />
                ) : item.kind === "group" ? (
                  // The tooltip names what is folded away. Without it the only
                  // way to learn whether the shelter you picked is still on
                  // was to unfold the pill and fold it back.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        {...{ [STOP]: item.id }}
                        type="button"
                        tabIndex={activeId === item.id ? 0 : -1}
                        onFocus={() => setFocusId(item.id)}
                        onClick={() =>
                          setExpanded((open) => [...open, item.run.facet])
                        }
                        aria-label={t("expandFilterGroup", {
                          label: facetLabel(item.run.facet, locale, messages),
                        })}
                        className={cn(
                          pill,
                          "bg-background text-foreground hover:bg-muted",
                        )}
                      >
                        <ChipGlyph facet={item.run.facet} />
                        <span className="max-w-[11rem] truncate">
                          {item.run.chips[0].label}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          +{item.run.chips.length - 1}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">
                      {item.run.chips.map((chip) => chip.label).join(", ")}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    {...{ [STOP]: item.id }}
                    type="button"
                    tabIndex={activeId === item.id ? 0 : -1}
                    onFocus={() => setFocusId(item.id)}
                    onClick={() => setShowAll(true)}
                    aria-label={t("showMoreFilters", { count: item.hidden })}
                    // Dashed, because it is the one pill in the row that is
                    // not a filter: nothing comes off when it is pressed.
                    className={cn(
                      pill,
                      "border-dashed text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground",
                    )}
                  >
                    +{item.hidden}
                  </button>
                )}
              </m.span>
            ))}
          </AnimatePresence>

          {/* Inside the scroll, at the end of it, and that is the whole point
              in the toolbar row. Parked outside as a fixed column it reserved
              81 of the row's 358 pixels for a control that clears everything:
              the pills got 242px to say four things in, and the widest of them
              is 180px on its own. Scrolling past it costs nothing there,
              because it is one tap away in the sheet's footer the whole time.

              Nothing matching is the state that asks for it here rather than
              in the sheet: the sheet is the way back to the filters and this
              is the way out of them. The row that draws it then is the phone's
              wrapping one, so it ends the last line. In the scrolling row it
              sat at x 514 at 390px with four pills, with no visible sign the
              strip scrolled at all.

              A seam and not just a gap, so an overscroll flick that runs out
              of pills to eat meets a line rather than sliding straight into
              a clear-everything. Its own element and not a border-l on the
              button: a left border on a rounded box draws an arc, and on a
              phone, right where the fade leaves a half-drawn pill, that put
              two stray parentheses side by side.

              Both go together: the seam only means anything in front of the
              button it guards. */}
          {clear && (
            <>
              <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

              {/* "Filtre" names what this takes off, which is every pill it
                  sits among, against the removes that take one each. Not
                  "vse": the species is not a pill and a clear leaves it
                  standing (use-animal-filters.ts). */}
              <button
                {...{ [STOP]: "clear" }}
                type="button"
                tabIndex={activeId === "clear" ? 0 : -1}
                onFocus={() => setFocusId("clear")}
                onClick={clearAll}
                className="h-7 shrink-0 rounded-ui px-1.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground active:bg-muted focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:tap-target"
              >
                {messages.clearFilters}
              </button>
            </>
          )}
        </div>
      </div>

    </>
  );

  const toolbar = (
    <section
      ref={toolbarRef}
      role="toolbar"
      aria-orientation="horizontal"
      aria-label={
        count > 0 ? t("activeFiltersCount", { count }) : messages.filtersCleared
      }
      onKeyDown={count > 0 ? onKeyDown : undefined}
      className={cn("flex items-center gap-2", className)}
    >
      {count > 0 ? (
        row
      ) : (
        // Clearing is the only filter action that repeating the gesture
        // cannot undo, so it is the only one that leaves a way back. The
        // row holds its place for the few seconds this is offered, rather
        // than collapsing and then jumping the page a second time when
        // the offer expires.
        <UndoOffer onUndo={undo} />
      )}
    </section>
  );

  return (
    // domMax and not the domAnimation every other filter surface opens with:
    // layout animation lives only in the larger bundle, and it is what makes
    // the pills left of a removed one slide into its place instead of
    // teleporting. Measured at 169 bytes over domAnimation on this route,
    // because the projection engine it needs is already pulled in by
    // AnimatePresence elsewhere.
    <LazyMotion features={domMax}>
      <TooltipProvider>{toolbar}</TooltipProvider>
    </LazyMotion>
  );
}

/** The way back from a clear, drawn in place of the pills it took away. One
 *  offer at every width: the sticky toolbar's row at lg and the in-flow row
 *  below it are both this component (animal-filters.tsx), so neither can drift
 *  into a different offer, and a phone is not left with clearing as the one
 *  filter action it cannot take back. */
export function UndoOffer({
  onUndo,
  className,
}: {
  onUndo?: () => void;
  className?: string;
}) {
  const { messages } = useI18n();
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <ListFilter className="size-3.5" aria-hidden />
        {messages.filtersCleared}
      </span>
      <button
        type="button"
        onClick={onUndo}
        aria-label={messages.undoClearFilters}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-ui px-2 text-xs text-brand-strong outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:tap-target"
      >
        <Undo2 className="size-3.5" aria-hidden />
        {messages.undoClear}
      </button>
    </span>
  );
}

/** One removable pill, outside the toolbar row. The filter sheet's Kje section
 *  draws the picked shelters with it, which is the only way a phone has of
 *  taking one off without reopening the map.
 *
 *  It carries the shape and the glyph and nothing else. The row's own pills
 *  are stops on a roving tabindex, they can be marked as the one blocking the
 *  results and they answer a pointer with what dropping them would give back;
 *  none of that applies to three chips sitting under a section header. */
export function RemovableChip({
  chip,
  className,
}: {
  chip: Chip;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={chip.onRemove}
      aria-label={t("removeFilter", { label: chip.label })}
      className={cn(CHIP_PILL, CHIP_REMOVABLE, className)}
    >
      <ChipGlyph facet={chip.facet} value={chip.value} />
      {/* A shelter's full name is forty characters, so the pill truncates and
          the title and the aria-label keep the whole of it reachable. */}
      <span className="max-w-[11rem] truncate" title={chip.label}>
        {chip.label}
      </span>
      <X
        className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}

/** The pills under the sheet's scope row: what is picked, wrapping, with the
 *  tail behind a "+N" the way the toolbar row caps itself. */
export function RemovableChips({
  chips,
  className,
}: {
  chips: Chip[];
  className?: string;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  if (chips.length === 0) return null;

  const hidden = showAll ? 0 : Math.max(0, chips.length - SCOPE_VISIBLE);
  const shown = hidden > 0 ? chips.slice(0, SCOPE_VISIBLE) : chips;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {shown.map((chip) => (
        <RemovableChip key={chip.key} chip={chip} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          aria-label={t("showMoreFilters", { count: hidden })}
          // Dashed, because nothing comes off when it is pressed. Same mark
          // the toolbar row's own "+N" wears.
          className={cn(
            CHIP_PILL,
            "border-dashed text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground",
          )}
        >
          +{hidden}
        </button>
      )}
    </div>
  );
}

/** The pill's one mark. A fixed box whatever it holds, so every label in the
 *  row starts on the same line even where the glyph inside changes size to
 *  say something (the three paws of Velikost).
 *
 *  Accent-coloured, the same green a chosen card wears: it says "this is on"
 *  without turning nine pills into nine green blocks. */
function ChipGlyph({ facet, value }: { facet: FilterFacet; value?: string }) {
  const { Icon, className } =
    value === undefined
      ? { Icon: FACET_ICONS[facet], className: undefined }
      : filterValueGlyph(facet, value);
  return (
    <span className="grid size-[1.125rem] shrink-0 place-items-center text-brand-strong">
      {/* A colour chip shows the colour. Only where the chip names one value:
          a folded run of them is the facet speaking, and the palette mark is
          right for that. */}
      {facet === "coatColor" && value !== undefined ? (
        <CoatColorChipSwatch value={value} />
      ) : (
        /* 1.75, the same weight the species tabs draw at. This was 1.8, which
           is invisible on its own and exactly the kind of near-miss that makes
           a row of marks read as unresolved. */
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={className ?? "size-3.5"}
        />
      )}
    </span>
  );
}

function facetLabel(
  facet: FilterFacet,
  locale: "sl" | "en",
  messages: { health: string; goodWith: string; care: string },
): string {
  if (facet === "toggles") return messages.health;
  if (facet === "goodWith") return messages.goodWith;
  if (facet === "care") return messages.care;
  return groupLabel(facet, locale);
}

/** A click with no click count behind it came from the keyboard.
 *
 *  Enter and Space on a focused button dispatch a real click event, and the
 *  only thing separating it from a pointer's is `detail`, which counts presses
 *  and is 0 when there were none. What it buys is the difference between
 *  leaving focus where the pointer left it, which is what a mouse wants, and
 *  handing it on to the next pill, which is the only thing the keyboard can
 *  use once the pill it was standing on is gone. */
function fromKeyboard(event: { detail: number }): boolean {
  return event.detail === 0;
}

function ChipButton({
  stop,
  chip,
  blocked,
  tabIndex,
  onFocus,
  onRemove,
  onJump,
  className,
}: {
  stop: string;
  chip: Chip;
  blocked: boolean;
  tabIndex: number;
  onFocus: () => void;
  /** Takes the filter off, and says whether a keypress asked for it. */
  onRemove: (fromKeyboard: boolean) => void;
  /** Where this pill's filter was set, when there is a panel to go back to.
   *  Absent, the pill is the single remove button it has always been. */
  onJump?: () => void;
  /** What this placement adds to the pill, over whichever shape onJump picks.
   *  The shape itself is not passed in: which of the two is drawn is what
   *  onJump decides, and handing it a class for the other one is how the flow
   *  row's own narrowing came to be dropped on the floor. */
  className?: string;
}) {
  const { locale, t } = useI18n();
  const gain = chip.gain ?? 0;
  // What the marked pill draws, said as well as drawn. "Mačji dol +2 🐾" was a
  // number with nothing on screen to explain it and nothing in the accessible
  // name at all: the label stopped at the shelter, so a screen reader was told
  // the pill removes a filter and never told what removing it gives back.
  // Only on the marked pill, because it is the only one that draws the number;
  // every other pill says it in the tooltip below and nowhere else.
  const removeLabel = t("removeFilter", { label: chip.label });
  const removeName =
    blocked && gain > 0
      ? `${removeLabel}: +${animalCount(gain, locale)}`
      : removeLabel;
  const handleRemove = (event: MouseEvent<HTMLButtonElement>) =>
    onRemove(fromKeyboard(event));
  // No tooltip when there is nothing to add to the label. A pill that says
  // "Mlad" under a pointer, with a tooltip that says "remove Mlad", is a
  // second copy of what the cursor already implies.
  //
  // The marked pill is not that case, though it was excluded here as if it
  // were. It draws "+2" and a paw and nothing on the page says what either
  // means; the sentence the tooltip carries is the only place "the two animals
  // this brings back" is written. So it keeps it, and the number is in its
  // accessible name as well. Where the pill is two controls, the sentence
  // goes on the one it is about.
  const withGainTooltip = (control: ReactElement) =>
    gain > 0 ? (
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        <TooltipContent>
          {t("removeShowsMore", { count: animalCount(gain, locale) })}
        </TooltipContent>
      </Tooltip>
    ) : (
      control
    );

  const glyph = <ChipGlyph facet={chip.facet} value={chip.value} />;
  // A shelter's full name is forty characters. Untruncated, one of them filled
  // a phone's whole row and the rest of the filter state was off the end of
  // it. The title attribute keeps the full name reachable on a pointer, and
  // the button's own aria-label carries it regardless.
  const name = (
    <span className="max-w-[11rem] truncate" title={chip.label}>
      {chip.label}
    </span>
  );
  // The paw, because a bare "+1" in this row already means something else: a
  // folded facet's "+3" counts the values it stands for. This one counts
  // animals, and the paw is the mark the result count above uses for exactly
  // that.
  const gainMark = blocked && (
    <span className="inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums">
      +{gain}
      <PawPrint className="size-3" strokeWidth={2} aria-hidden />
    </span>
  );
  const cross = (
    <X
      className={cn(
        "size-3 shrink-0 transition-colors",
        blocked
          ? "text-brand-foreground"
          : "text-muted-foreground group-hover:text-foreground",
      )}
      strokeWidth={2}
      aria-hidden
    />
  );

  if (onJump) {
    return (
      <span
        className={cn(
          CHIP_SPLIT,
          className,
          blocked ? CHIP_BLOCKED : "bg-background text-foreground",
        )}
      >
        <button
          {...{ [STOP]: stop }}
          type="button"
          tabIndex={tabIndex}
          onFocus={onFocus}
          onClick={onJump}
          aria-label={t("showFilterSection", { label: chip.label })}
          // The row is walked with the arrows, so a screen reader announcing
          // "Delete" on arrival is what tells someone the key does anything
          // here. On this half, because this half is the stop.
          aria-keyshortcuts="Delete"
          className={CHIP_JUMP}
        >
          {glyph}
          {name}
          {gainMark}
        </button>
        {withGainTooltip(
          <button
            type="button"
            // Not a stop of its own. The row is walked with the arrows, one
            // press per pill, and Delete on the label half already takes the
            // filter off (the row's own key handler); a second stop per pill
            // would double the length of that walk to reach a key that works
            // from where focus already is.
            tabIndex={-1}
            onClick={handleRemove}
            aria-label={removeName}
            className={CHIP_CROSS}
          >
            {cross}
          </button>,
        )}
      </span>
    );
  }

  const button = (
    <button
      {...{ [STOP]: stop }}
      type="button"
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={handleRemove}
      aria-label={removeName}
      // The row is walked with the arrows, so a screen reader announcing
      // "Delete" on arrival is what tells someone the key does anything here.
      aria-keyshortcuts="Delete"
      className={cn(CHIP_PILL, className, CHIP_REMOVABLE, blocked && CHIP_BLOCKED)}
    >
      {glyph}
      {name}
      {gainMark}
      {/* Kept even on the marked pill. Every pill in this shape takes
          something off when pressed, and dropping the one mark that says so
          would have made the way out look like a different kind of control. */}
      {cross}
    </button>
  );

  return withGainTooltip(button);
}
