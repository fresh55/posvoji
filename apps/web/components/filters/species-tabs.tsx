"use client";

import type { TargetAndTransition, Transition } from "motion/react";
import {
  LazyMotion,
  animate,
  domAnimation,
  m,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type SpeciesFilter } from "@/lib/filters";
import { SPECIES_TAB_ORDER, type SpeciesTab } from "@/lib/species";
import { useI18n } from "@/components/i18n-provider";
import { useOneShotCelebration } from "@/components/filters/use-filter-motion";
import { cn } from "@/lib/utils";

// The row scrolls sideways, so the fade needs a left/right mask; the shared
// fade-scroll utility only builds a top/bottom one for vertical lists (see
// filter-sidebar.tsx), so this is its horizontal counterpart, kept local
// since only this row needs it. A container that fits gets no mask at all.
const EDGE_SLACK_PX = 8;

const LABELS: Record<"sl" | "en", Record<SpeciesFilter, string>> = {
  sl: { all: "Vse", dog: "Psi", cat: "Mačke", other: "Ostale" },
  en: { all: "All", dog: "Dogs", cat: "Cats", other: "Other" },
};

// The dark pill travels between tabs instead of being repainted on the new
// one, and it travels on measured numbers rather than on layout projection.
// Projection is the domMax bundle, about 10KB more than domAnimation, and
// this row has exactly one element that moves.
//
// Stiff enough to settle in roughly 250ms, and damped hard because the width
// is animated too: a width that overshoots does not read as a spring, it
// reads as a pill that missed.
const SLIDE_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 40,
  mass: 0.7,
} as const;

// lucide's own path data for the three tab icons, copied out of lucide-react
// 1.31.0 so the outline can be inked in stroke by stroke; a lucide component
// draws in one piece and gives nothing to animate. The tab keyed "other"
// wears the rabbit for the reason SPECIES_TAB_ICONS gives: the bucket is
// rabbits today, and a paw print would repeat the mark "Vse" already spends.
//
// An upgrade that redraws one of these icons has to be noticed rather than
// left to drift, so species-tabs.test.tsx compares this table against the
// lucide components it was copied from.
const SPECIES_GLYPHS: Record<SpeciesTab, string[]> = {
  dog: [
    "M11.25 16.25h1.5L12 17z",
    "M16 14v.5",
    "M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309",
    "M8 14v.5",
    "M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5",
  ],
  cat: [
    "M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z",
    "M8 14v.5",
    "M16 14v.5",
    "M11.25 16.25h1.5L12 17l-.75-.75Z",
  ],
  other: [
    "M13 16a3 3 0 0 1 2.24 5",
    "M18 12h.01",
    "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3",
    "M20 8.54V4a2 2 0 1 0-4 0v3",
    "M7.612 12.524a3 3 0 1 0-1.6 4.3",
  ],
};

type Beat = {
  /** What the glyph does, as keyframes on the svg itself. */
  keyframes: TargetAndTransition;
  /** Only the parts of the timing that differ per species. The delay and the
   *  duration are shared, so they are named once where the beat is used. */
  transition: Transition;
  /** Where the gesture pivots, in the svg's own box. Every one of them is
   *  hinged at the feet, because that is where these animals meet the row. */
  originX: number;
  originY: number;
};

// One gesture per species, small enough to read at 16px: the dog cocks its
// head, the cat stretches, the rabbit takes a hop. Tweens throughout, which
// is the rule the rest of the filter motion keeps as well: a list of more
// than two keyframes is a tween's to run, never a spring's.
const BEATS: Record<SpeciesTab, Beat> = {
  dog: {
    keyframes: { rotate: [0, -14, -14, 0] },
    transition: {
      times: [0, 0.3, 0.5, 1],
      ease: ["easeOut", "linear", "easeInOut"],
    },
    originX: 0.5,
    originY: 0.9,
  },
  cat: {
    keyframes: { scaleY: [1, 1.16, 0.97, 1], scaleX: [1, 0.94, 1.02, 1] },
    transition: { times: [0, 0.45, 0.75, 1], ease: "easeOut" },
    originX: 0.5,
    originY: 1,
  },
  other: {
    // The rise and the squash run on one clock, so the landing is the frame
    // the hop ends on rather than a second gesture queued behind it.
    keyframes: {
      y: [0, -4, 0, 0],
      scaleY: [1, 1.04, 0.9, 1],
      scaleX: [1, 0.98, 1.08, 1],
    },
    transition: {
      times: [0, 0.45, 0.8, 1],
      ease: ["easeOut", "easeIn", "linear"],
    },
    originX: 0.5,
    originY: 1,
  },
};

