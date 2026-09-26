"use client";

import { Check } from "lucide-react";
import { cva } from "class-variance-authority";
import {
  AnimatePresence,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CollapsibleBody,
  FilterSectionHeader,
  SectionHint,
  type SectionCollapse,
  type SectionTone,
} from "@/components/filters/filter-section-header";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

/** A card is a row in the sidebar's one column, a tile in the sheet's three. */
export type FilterCardLayout = "sidebar" | "sheet";

/**
 * One shadcn-style surface contract for every compact filter choice. Geometry
 * stays with the caller; interaction, state and accessibility chrome do not.
 *
 * The surface is a variant rather than a class the caller appends, because cva
 * concatenates and does not merge. While the sidebar's treatment was a string
 * bolted on after the fact, the base's shadow-xs and the row's shadow-none
 * both stayed in the class list and the stylesheet decided between them:
 * Tailwind emits shadow-none before shadow-xs, so every sidebar row kept the
 * tile's resting box, and by the same alphabetical accident bg-transparent
 * outranked bg-brand, so a picked row lost its green fill. Sex and age kept
 * their fill only because ToggleGroupItem runs its className through cn(),
 * where toggleVariants' own accent outlived the merge.
 *
 * What makes the output safe is cn(). Every string this file builds runs
 * through it, so a collision between two of its own classes is settled by
 * position, the later one winning, rather than by the order Tailwind emits the
 * two utilities in, and cva lays the layout variant down before the compound
 * that answers it. A class spelled against an attribute sits outside that
 * arithmetic: tailwind-merge reads data-[state=on]:bg-brand and bg-brand as two
 * different keys, so anything an attribute selector sets has to be answered in
 * the same selector.
 *
 * The data-[state=...] and aria-pressed: repeats are not duplicates of the
 * plain classes beside them. ToggleGroupItem hands cn its own
 * data-[state=on]:bg-muted and toggleVariants its accent spelled against both
 * selectors, all ahead of this string; an attribute selector outranks a bare
 * utility, so the ones a row must not wear are overridden here by name. Both
 * spellings are needed: sex and age are toggle group items and carry
 * data-state, while plain buttons carry aria-pressed and nothing else.
 */
// touch-manipulation and select-none in the base: a tile is a bare button or a
// toggle item and inherits neither from ui/button. A tile that computes
// touch-action: auto keeps the double-tap window open, so two quick narrowings
// zoom the page instead, and a rapid press on a label starts a selection or
// raises the iOS callout over the sheet.
/**
 * What every filter control answers a press, the keyboard and a dead option
 * with, independent of whether it is drawn as a card.
 *
 * Pulled out of the cva because the colour palette is a filter control that
 * is not a card: it draws swatches in a grid rather than rows, so it cannot
 * take cardVariants, and hand-writing this string beside it drifted within a
 * day (0.97 against 0.98, a missing focus-visible border, and half opacity
 * on a dead option where DEAD_OPTION_CLASS deliberately keeps the ink).
 * Geometry and surface stay with the caller; this is the part that has one
 * right answer.
 */
export const FILTER_CONTROL_CLASS =
  "group touch-manipulation select-none rounded-ui outline-none transition-transform duration-150 active:scale-[0.98] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none";

const cardVariants = cva(
  "group relative min-w-0 touch-manipulation select-none overflow-hidden rounded-ui border font-normal outline-none transition-[border-color,background-color,box-shadow,color,transform] duration-150 active:scale-[0.98] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      layout: {
        sheet:
          "border-border/80 bg-background shadow-xs hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground active:bg-muted/40",
        // Border transparent rather than none, so the row keeps its 1px and
        // the text does not shift when a picked row draws its fill or a
        // focused one its ring. bg-transparent is the ground at rest, and the
        // selected compound below is what answers it.
        //
        // The aria-pressed and data-[state=on] repeats say the same thing as
        // the plain border-transparent and shadow-none beside them, in the two
        // selectors toggleVariants spells its own border and shadow in. They
        // belong to the layout and not to the state: a row has no box whether
        // it is picked or not.
        sidebar:
          "border-transparent bg-transparent shadow-none hover:border-transparent hover:bg-muted/40 hover:text-foreground active:bg-muted/40 aria-pressed:border-transparent aria-pressed:shadow-none data-[state=on]:border-transparent data-[state=on]:shadow-none",
      },
      // Colour only. What the card is standing on is the layout's business.
      selected: {
        true: "text-brand-foreground",
        false: "text-muted-foreground",
      },
    },
    // The fill a picked card wears, which is the one thing the two layouts
    // paint differently and the only thing selection decides. A resting card
    // needs no compound of its own: nothing upstream is spelled against
    // data-[state=off], so the layout's own ground stands unopposed.
    //
    // The tile answers :active by name as well, for the finger's sake. The
    // sheet layout's active:bg-muted/40 is a pseudo-class, which outranks a
    // bare bg-brand, and Chrome holds :active on a tapped tile until well
    // after the tap has landed: a plain-button tile's green started 258-276ms
    // after the tap on a 390px phone, where the toggle items' started at
    // 107-119ms. active:bg-brand here drops the grey from the class list by
    // position (cn), so the fill lands with the press whatever order the
    // stylesheet emits the two in.
    compoundVariants: [
      {
        layout: "sheet",
        selected: true,
        class:
          "border-brand-border bg-brand hover:border-brand-border hover:bg-brand active:bg-brand data-[state=on]:bg-brand",
      },
      {
        layout: "sidebar",
        selected: true,
        class:
          "bg-brand hover:bg-brand aria-pressed:bg-brand data-[state=on]:bg-brand",
      },
    ],
    defaultVariants: {
      layout: "sheet",
      selected: false,
    },
  },
);

