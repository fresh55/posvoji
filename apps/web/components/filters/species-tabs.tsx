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
import {
  CAT_GLYPH,
  DOG_GLYPH,
  RABBIT_GLYPH,
} from "@/components/filters/animal-glyph-paths";
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
//
// Not for the bundle: filter-chips.tsx already opens domMax on this route and
// measured it at 169 bytes over domAnimation, because AnimatePresence pulls
// the projection engine in anyway. The reason is what projection does at
// runtime. It gives every participating element a projection node and
// re-measures it as the tree changes, and this strip is mounted twice at once
// (a desktop copy and a phone copy, one of them display:none) inside a
// horizontal scroll box. Two numbers on one element ask nothing of the tree.
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

// The tab keyed "other" wears the rabbit because the bucket is rabbits today,
// and a paw print would repeat the mark "Vse" already spends.
//
// The geometry itself is shared (animal-glyph-paths.ts): the "dobro z" cards
// draw the same dog and the same cat, and one data module is what keeps the
// two in step. An upgrade that redraws one of these icons has to be noticed
// rather than left to drift, so species-tabs.test.tsx compares that module
// against the lucide components it was copied from.
const SPECIES_GLYPHS: Record<SpeciesTab, readonly string[]> = {
  dog: DOG_GLYPH,
  cat: CAT_GLYPH,
  other: RABBIT_GLYPH,
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
// a frame or two after the slowest tail. Derived rather than written down, so
// that retuning the beat above cannot leave the hold behind it.
const BEAT_MS = Math.round((BEAT_DELAY + BEAT_DURATION) * 1000) + 100;

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
  const paths = SPECIES_GLYPHS[tab];

  // A plain svg while nothing is happening, and not an m.svg holding still.
  // Six of these sit on the page at rest (three species, two mounted copies),
  // and a motion element costs a visual element and a resolved origin each
  // even when it is animating nothing. The key below remounts the glyph for a
  // beat anyway, so there is nothing to carry across the swap.
  if (beatId === null) {
    return (
      <svg
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
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }

  const beat = BEATS[tab];

  return (
    <m.svg
      key={beatId}
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
      animate={beat.keyframes}
      transition={{
        delay: BEAT_DELAY,
        duration: BEAT_DURATION,
        ...beat.transition,
      }}
    >
      {/* All of them at once. Drawing an animal part by part turns a beat
          into an assembly; the sweep is what the tap earns. */}
      {paths.map((d) => (
        <m.path
          key={d}
          d={d}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DRAW_DURATION, ease: "easeOut" }}
        />
      ))}
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
    activeRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
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

  // The pressed tab, and how many tabs there are to press. Everything else
  // that moves a pill moves its box too, which is what the ResizeObserver
  // below is watching for: a count going from 99 to 100, a locale swapping
  // every label, a font arriving late. Those all reach the fill through the
  // observer, whose callback runs after layout and before paint, so the fill
  // never draws a frame at the old width.
  //
  // Without a dependency list this read runs after every render of a row that
  // re-renders on scroll, and reading offsetLeft on a render that changed
  // text forces a layout flush of the whole page, 500-card grid included,
  // once per mounted copy.
  useLayoutEffect(() => {
    measure(value);
  }, [measure, value, drawn.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [edgeFade, setEdgeFade] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const left = el.scrollLeft > EDGE_SLACK_PX;
      const right =
        el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_SLACK_PX;
      // Same answer, same object. This fires on every frame of a touch scroll
      // and on every resize of every tab, and a fresh object would re-render
      // the whole row each time even though the mask is unchanged.
      setEdgeFade((current) =>
        current.left === left && current.right === right
          ? current
          : { left, right },
      );
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
          // What that costs a caller below lg: the padding and the margin
          // cancel, so this box draws 44px and measures 28px from outside.
          // A block parent the margins collapse through stands at 44; a flex
          // parent measures the 28 and the row loses 16px. The below-lg
          // toolbar turns flex only from md for exactly this reason
          // (animal-filters.tsx). Giving the box its own below-lg height
          // instead would free every caller of it, and is the fix if a second
          // caller ever needs the strip in a flex row.
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
            className={cn(
              "pointer-events-none absolute left-0 top-0 rounded-ui bg-foreground",
              // The tabs fade to half when there is no dataset, and the fill
              // used to be part of the pressed tab, so it fades with them.
              disabled && "opacity-50",
            )}
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
                : // The muted pill under a hovered tab is the one the quiet
                  // triggers in the same row already draw: the shelter picker
                  // beside them is a ui/button outline wearing
                  // QUIET_TRIGGER_CLASS (toolbar-trigger.ts), and both the
                  // outline and the ghost variant wash to bg-muted on hover.
                  // Darkening the ink alone left the tabs as the only
                  // pressable things in the toolbar that answered a pointer
                  // with no ground at all. The resting look is unchanged:
                  // there is still nothing drawn under a tab until the pointer
                  // is on it.
                  //
                  // It cannot fight the sliding fill. The fill travels on boxes
                  // measured from the buttons (fillX/fillWidth above) and a
                  // background changes no box, and the tab it is travelling to
                  // is the pressed one, which takes the branch above and has no
                  // hover ground to put over it while it arrives.
                  "text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground",
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