// The outline inks in first and the gesture starts before it has finished, so
// the two are one beat rather than two things in a queue.
const DRAW_DURATION = 0.28;
const BEAT_DELAY = 0.2;
const BEAT_DURATION = 0.55;
// The celebration state is what holds the glyph away from rest, so it clears
// a frame or two after the slowest tail, which is 0.2 + 0.55.
const BEAT_MS = 850;

// Nothing to subscribe to: the answer changes exactly once, when React swaps
// the server snapshot for the client one at the end of hydration.
const subscribeToHydration = () => () => {};
const hydratedOnClient = () => true;
const hydratedOnServer = () => false;

type Box = { left: number; top: number; width: number; height: number };

function sameBox(a: Box, b: Box) {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** A tab's icon, drawn from lucide's paths rather than from lucide's
 *  component so the outline can be inked in and the whole glyph moved.
 *
 *  At rest these are plain paths and the svg is doing nothing, which is what
 *  keeps the icon identical to the one the rest of the site draws. A beat is
 *  a remount, keyed on the celebration below: every icon here is whole at
 *  rest, so there is no second layer to fade in the way the sex glyphs need,
 *  and starting over from `initial` is the whole restart. */
function SpeciesGlyph({
  tab,
  beatId,
}: {
  tab: SpeciesTab;
  /** The celebration running on this tab, or null when it is at rest. */
  beatId: number | null;
}) {
  const beat = BEATS[tab];

  return (
    <m.svg
      key={beatId ?? "rest"}
      aria-hidden
      viewBox="0 0 24 24"
      width="24"
      height="24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ originX: beat.originX, originY: beat.originY }}
      animate={beatId === null ? undefined : beat.keyframes}
      transition={
        beatId === null
          ? undefined
          : { delay: BEAT_DELAY, duration: BEAT_DURATION, ...beat.transition }
      }
    >
      {SPECIES_GLYPHS[tab].map((d) =>
        beatId === null ? (
          <path key={d} d={d} />
        ) : (
          // All of them at once. Drawing an animal part by part turns a beat
          // into an assembly; the sweep is what the tap earns.
          <m.path
            key={d}
            d={d}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DRAW_DURATION, ease: "easeOut" }}
          />
        ),
      )}
    </m.svg>
  );
}