/**
 * The tile is the default, so a caller outside the filters that wants the
 * plain card surface (the portal's choice cards) keeps its existing call.
 */
export function filterCardVariants(
  props?: Parameters<typeof cardVariants>[0],
): string {
  return cn(cardVariants(props));
}

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked. Nor is a pick the sidebar keeps once it comes off
// (`kept`, KeptPicks in filter-groups.tsx): a disabled row gives up keyboard
// focus, so the row the press or the focus was on stays live, to be picked
// again.
export function isDeadOption(
  count: number,
  checked: boolean,
  kept = false,
): boolean {
  return count === 0 && !checked && !kept;
}

/**
 * The dress a dead option wears, which is the filters' decision and not the
 * card's.
 *
 * The base cva carries disabled:opacity-50, and that is right where it came
 * from: the portal's choice cards are disabled while a save is in flight, and
 * half opacity is what a control being waited on looks like. Here disabled
 * means something else, and at half opacity the label measured 2.08:1, which
 * reads as a tile that failed to paint rather than as an answer the current
 * narrowing has none of. Under /?vrsta=pes four such rows were 160 of the
 * 243px the sidebar overflowed at 1280x720.
 *
 * So the label keeps the full muted ink, 5.54:1, which is a tile's resting ink
 * and the one a sidebar label steps back to from its foreground
 * (sidebarLabelInk), and the two things that are actually true of a dead
 * option are what say so: the count reads 0, and the box there would be
 * nothing to tick in is not drawn (group-disabled:hidden on
 * FilterSelectionMark). In the sidebar the row is usually not drawn at all;
 * see drawnOptions in filter-groups.tsx.
 *
 * It rides here rather than on the cva because the cva's default layout is the
 * tile and the portal calls it without one, so a variant or a compound would
 * have taken the portal's busy cards with it. This helper has no caller
 * outside the filters.
 */
export const DEAD_OPTION_CLASS = "disabled:opacity-100";

/**
 * Why the sidebar draws rows.
 *
 * The sheet draws tiles and the sidebar draws rows, and both wore the same
 * border, shadow and ground. In a column that already holds the map plate,
 * three or four more bordered boxes per section made the panel read as a
 * form: on the home page at 1440 the first screen was seventy-odd outlined
 * rectangles. A row is a line in a list. It keeps the icon, the drawn check
 * and the count, and it keeps the hover ground and the green fill when
 * picked, because those are states rather than furniture; only the box at
 * rest goes. The surface half of that lives in the layout variant above.
 *
 * Sex and size were the last two sections holding out as tiles, which left
 * the column saying "press me" in three different surfaces beside a grid of
 * borderless cards. They are rows here now and tiles in the sheet, like
 * everything else. What is left in the sidebar is rows and the map plate, and
 * the plate stays because it frames a picture.
 *
 * The row starts at 40px and grows when its label needs a second line. The
 * sidebar is lg-only; keeping its compact minimum leaves room for the other
 * sections without cutting off the words needed to choose a filter.
 *
 * Two answers, so they are two strings and not a cn() call per option. There
 * are about 28 options in the list and every one of them asks; below lg the
 * sidebar is mounted beside the sheet, so both lists ask on the same render.
 * DEAD_OPTION_CLASS rides in the literal rather than being merged in, which
 * keeps the dress a dead option wears in one place while the answer stays a
 * constant.
 */