export function SpeciesTabs({
  value,
  onChange,
  counts,
  roster,
  disabled = false,
  fullWidth = false,
}: {
  value: SpeciesFilter;
  onChange: (species: SpeciesFilter) => void;
  /** What each tab shows: the dataset counted with every filter applied
   *  except species, so the number is what pressing the tab gives you. */
  counts: Record<SpeciesFilter, number>;
  /** Which tabs exist at all, counted over the whole dataset. Separate from
   *  `counts` because a filter may empty a tab without deleting it; see the
   *  strip's own note below. Required rather than falling back to `counts`:
   *  the fallback silently turns a faceted count into a roster, which is the
   *  bug the two fields exist to prevent. */
  roster: Record<SpeciesFilter, number>;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const tabs: { value: SpeciesFilter; label: string }[] = [
    { value: "all", label: LABELS[locale].all },
    ...SPECIES_TAB_ORDER.map((value) => ({
      value,
      label: LABELS[locale][value],
    })),
  ];

  // An empty dataset keeps all tabs (disabled); otherwise a species the
  // dataset does not hold disappears rather than leading to zero results.
  //
  // The roster and not the count. These used to be one number, and the moment
  // the count became faceted they had to part: narrowing to "samica" empties
  // Ostale on a dataset whose only rabbit is male, and an empty tab that
  // vanishes takes the way back to the other species with it. A tab reading 0
  // is not a dead end, it is the honest price of the current filters and it
  // stays pressable; the empty state on the other side carries the way out.
  const drawn = tabs.filter(
    ({ value: tab }) => disabled || tab === "all" || roster[tab] > 0,
  );

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A deep link (?vrsta=ostale) can mount straight into the active tab, and
    // if that tab sits past the fold of a scrolled 320px row the visitor never
    // sees what is selected. Nudge it into view whenever the selected tab
    // changes -- on mount for the deep-link case, and again for a later or
    // programmatic selection -- without stealing the page's own scroll
    // position: "nearest" on both axes only moves the horizontal strip, it
    // never scrolls the page to bring the row itself into view.
    // jsdom (unit tests) has no scrollIntoView; guarded rather than polyfilled
    // everywhere just for this one effect.
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);

  // Where the fill is, as four motion values rather than as state. A slide is
  // a new position every frame, and state would be a render of the whole row
  // every frame; motion values are also why the measuring below can run after
  // every render without setting anything React has to answer for.
  const fillX = useMotionValue(0);
  const fillY = useMotionValue(0);
  const fillWidth = useMotionValue(0);
  const fillHeight = useMotionValue(0);
  /** Which tab the fill was last measured for, so a re-measure can tell a
   *  move from a resize. Null until the first one, and again whenever the
   *  pressed species leaves the roster. */
  const filledRef = useRef<SpeciesFilter | null>(null);
  /** The box last written to those values, which is the target of a slide
   *  rather than wherever the spring has got to. */
  const boxRef = useRef<Box | null>(null);

  const measure = useCallback(
    (moveTo: SpeciesFilter | null) => {
      const button = activeRef.current;
      if (!button) {
        // The pressed species left the roster, so there is no pill for the
        // fill to sit under. Zero width takes it off the row without moving
        // it anywhere, and forgetting the box makes the next tab that does
        // have a pill jump into place rather than slide out of nowhere.
        fillWidth.jump(0);
        filledRef.current = null;
        boxRef.current = null;
        return;
      }

      const moved =
        moveTo !== null &&
        filledRef.current !== null &&
        filledRef.current !== moveTo;
      if (moveTo !== null) filledRef.current = moveTo;

      // offsetLeft and offsetTop are already in the container's coordinates,
      // because the container is the offsetParent, and an absolutely
      // positioned child of a scroll box scrolls with its contents. So the
      // fill needs no scroll correction of its own.
      const box = {
        left: button.offsetLeft,
        top: button.offsetTop,
        width: button.offsetWidth,
        height: button.offsetHeight,
      };
      // Most renders through here move nothing: a scroll repaints the edge
      // fade, a beat's state clears, a count comes back the same width. The
      // write would be cheap, but writing mid-slide is not, because jumping
      // lands the pill before the spring has finished carrying it.
      if (!moved && boxRef.current && sameBox(boxRef.current, box)) return;
      boxRef.current = box;

      fillY.jump(box.top);
      fillHeight.jump(box.height);
      // The slide is the only thing here that animates. A first measurement,
      // a resize and reduced motion all put the fill where it belongs in one
      // frame.
      if (moved && !shouldReduceMotion) {
        animate(fillX, box.left, SLIDE_SPRING);
        animate(fillWidth, box.width, SLIDE_SPRING);
      } else {
        fillX.jump(box.left);
        fillWidth.jump(box.width);
      }
    },
    [fillHeight, fillWidth, fillX, fillY, shouldReduceMotion],
  );

  // After every render and not on a dependency list. The roster, the counts
  // and the locale all move the tabs without changing which one is pressed,
  // and a fill left at the previous tab's width is the one wrong thing this
  // row can draw.
  useLayoutEffect(() => {
    measure(value);
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [edgeFade, setEdgeFade] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setEdgeFade({
        left: el.scrollLeft > EDGE_SLACK_PX,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_SLACK_PX,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => el.removeEventListener("scroll", update);
    }
    const observer = new ResizeObserver(() => {
      update();
      measure(null);
    });
    observer.observe(el);
    // The tabs as well as the row. A font swapping in changes how wide every
    // pill is without changing the row, and the fill is drawn from a pill.
    for (const tab of el.querySelectorAll("button")) observer.observe(tab);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [drawn.length, measure]);

  // The fill is measured off the DOM, so the prerendered HTML has no place to
  // put it: drawn there it would be a dark pill at the left edge under Vse,
  // whichever tab the link asked for. Until the first client render the
  // active tab therefore keeps carrying its own background, and the fill
  // takes the job over from there.
  //
  // The filters are restored from the URL just after hydration too, so a deep
  // link either mounts the fill under the restored tab or slides it there in
  // the first frames. Either is the row coming alive on load. A frame with a
  // pressed tab and nothing under it is not.
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    hydratedOnClient,
    hydratedOnServer,
  );

  const { celebration, celebrate } = useOneShotCelebration<SpeciesTab>(BEAT_MS);

  return (
    // domAnimation and not domMax: see SLIDE_SPRING. LazyMotion draws no
    // element of its own, so the scroll box below stays the tabs' parent.
    <LazyMotion features={domAnimation}>
      {/* Five tabs plus the sheet trigger don't fit a 375px phone, and
          wrapping cost a second row on a bar that is pinned to the top the
          whole time. Scrolling keeps it one row tall at every width, in
          fullWidth mode too: flex-1 tabs still overflow a 320px sheet once
          their labels are long enough, so the strip needs the same
          scroll-and-fade escape hatch. */}
      <div
        ref={scrollRef}
        style={{
          maskImage: `linear-gradient(to right, ${
            edgeFade.left ? "transparent, black 1.5rem" : "black"
          }, ${edgeFade.right ? "black calc(100% - 1.5rem), transparent" : "black"} 100%)`,
        }}
        className={cn(
          // The vertical padding is what the tabs' touch overlays live in.
          // Scrolling sideways makes this a scroll box in both axes, and a
          // scroll box clips at its padding edge, so without the padding the
          // overlays are cut back to the height of the pills. The matching
          // negative margin keeps the row occupying its old height.
          //
          // relative because the fill is measured against this box and
          // positioned inside it.
          "relative flex min-w-0 gap-1 overflow-x-auto no-scrollbar max-lg:-my-2 max-lg:py-2",
          fullWidth && "w-full",
        )}
      >
        {/* First, so that every tab is a later positioned sibling and paints
            over it. Out of flow, so it takes no place in the row and no gap
            with it. The row's own mask clips it at the edges, which is the
            same thing the mask does to the pill it is standing in for. */}
        {hydrated && (
          <m.span
            aria-hidden
            data-slot="species-fill"
            className="pointer-events-none absolute left-0 top-0 rounded-ui bg-foreground"
            style={{
              x: fillX,
              y: fillY,
              width: fillWidth,
              height: fillHeight,
            }}
          />
        )}
        {drawn.map(({ value: tab, label }) => (
          <button
            key={tab}
            ref={value === tab ? activeRef : undefined}
            type="button"
            onClick={() => {
              // Vse never beats: it is the way back rather than a species,
              // and it has no animal to move. Pressing the tab that is
              // already pressed does not beat either, because nothing was
              // chosen; it still reports the choice, as it always has.
              if (tab !== "all" && tab !== value && !shouldReduceMotion) {
                celebrate(tab);
              }
              onChange(tab);
            }}
            disabled={disabled}
            aria-pressed={value === tab}
            // The pill stays 28px tall so the toolbar row keeps its height.
            // Below lg, which is the only place this copy of the tabs is
            // shown, the tap target grows to 44px around it. min-w-0 plus a
            // truncating label is what stops a long name from forcing the
            // flex-1 tab wider than the row has room for.
            className={cn(
              // opacity-50 and ring-3, which is what buttonVariants and
              // badgeVariants both use. This was the only disabled step in the
              // codebase at 40, and the only pressable thing in the bar with
              // no ring of its own at all.
              // px-2/gap-1 and not px-2.5/gap-1.5. The strip already ran 18px
              // past a 375px phone before Vse carried a number, and a number
              // is about 30 more. Tightening every tab buys back roughly what
              // the new one costs, so the strip overflows no further than it
              // did and "Ostale" is no worse off.
              // relative to put the tab above the fill: both are positioned,
              // and of two positioned siblings the later one paints on top.
              "relative inline-flex min-w-0 items-center justify-center gap-1 rounded-ui px-2 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50 max-lg:tap-target",
              // fullWidth tabs need to shrink (and truncate) before the row
              // is allowed to overflow; the fixed toolbar copy never shrinks,
              // since a squeezed icon-only pill there would misread as a
              // different species.
              fullWidth ? "flex-1 py-1.5" : "shrink-0",
              // The colours are timed against the fill, and a transition is
              // read off the state being moved to, so each state carries its
              // own rather than sharing one above. Arriving, the label waits
              // for the fill to be under it before it turns light; leaving,
              // it darkens at once, while the fill is still sliding off it.
              value === tab
                ? cn(
                    "text-background transition-colors duration-150 delay-100 motion-reduce:delay-0",
                    // Before hydration there is no fill, so the tab is still
                    // its own background. See `hydrated` above.
                    !hydrated && "bg-foreground",
                  )
                : "text-muted-foreground transition-colors duration-100 hover:text-foreground",
            )}
          >
            {tab !== "all" && (
              <SpeciesGlyph
                tab={tab}
                beatId={
                  celebration && celebration.value === tab
                    ? celebration.id
                    : null
                }
              />
            )}
            <span className="min-w-0 truncate">{label}</span>
            {/* The species tabs answer "what is there" before they are
                pressed, and Vse now answers it too.

                It went without a number for as long as there was a separate
                result count beside the strip, because the two were one total
                written twice. Faceting settled which of them to keep: the
                count could only ever be this strip's sum, or the pressed
                tab's own number, so it was never saying anything the tabs did
                not. The tabs kept the numbers and the count gave up its row
                (animal-filters.tsx). On the Mačke tab, "Vse 22" is the one
                that earns its place: it says what going back gives, which is
                the same promise every other tab here makes.

                No opacity step on top of it: globals.css documents this exact
                trap next to --muted-foreground -- opacity-60 over an already
                muted tone measures 2.46:1, under AA for 12px text, so the
                token is used whole and stays quieter by contrast with the
                label alone, not by fading further past it. */}
            {!disabled && (
              <span className="shrink-0 text-xs tabular-nums">
                {counts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>
    </LazyMotion>
  );
}