const LAYOUT_CLASS: Readonly<Record<FilterCardLayout, string>> = Object.freeze({
  // justify-start, so every tile in a row starts its icon on the same line.
  // The tiles in a row stretch to the tallest one, and centred content moved
  // each tile's stack by half of whatever it lacked: at 320px "Nad 6 mesecev"
  // takes two lines and its hourglass sat 7.5px above the other two, and Lahko
  // ponudim's icons stepped the same way wherever one description took a
  // second line. A tile's own content is taller than min-h, so a row in which
  // nothing wraps lays out as it did.
  sheet: `${DEAD_OPTION_CLASS} min-h-[4.75rem] flex-col items-center justify-start gap-0.5 px-1.5 py-2 text-center`,
  // PAW_BOX_TOP in size-paw-cards.tsx is worked out from this py-1.5 and the
  // icon well's size-7.5: the room the size paw has to hop in.
  sidebar: `${DEAD_OPTION_CLASS} min-h-10 flex-row items-center justify-start gap-2.5 px-2.5 py-1.5 pr-9 text-left`,
});

export function filterCardLayoutClass(layout: FilterCardLayout): string {
  return LAYOUT_CLASS[layout];
}

function markClass(layout: FilterCardLayout): string {
  return layout === "sheet"
    ? "absolute right-1.5 top-1.5"
    : "absolute right-2.5 top-1/2 -translate-y-1/2";
}

function iconSizeClass(layout: FilterCardLayout): string {
  return layout === "sheet" ? "size-7" : "size-7.5";
}

/**
 * The temperament every filter control lifts with. Exported because the
 * colour palette lifts a bigger mark by a bigger amount and so cannot use
 * FilterCardHoverLift itself; it should still rise at the same speed, and
 * the numbers were sitting in two files.
 */
export const FILTER_HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

/**
 * Which way a count moved. A number that grows comes in from below and one
 * that shrinks comes in from above, so every count on the page, the row
 * counts here and the grid's total in ResultCount, moves one way for one
 * reason.
 */
export function countDirection(previous: number, next: number): -1 | 0 | 1 {
  return Math.sign(next - previous) as -1 | 0 | 1;
}

const COUNT_ROLL_DISTANCE = 6;
const COUNT_ROLL = { duration: 0.24, ease: "easeOut" } as const;

/** Where a number stands, as the transform string itself. */
function rollOffset(px: number): string {
  return px === 0 ? "none" : `translateY(${px}px)`;
}

// transform and not y. Motion runs y on the main thread, writing every
// rolling number on every frame, where a transform string and opacity are
// handed to the browser's own animations. A pick changes most of the counts
// on the page at once, over thirty in the phone sheet with every section
// open, so that is work worth keeping off the main thread.
const countRollVariants = {
  enter: (direction: number) => ({
    transform: rollOffset(direction * COUNT_ROLL_DISTANCE),
    opacity: 0,
  }),
  center: { transform: rollOffset(0), opacity: 1 },
  exit: (direction: number) => ({
    transform: rollOffset(-direction * COUNT_ROLL_DISTANCE),
    opacity: 0,
  }),
};

/** Whether the counts inside are drawn, and so worth rolling. */
const CountsDrawn = createContext(true);

/**
 * Lets the counts inside roll only while `query` matches, for a panel that
 * is mounted at every width and drawn at some. The sidebar is display:none
 * below lg, where the phone sheet stands in for it, and its counts rolled
 * there all the same: every pick on a phone started their animations and
 * swapped their numbers for nobody, which with every section open was close
 * to half the rolls a pick set off. Where the query does not match, a number
 * changes in place, as it does under reduced motion.
 *
 * A media query and not a measurement, because a roll is decided in the
 * render a pick makes and nothing may be read off the page there. A
 * component of its own, so the answer that arrives after hydration renders
 * the counts again and not the panel around them.
 */
export function CountsRollWhile({
  query,
  children,
}: {
  query: string;
  children: ReactNode;
}) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener("change", notify);
      return () => list?.removeEventListener("change", notify);
    },
    [query],
  );
  // Stable, so React asks it once per render and not again after commit.
  const matches = useCallback(
    () => window.matchMedia?.(query)?.matches ?? true,
    [query],
  );
  const drawn = useSyncExternalStore(subscribe, matches, () => true);
  return <CountsDrawn.Provider value={drawn}>{children}</CountsDrawn.Provider>;
}

/**
 * A changed number rolls rather than swapping in place, so the narrowing is
 * something you watch happen: the new one comes in from below when the
 * count grows and from above when it shrinks, the old one leaves the other
 * way, 6px each over 0.24s, and the two cross so that one of them is always
 * drawn.
 *
 * It keeps its own AnimatePresence, so the leaving number has a presence to
 * exit in and no parent's initial={false} decides whether the arriving one
 * rolls in.
 *
 * Both numbers share one grid cell while the old one leaves, rather than the
 * old one being popped out of the flow. The count then keeps the wider of
 * its two widths until the roll is over, so a number centred in a tile does
 * not jump sideways when a digit goes, and nothing is measured or restyled
 * in the commit a pick is waiting on. The cell clips, so the roll reads as a
 * number passing through its own line rather than across the label above.
 *
 * Still on first paint, where nothing narrowed, and still through
 * hydration: a link that restores its filters from the query changes every
 * count in the render that ends hydration, and those land where they belong
 * without a roll, as the grid's own count does (ResultCount). Under reduced
 * motion the number changes in place. The markup is the same in every case,
 * so what the server wrote is what the client hydrates.
 *
 * Memoised, because a section renders again for every press, hover and
 * celebration timer on any of its rows, and none of those change a number:
 * with a presence boundary of its own a count is no longer the cheapest thing
 * in the row to render, so it sits those renders out.
 *
 * Every caller already sits inside its own LazyMotion, so this reads
 * domAnimation from that context instead of opening a second one.
 */
export const CountRoll = memo(function CountRoll({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const drawn = useContext(CountsDrawn);
  const live = useHydrated();
  // Each roll is a new turn, and the turn is the number's key, so the one
  // leaving and the one arriving are two elements. A change that does not
  // roll keeps the turn and rewrites the number where it stands.
  const [roll, setRoll] = useState({
    value,
    turn: 0,
    direction: 0 as -1 | 0 | 1,
    live,
  });
  if (roll.value !== value || roll.live !== live) {
    const rolls =
      roll.value !== value && roll.live && drawn && !shouldReduceMotion;
    setRoll({
      value,
      live,
      turn: rolls ? roll.turn + 1 : roll.turn,
      direction: rolls ? countDirection(roll.value, value) : roll.direction,
    });
  }

  return (
    <span className={cn("inline-grid overflow-clip", className)}>
      {/* presenceAffectsLayout off for CollapsibleBody's reason: nothing here
          animates layout, and left on it hands the number a new presence
          context on every render. */}
      <AnimatePresence
        initial={false}
        custom={roll.direction}
        presenceAffectsLayout={false}
      >
        <m.span
          key={roll.turn}
          className="col-start-1 row-start-1"
          custom={roll.direction}
          variants={countRollVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={COUNT_ROLL}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
});

/**
 * "box" is a tick box, for a section whose answers add up. "dot" is the round
 * mark a single-choice section wears (SINGLE_CHOICE_GROUPS): Čaka na dom takes
 * one threshold at a time, and in tick boxes the second press quietly unticked
 * the first, which a box never does anywhere else in the panel.
 */
type SelectionShape = "box" | "dot";

/**
 * The box's colour change, in Motion's terms: duration-150 and Tailwind's
 * default curve, which is what the box's own transition class runs on. The
 * tick leaves on it so that the two leave together.
 */
const MARK_LEAVE = { duration: 0.15, ease: [0.4, 0, 0.2, 1] } as const;

/** How long the tick takes to appear once its delay is up. Exported for the
 *  sections whose celebration hold has to outlast it. */
export const MARK_APPEAR_DURATION = 0.14;

export function FilterSelectionMark({
  checked,
  className,
  // Lets a caller hold the check back until its own gesture has landed.
  appearDelay = 0,
  shape = "box",
}: {
  checked: boolean;
  className?: string;
  appearDelay?: number;
  shape?: SelectionShape;
}) {
  const shouldReduceMotion = useReducedMotion();
  const dot = shape === "dot";
  // The box fills when its tick arrives. It filled on the press while the tick
  // waited for the gesture, and a large paw's 0.42s left a solid green square
  // with nothing in it, which reads as a control stuck mid-state. The card's
  // own fill still answers the press at once. Only the way in waits, so a box
  // unticked during another card's gesture empties straight away.
  const fillDelay =
    checked && appearDelay > 0 && !shouldReduceMotion
      ? { transitionDelay: `${appearDelay}s` }
      : undefined;

  return (
    <LazyMotion features={domAnimation}>
      <span
        aria-hidden
        style={fillDelay}
        className={cn(
          // group-disabled:hidden, because a dead option has nothing to tick.
          // The card is the group, and a disabled card in the filters is one
          // the current narrowing has no animals for; see DEAD_OPTION_CLASS
          // for why the rest of that dress is not in the cva.
          //
          // motion-reduce:transition-none, because under reduced motion the
          // tick lands at once, and a box still easing its colour for 150ms
          // around no tick was ten frames of a solid box with nothing in it.
          "relative grid size-4.5 shrink-0 place-items-center border transition-[border-color,background-color] duration-150 group-disabled:hidden motion-reduce:transition-none",
          // The ink belongs to the shape and not to the state. It used to go
          // transparent with the box as well, so a leaving tick faded twice,
          // once by its own opacity and once by its colour, and was gone
          // while the box still had most of its fill: an unpick showed a
          // coloured box with nothing in it for three or four frames, and a
          // reset showed solid boxes without their ticks. The span inside
          // now does all the fading, on the box's own clock (MARK_LEAVE).
          //
          // The dot is the same ink as the filled box's ground, so the two
          // marks carry one accent. The tick is a token and not text-white,
          // because this is the one place the strong accent is a ground and
          // that ground is light in dark mode: a white tick on it measured
          // 2.39:1. See --brand-strong-foreground in globals.css.
          dot
            ? "rounded-full text-brand-strong"
            : "rounded-sm text-brand-strong-foreground",
          checked && dot
            ? // A ring and its dot rather than a filled disc, the shape a
              // single choice is read as.
              "border-brand-strong bg-background"
            : checked
            ? "border-brand-strong bg-brand-strong"
            : // The control tier, by name. This is the boundary of a control,
              // which is what --control-border is for, and it was spelled as
              // muted-foreground/80 ten lines from a token that says the same
              // thing: one tier, two spellings. It started at /40, where the
              // resting box measured 1.77:1 light and 2.11:1 dark against the
              // surface it stands on, which is a box nobody can see, and /80
              // took it to 3.65:1 and 5.20:1.
              //
              // border-control-border measures 3.66:1 and 3.77:1. Light is
              // unchanged and dark gives up 5.20:1 for 3.77:1, still over the
              // 3:1 SC 1.4.11 asks of a control's own boundary. No dark: half:
              // this span spells no dark border of its own, so the token's own
              // dark value stands.
              // The checked box is not affected; its tick is 7.37:1.
              "border-control-border bg-background",
          className,
        )}
      >
        {/* The way out runs on the box's clock, so at every frame the tick
            is as far gone as the fill around it and neither is left drawn
            without the other. It was 0.1s against the box's 0.15s. */}
        <m.span
          initial={false}
          animate={{
            opacity: checked ? 1 : 0,
            scale: checked ? 1 : 0.55,
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : checked
                ? {
                    duration: MARK_APPEAR_DURATION,
                    delay: appearDelay,
                    ease: "easeOut",
                  }
                : MARK_LEAVE
          }
        >
          {dot ? (
            <span className="block size-2 rounded-full bg-current" />
          ) : (
            <Check className="size-3" strokeWidth={2.6} />
          )}
        </m.span>
      </span>
    </LazyMotion>
  );
}

/**
 * The sheetColumns a section with this many answers asks for.
 *
 * The columns exist to fit several short labels side by side, so a section the
 * dataset answers only one facet of is a full-width tile rather than a third of
 * a row nothing is in. max is the section's own ceiling: three is for short
 * labels, and health and Lahko ponudim keep two for the line their tiles carry
 * under the label.
 *
 * The class names are written out rather than built, because Tailwind reads
 * this file as text and generates only what it can see.
 */
export function sheetColumnsFor(count: number, max: 2 | 3 = 3): string {
  if (max === 3 && count > 2) return "grid-cols-3";
  return count > 1 ? "grid-cols-2" : "grid-cols-1";
}

// The section frame every card group shares: its heading and reset, the line
// saying where the answers come from, and the grid the cards sit in. A
// collapse contract turns the heading into a disclosure trigger and moves the
// hint into its tooltip; without one the section always shows everything, as
// the mobile sheet needs.
export function FilterCardSection({
  label,
  hint,
  lead,
  hintId,
  active,
  onReset,
  resetAriaLabel,
  layout,
  collapse,
  sheetColumns = "grid-cols-3",
  tone,
  children,
  footer,
}: {
  label: string;
  hint?: string;
  /** What the rows answer, drawn above them on every surface. Unlike the
   *  hint it never folds into a tooltip, so it is for the one thing a
   *  section cannot be used without. */
  lead?: string;
  /** Names the hint, for rows that take it as their description. */
  hintId?: string;
  active: boolean;
  onReset: () => void;
  resetAriaLabel: string;
  layout: FilterCardLayout;
  collapse?: SectionCollapse;
  /** The sheet's columns, for a section whose labels are too long for three. */
  sheetColumns?: string;
  /** Set by a group drawn inside another section's body; see SectionTone. */
  tone?: SectionTone;
  children: ReactNode;
  /** What a section says about its cards once they are read together. */
  footer?: ReactNode;
}) {
  return (
    <section>
      <FilterSectionHeader
        label={label}
        active={active}
        onReset={onReset}
        resetAriaLabel={resetAriaLabel}
        collapse={collapse}
        hint={hint}
        tone={tone}
      />
      <CollapsibleBody collapse={collapse}>
        {hint && (
          <SectionHint collapse={collapse} id={hintId}>
            {hint}
          </SectionHint>
        )}
        {lead && <SectionHint>{lead}</SectionHint>}
        <LazyMotion features={domAnimation}>
          <div
            className={cn(
              "grid gap-1.5",
              layout === "sheet" ? sheetColumns : "grid-cols-1",
            )}
          >
            {children}
          </div>
        </LazyMotion>
        {footer}
      </CollapsibleBody>
    </section>
  );
}

/** The check, placed where the layout puts it. */
export function FilterCardMark({
  layout,
  checked,
  appearDelay,
  shape,
}: {
  layout: FilterCardLayout;
  checked: boolean;
  appearDelay: number;
  shape?: SelectionShape;
}) {
  return (
    <FilterSelectionMark
      checked={checked}
      appearDelay={appearDelay}
      shape={shape}
      className={markClass(layout)}
    />
  );
}

// The icon column: a halo that lights when the card is chosen, and whatever the
// section draws over it. appearDelay lets a section light the halo once its
// gesture lands; exitDelay lets a reset wink the cards out in order rather
// than all at once.
export function FilterCardIconWell({
  layout,
  checked,
  appearDelay = 0,
  exitDelay = 0,
  children,
}: {
  layout: FilterCardLayout;
  checked: boolean;
  appearDelay?: number;
  exitDelay?: number;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();
  const size = iconSizeClass(layout);

  return (
    <span
      aria-hidden
      className={cn("relative grid shrink-0 place-items-center", size)}
    >
      <m.span
        className={cn("absolute rounded-full bg-muted-foreground/10", size)}
        initial={false}
        animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.6 }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : checked
              ? {
                  type: "spring",
                  stiffness: 380,
                  damping: 26,
                  delay: appearDelay,
                }
              : { duration: 0.15, delay: exitDelay, ease: "easeOut" }
        }
      />
      {children}
    </span>
  );
}

/** The ring leaving the icon as the card is switched on. */
export function FilterCardRipple({
  layout,
  opacity,
  scale,
  duration,
}: {
  layout: FilterCardLayout;
  opacity: number;
  scale: number;
  duration: number;
}) {
  return (
    <m.span
      className={cn(
        "pointer-events-none absolute rounded-full border border-brand-strong",
        iconSizeClass(layout),
      )}
      initial={{ opacity, scale: 0.7 }}
      animate={{ opacity: 0, scale }}
      transition={{ duration, ease: "easeOut" }}
    />
  );
}

const WATERMARK_OPACITY = 0.08;
const WATERMARK_SCALE = 1.06;
/** How long a watermark takes to come in, unless its section says. Exported
 *  for the sections whose celebration hold has to outlast it. */
export const WATERMARK_APPEAR_DURATION = 0.3;
const WATERMARK_LEAVE_DURATION = 0.12;

/**
 * The mark a chosen tile keeps in its corner: the section's own drawing,
 * large and faint, clipped by the tile's overflow. The tile needs `isolate`,
 * so the mark's negative z-index stays above the tile's own background.
 *
 * Tiles only. A sidebar row is 40px tall with the tick in the room at its
 * right, and the mark sat a quarter under the tick, so the one control on the
 * row stood on a smudge; the row says "chosen" the way every other row does.
 *
 * A real initial, so a tile checked from the URL stamps its mark on load
 * instead of having it already there. The drawing keeps its own rotation;
 * this span owns the transform.
 */
export function FilterCardWatermark({
  layout,
  checked,
  appearDelay,
  appearDuration = WATERMARK_APPEAR_DURATION,
  exitDelay,
  className,
  children,
}: {
  layout: FilterCardLayout;
  checked: boolean;
  appearDelay: number;
  appearDuration?: number;
  /** The tile's turn in a reset. */
  exitDelay: number;
  className?: string;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();
  if (layout !== "sheet") return null;
  const away = shouldReduceMotion ? 1 : WATERMARK_SCALE;

  return (
    <m.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -bottom-2 -right-1.5 -z-10",
        className,
      )}
      initial={{ opacity: 0, scale: away }}
      animate={{
        opacity: checked ? WATERMARK_OPACITY : 0,
        scale: checked ? 1 : away,
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : checked
            ? { duration: appearDuration, delay: appearDelay, ease: "easeOut" }
            : {
                duration: WATERMARK_LEAVE_DURATION,
                delay: exitDelay,
                ease: "easeOut",
              }
      }
    >
      {children}
    </m.span>
  );
}

/** The lift a pointer or keyboard focus gives the icon. */
export function FilterCardHoverLift({
  hovered,
  children,
}: {
  hovered: boolean;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <m.span
      // No will-change here. A standing will-change keeps the icon on its own
      // compositor layer even at rest, and a layer whose box lands on a
      // fractional pixel is rasterized off the grid: the sidebar glyphs
      // rendered visibly soft at 1x. Motion promotes the layer for the
      // moments it is actually animating.
      className="relative flex items-center justify-center"
      initial={false}
      animate={{ y: hovered ? -1 : 0, scale: hovered ? 1.05 : 1 }}
      transition={shouldReduceMotion ? { duration: 0 } : FILTER_HOVER_SPRING}
    >
      {children}
    </m.span>
  );
}

/**
 * The voice a sidebar row sets its label in: 12px at lg and 14px from xl.
 *
 * From xl the rail is a card column, 285 to 291px beside cards whose names are
 * 18px and whose facts are 14px near-black (RESULTS_COLUMNS in
 * lib/card-grid.ts), and 12px grey labels were the smallest and lightest words
 * on that row. At lg the rail is still 224px and the step does not fit it.
 * With the rail's own 10px scrollbar a label has 96px there, and "Nad 6
 * mesecev" is 103px at 14px, the second line the count column's min-w-6 was
 * measured to take away; the lines a step below, at 12px, would break too
 * ("Zdravila, dieta ali pomoč" is 138px, under a label and count 128px wide).
 * So the whole step, count, descriptions and notes with it, waits for xl.
 *
 * Exported because the age rows cannot use FilterCardTail: that tail is a flex
 * line and the age row is a three-column grid, so it draws its own label and
 * count and borrows the sizes from here. Hand-copied they drifted, and Starost
 * printed 11px over 10px while every other section printed 12 over 11.
 */
const SIDEBAR_LABEL_TYPE = "text-xs xl:text-sm";
export const SIDEBAR_LABEL_CLASS = `truncate ${SIDEBAR_LABEL_TYPE}`;

/** One step under SIDEBAR_LABEL_TYPE, for what the sidebar prints beside and
 *  under its labels: counts, descriptions and notes. 11px in the 224px rail
 *  and 12px from xl. The sheet is never drawn from xl, so there it is 11px;
 *  NOTE_TYPE in filter-section-header.tsx is the size for words the sheet
 *  prints larger. */
export const SIDEBAR_NOTE_TYPE = "text-2xs xl:text-xs";

/**
 * The ink a sidebar label is drawn in. At rest that is the page's foreground
 * and not the muted grey it shared with its count. The count and a row's
 * description keep the grey, so the row still reads label first; the label
 * had been the same grey as the number beside it, lighter than the facts on
 * every card beside the rail. A chosen row's label takes the fill's ink from
 * the row, and only its weight from here.
 *
 * A dead row steps back to the grey (DEAD_OPTION_CLASS): a near-black label
 * beside a 0 and no box to tick reads as an answer to press.
 *
 * Exported for the age rows, which draw their own label (SIDEBAR_LABEL_CLASS).
 */
export function sidebarLabelInk(checked: boolean): string {
  return checked
    ? "font-medium"
    : "text-foreground group-disabled:text-muted-foreground";
}

/**
 * The resting voice of the count, per layout. Not exported: everything that
 * draws this number asks countClass below, which is what carries the chosen
 * state with it, and a caller reaching past that would print a number the
 * brand fill measures 4.45:1 against at 11-12px.
 *
 * In the sidebar it is one step under the label beside it: 11px at lg, where
 * the rail is 224px wide and can spend the step, and 12px from xl, where the
 * label is 14px (SIDEBAR_LABEL_TYPE). The sheet is a phone held at arm's
 * length, and 11px there was the smallest type on the page under a 12px label
 * it belongs to. The sheet's label is text-xs, so its step only stops the
 * count from sitting below the word it counts.
 *
 * The sidebar's column starts at min-w-6 and grows with its digits, in every
 * section. A fixed w-8 left the label 86px of a 214px row, and "Nad 6
 * mesecev" (88.5px) broke onto a second line. Three digits measure 23.3px at
 * 12px and 21.4px at 11px, so today's counts keep one column edge at both
 * sizes; a fourth measures 31.1px at 12px and widens the column into the
 * label's room rather than running into the mark. The flex tail adds
 * shrink-0, because a long label could otherwise squeeze the column back down
 * to its minimum.
 */
const SIDEBAR_COUNT_CLASS = `min-w-6 text-right tabular-nums text-muted-foreground ${SIDEBAR_NOTE_TYPE}`;

const SHEET_COUNT_CLASS = "text-xs tabular-nums text-muted-foreground";

/**
 * The count, in the voice its layout and its state ask for.
 *
 * The count was the one thing on a card that got less legible for being
 * chosen: both constants above are state-blind, so #6f6762 stood on the green
 * #d0eed6 fill at 4.45:1 in light mode at 11-12px, under the 4.5:1 that size
 * of text is held to. Dark passed at 6.14:1 and is not what this is for.
 *
 * A chosen count takes the fill's own ink at reduced strength: /80, which
 * measures 5.80:1 in light mode and clears AA at both sizes. One value covers
 * both surfaces. The sidebar wore /75 for a pass and it measured 5.06:1 light
 * and 6.93:1 dark, which is also clear, so the split was buying nothing but a
 * second number to keep. The label beside it stays the full token at 9.91:1,
 * so the count is still the quieter of the two and the row still reads label
 * first.
 *
 * One function, because three files draw this number: FilterCardTail for every
 * section that goes through it, and sex-cards.tsx, size-paw-cards.tsx and
 * age-growth-control.tsx for the ones that draw their own label and count.
 * Hand-copied, the sizes had already drifted twice.
 *
 * Four answers, resolved once at module scope rather than merged per option
 * per render, for the reason filterCardLayoutClass above states.
 */
const COUNT_CLASS: Readonly<
  Record<FilterCardLayout, Readonly<{ rest: string; chosen: string }>>
> = Object.freeze({
  sheet: Object.freeze({
    rest: SHEET_COUNT_CLASS,
    chosen: cn(SHEET_COUNT_CLASS, "text-brand-foreground/80"),
  }),
  sidebar: Object.freeze({
    rest: SIDEBAR_COUNT_CLASS,
    chosen: cn(SIDEBAR_COUNT_CLASS, "text-brand-foreground/80"),
  }),
});

export function countClass(layout: FilterCardLayout, checked: boolean): string {
  return COUNT_CLASS[layout][checked ? "chosen" : "rest"];
}

/**
 * The line under a label that says which animals the option shows, for a
 * section whose labels cannot say it alone (Lahko ponudim). One step below
 * the label and in the count's ink, so on a chosen card it stays legible on
 * the fill for the same reason the count does.
 */
const DESCRIPTION_CLASS: Readonly<
  Record<FilterCardLayout, Readonly<{ rest: string; chosen: string }>>
> = Object.freeze({
  sheet: Object.freeze({
    rest: "line-clamp-2 max-w-full text-2xs leading-snug text-muted-foreground",
    chosen: "line-clamp-2 max-w-full text-2xs leading-snug text-brand-foreground/80",
  }),
  sidebar: Object.freeze({
    rest: `leading-snug text-muted-foreground ${SIDEBAR_NOTE_TYPE}`,
    chosen: `leading-snug text-brand-foreground/80 ${SIDEBAR_NOTE_TYPE}`,
  }),
});

// The label and count after the icon. The count is a render prop because a
// section may animate it, and its class comes from the layout either way.
// A description, where a section has one, goes under the label and leaves
// the label, the count and the tick where every other section has them.
export function FilterCardTail({
  layout,
  label,
  checked,
  renderCount,
  description,
  descriptionId,
  descriptionAfterCount = false,
}: {
  layout: FilterCardLayout;
  label: string;
  checked: boolean;
  renderCount: (className: string) => ReactNode;
  description?: string;
  /** Lets the card name the description as its aria-describedby. */
  descriptionId?: string;
  /** On a tile, draw the line under the count rather than over it. For a
   *  line that carries a number of its own ("Brez podatka: 121"): over the
   *  count it put two bare numbers one above the other, and a tile read
   *  "Otroke, 121, 2". The sidebar keeps the count on the label's line, so
   *  there the order is the same either way. */
  descriptionAfterCount?: boolean;
}) {
  const said =
    description === undefined ? null : (
      <span
        id={descriptionId}
        className={DESCRIPTION_CLASS[layout][checked ? "chosen" : "rest"]}
      >
        {description}
      </span>
    );

  if (layout === "sheet") {
    const count = renderCount(countClass(layout, checked));
    return (
      <>
        {/* line-clamp-2, not truncate: at 320px in two columns a label like
            "Sterilizacija" clips to a couple of letters on one line, and the
            tile is tall enough (min-h-[4.75rem]) to hold a second line. */}
        <span
          className={cn(
            "mt-0.5 line-clamp-2 max-w-full text-xs leading-tight",
            checked && "font-medium",
          )}
        >
          {label}
        </span>
        {!descriptionAfterCount && said}
        {count}
        {descriptionAfterCount && said}
      </>
    );
  }

  // One shape whether a description is drawn or not. The line used to come
  // back bare without one and wrapped with one, and a row's description
  // comes and goes with the other filters (Zdravje and Doma imam name their
  // unanswered animals only while there are enough of them), so each change
  // put the count in a new parent and remounted it: the number swapped in one
  // frame instead of rolling. The column holding a lone line lays out as the
  // line did.
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
        <span
          className={cn(
            SIDEBAR_LABEL_TYPE,
            "min-w-0 whitespace-normal leading-tight",
            sidebarLabelInk(checked),
          )}
        >
          {label}
        </span>
        {/* Only a flex item can be squeezed by a long label, so shrink-0
            rides with this line rather than with the voice the age grid
            shares. */}
        {renderCount(cn(countClass(layout, checked), "shrink-0"))}
      </span>
      {said}
    </span>
  );
}
