"use client";

import { ChevronDown, Info } from "lucide-react";
import {
  AnimatePresence,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-context";
import { scrollChildIntoViewY } from "@/lib/scroll-strip";
import { cn } from "@/lib/utils";

/** Everything a section needs to fold: whether it is open, how to flip that,
    the short text a closed header shows so an active filter never disappears
    with its cards, and the id tying the header to the body it controls. */
export type SectionCollapse = {
  open: boolean;
  onToggle: () => void;
  summary: string | null;
  contentId: string;
};

/** The panel's section-heading voice. The sheet's sort caption borrows it on
 *  purpose, so the one row that is not a filter section still reads as one
 *  (filter-sheet.tsx). */
export const SECTION_LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

/**
 * A heading inside another section's body.
 *
 * Videz is the first section with parts: Barva and Dolžina dlake are one
 * topic and fold together, but each keeps its own reset and its own sentence
 * saying where its answers come from. Printed in the caption voice above, all
 * three headings came out identically and the column read as three peers
 * rather than a section with two halves. Sentence case at the same size is
 * the whole difference, which is enough: nothing else in the panel is
 * unfolded and not uppercase.
 */
/**
 * The casing is the whole difference, and a button resets text-transform and
 * letter-spacing on its own, so the disclosure trigger has to be told the
 * same thing separately. One constant per tone, read by both, rather than
 * the rule written once as a class string and once as a ternary.
 */
const TONE_CASE = {
  section: "uppercase tracking-wide",
  part: "normal-case tracking-normal",
} as const;

/** Whether a heading names a section of the panel or a part inside one. */
export type SectionTone = keyof typeof TONE_CASE;

function sectionLabelClass(tone: SectionTone = "section"): string {
  return cn("text-xs font-medium text-muted-foreground", TONE_CASE[tone]);
}

const BODY_EASE = [0.16, 1, 0.3, 1] as const;
/** The fold runs 0.3s; a section opened by its heading is measured once it
 *  has settled (revealOnOpen below). */
const FOLD_SETTLE_MS = 350;

// The clip exists for the fold alone. A settled body lets focus rings and
// tooltips spill past its box again, so overflow is hidden while the body
// grows or shrinks and visible once it has finished opening.
//
// "hidden" is in the open target too, where it looks as if it said nothing:
// the body starts clipped and stays clipped while it grows. It makes the
// value a motion value as the open starts. transitionEnd writes through
// Motion's setTarget, and for a key that is not a motion value yet that
// records the value and schedules no render (VisualElement.addValue, Motion
// 13.2). So a section opened in the sidebar and then left alone kept
// overflow: hidden on the page, and its rows lost the focus ring down both
// sides, until an unrelated render wrote the value out; a pick anywhere in
// the panel did, which is why the clip came and went.
const FOLDED = { height: 0, opacity: 0, overflow: "hidden" } as const;
const OPENED = {
  height: "auto",
  opacity: 1,
  overflow: "hidden",
  transitionEnd: { overflow: "visible" },
} as const;

/** The folding half shared by sidebar and sheet. Without a collapse contract
    the body stays open with no disclosure id, as plain lists require. */
export function CollapsibleBody({
  collapse,
  children,
}: {
  collapse?: SectionCollapse;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();
  const open = collapse?.open ?? true;
  // The body drawn in the fold's first render is already there: a section
  // does not fold itself open on first paint, not while the sidebar hydrates
  // and not while the sheet slides up. Every body after it unfolds, including
  // this section's own once it has been folded. Adjusted during render rather
  // than in an effect, the way CountRoll keeps its turn.
  //
  // Said on the body, and not as the presence's initial={false}. Motion hands
  // that to every motion element under the fold, and PresenceChild memoises it
  // for as long as the body stays, so anything mounted in the section later
  // (the pick ripple, Doma imam's faces, the count roll) counted as present at
  // first paint too and was written straight to the end of its mount
  // animation. initial={false} on the body reaches the body and nothing under
  // it.
  const [openedAtMount, setOpenedAtMount] = useState(open);
  if (openedAtMount && !open) setOpenedAtMount(false);

  return (
    <LazyMotion features={domAnimation}>
      {/* presenceAffectsLayout off, because nothing in a section body animates
          its layout: the fold is a height tween, not a layout projection. Left
          on, Motion hands the body a new presence context on every render,
          and every motion component in the section renders again with it, a
          memoised one included. That was the whole panel's icons redrawn on
          each filter press, in the render the press's first frame waits for. */}
      <AnimatePresence presenceAffectsLayout={false}>
        {open ? (
          <m.div
            key="body"
            id={collapse?.contentId}
            initial={openedAtMount ? false : FOLDED}
            animate={OPENED}
            exit={FOLDED}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    height: { duration: 0.3, ease: BODY_EASE },
                    opacity: { duration: 0.2, ease: "easeOut" },
                  }
            }
          >
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}

// The voice a section explains itself in when the words are drawn: the hint
// and the lead above the rows, the notes under them. 12px in the sheet, 11px
// in the sidebar. The two sizes are one decision about column width and not
// two tastes: the sidebar is a 224px column beside the grid, while the sheet
// is a phone held at arm's length, where 11px was the smallest type on the
// page. The sheet is below lg and the sidebar only from it, so the width gate
// says which one this is.
const NOTE_CLASS = "text-xs leading-snug text-muted-foreground lg:text-2xs";

/** The hint sentence a section keeps under its header. A folding section moves
    the hint into the header tooltip, which a touch screen cannot open, so
    coarse pointers keep the sentence in the body; a section that never folds
    keeps it visible outright. The id lets the section's rows take it as
    their description, which a hidden hint still gives. */
export function SectionHint({
  collapse,
  id,
  children,
}: {
  collapse?: SectionCollapse;
  id?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      className={cn(
        "mb-2",
        NOTE_CLASS,
        collapse && "hidden [@media(pointer:coarse)]:block",
      )}
    >
      {children}
    </p>
  );
}

/** A line under a section's rows, saying what they leave out or what a pick
    does with it (unanswered-note.tsx). */
export function SectionNote({ children }: { children: ReactNode }) {
  return <p className={cn("mt-2", NOTE_CLASS)}>{children}</p>;
}

// Focus walks the headers with the arrow keys, as an accordion is expected to.
const NAVIGATION_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

function moveSectionFocus(event: KeyboardEvent<HTMLButtonElement>) {
  if (!NAVIGATION_KEYS.includes(event.key)) return;
  // The aside on desktop, the drawer's content on a phone: the sheet folds
  // its sections too now, and inside the drawer there is no aside to find,
  // so the walk used to end silently on the first arrow press there.
  const container = event.currentTarget.closest(
    'aside, [data-slot="drawer-content"]',
  );
  if (!container) return;
  const triggers = [
    ...container.querySelectorAll<HTMLButtonElement>("h3 button[aria-expanded]"),
  ];
  const index = triggers.indexOf(event.currentTarget);
  if (index < 0) return;
  const target =
    event.key === "ArrowDown"
      ? (triggers[index + 1] ?? triggers[0])
      : event.key === "ArrowUp"
        ? (triggers[index - 1] ?? triggers[triggers.length - 1])
        : event.key === "Home"
          ? triggers[0]
          : triggers[triggers.length - 1];
  event.preventDefault();
  if (!target) return;
  // The panel moves first, and the page only by what the panel cannot do. A
  // plain focus() scrolls every box it must to show a heading, the window
  // included, and it centres: measured at 1440x900 from the top of the page,
  // the second press down from Spol threw the window 480px and the site's
  // title and the top of the grid went with it. scrollChildIntoViewY says why
  // the panel is scrolled by hand.
  //
  // The section where it fits, then the heading itself. The heading's box
  // stands past its section's by the -my-1 that centres it on the row, so
  // brought in by its section alone the focused heading lost the edge of its
  // ring along the panel's edge.
  target.focus({ preventScroll: true });
  scrollChildIntoViewY(target.closest("section") ?? target);
  scrollChildIntoViewY(target);
  revealInWindow(target);
}

// The room kept between a heading brought into the window and its edge.
const WINDOW_MARGIN = 8;

/**
 * The window's share of bringing a focused heading into view: the least
 * scroll that shows it, and nothing when it already shows.
 *
 * At the top of the page the sticky panel hangs below the window with only a
 * few dozen pixels of scroll of its own (62 at 1440x900, 27 at 1280x720), so
 * the panel alone left every heading from Energija down (from Videz at
 * 1280x720) focused under the window's bottom edge, where a keyboard visitor
 * could not see it. The nearest block, not the centre focus() would take, so
 * the page moves by the height of a heading rather than by half a screen.
 *
 * jsdom answers 0 for the window's height; there is nothing to measure there.
 */
function revealInWindow(element: HTMLElement) {
  const height = document.documentElement.clientHeight;
  if (height === 0) return;
  const { top, bottom } = element.getBoundingClientRect();
  if (bottom > height - WINDOW_MARGIN) {
    window.scrollBy({ top: bottom - height + WINDOW_MARGIN });
  } else if (top < WINDOW_MARGIN) {
    window.scrollBy({ top: top - WINDOW_MARGIN });
  }
}

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]";

/** The first control of the section a reset belongs to, other than the reset
    itself: where a header that does not fold hands focus after a keyboard
    reset. A disabled row, an inert or hidden subtree and a stop taken out of
    the tab order are passed over, since focus could not stay on any of them. */
function firstControlOfSection(reset: HTMLElement): HTMLElement | null {
  const section = reset.closest("section");
  if (!section) return null;
  return (
    [...section.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      (element) =>
        element !== reset &&
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest('[inert], [aria-hidden="true"]'),
    ) ?? null
  );
}

/** Shared section heading and reset affordance for every filter group. With a
    collapse contract the heading becomes the disclosure trigger; a hint rides
    along as an info mark whose text opens on hover or focus. */
export function FilterSectionHeader({
  label,
  active,
  onReset,
  resetAriaLabel,
  collapse,
  hint,
  className,
  tone = "section",
}: {
  label: string;
  active: boolean;
  onReset?: () => void;
  resetAriaLabel?: string;
  collapse?: SectionCollapse;
  hint?: string;
  className?: string;
  tone?: SectionTone;
}) {
  const { messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  // A closed section trades the reset link for the summary chip; opening it
  // brings the reset back.
  const showReset = !!onReset && active && (collapse ? collapse.open : true);

  // Cards revealed below the sidebar's own scroll fold are cards nobody sees,
  // so an opened section pulls itself into view once it has finished growing.
  const revealOnOpen = (event: MouseEvent<HTMLButtonElement>) => {
    if (!collapse || collapse.open) return;
    const section = event.currentTarget.closest("section");
    if (!section) return;
    window.setTimeout(() => {
      if (!section.isConnected) return;
      scrollChildIntoViewY(section, { smooth: !shouldReduceMotion });
    }, FOLD_SETTLE_MS);
  };

  // The disclosure trigger, where a reset pressed from the keyboard leaves
  // focus. Null in a header that does not fold.
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The reset goes inert in the render its own press causes, and an inert
  // element cannot hold focus: a reset pressed with Enter or Space dropped
  // focus to the page's body (in the sheet, to the drawer), and a screen
  // reader lost its place with it. A click the keyboard made, which is what
  // detail 0 means, hands focus to the section's own heading instead: it
  // names the section just emptied and sits one Tab above its rows. A header
  // that does not fold has no heading to press, so the first control in its
  // section takes it (the Kje picker, a part's first option). A pointer press
  // moves nothing; the pointer is where the visitor already is.
  const reset = (event: MouseEvent<HTMLButtonElement>) => {
    onReset?.();
    if (event.detail !== 0) return;
    const target =
      triggerRef.current ?? firstControlOfSection(event.currentTarget);
    target?.focus({ preventScroll: true });
  };

  // Kept mounted while hidden so a reset that comes and goes fades rather than
  // shifting the row. A section with no reset at all has nothing to fade, and
  // an inert copy of the word would be one more node for nothing.
  const resetButton = onReset ? (
    <Button
      type="button"
      variant="link"
      size="xs"
      onClick={reset}
      // One expression for both halves of being unreachable; see
      // back-to-top.tsx for why this is not aria-hidden beside its own
      // tabIndex={-1}. The pointer is already gone below when !showReset, so
      // inert takes nothing this button still had.
      inert={!showReset}
      aria-hidden={!showReset}
      aria-label={resetAriaLabel}
      className={cn(
        // text-xs below lg and text-2xs from it, the same one decision the
        // hint above states: 11px is a 224px column's size, not a phone's.
        "h-auto text-xs font-normal text-muted-foreground transition-opacity hover:text-foreground lg:text-2xs",
        !showReset && "pointer-events-none opacity-0",
        // 53x19 drawn, and the one press that undoes a whole section. Two
        // shapes, because the two placements differ. In the sheet's Kje row,
        // the one caller with a reset and no collapse contract
        // (location-scope-row.tsx), this sits in the header's flex row and
        // takes the overlay; the sheet's filter sections fold now and take the
        // absolute branch below with its 44px coarse floor. A folding section's
        // header is a positioned row and the button is absolute inside it, and
        // `tap-target` sets position: relative, which would fight that; there
        // the drawn box is grown instead, which costs the row nothing because
        // the button is out of flow and the header beside it is 44px on the
        // same pointer.
        //
        // On a mouse that box was the drawn 17.5px and nothing else, and the
        // fold trigger runs the full width of the row underneath it, so a
        // 10px miss above or below this link collapsed the section instead of
        // clearing it. px-1 py-1 grows the box to 25.5px and takes 54x25px of
        // the trigger's own dead space; the padding is spelled here rather
        // than in the shared string above, so p-0 is not left in the class
        // list for the stylesheet's emit order to settle against px-1.
        //
        // No -my-1 with it. The box is centred on the row by its own auto
        // margins between inset-y-0, so a taller box re-centres itself and
        // the ink does not move; a negative block margin would shift the ink
        // up by 4px. -mx-1 is needed, because right-6 pins the right margin
        // edge and without it the words would move 4px left.
        //
        // And no transform. This was centred with top-1/2 and
        // -translate-y-1/2, which is the one thing a Button here cannot wear:
        // ui/button.tsx presses with active:translate-y-px, and the two write
        // the same translate, so while it was held the pull-back was gone and
        // the link dropped by half its height and a pixel, 13px under a mouse
        // and 23px under a finger's 44px box. A press at or above its middle
        // was let go over the fold trigger it had dropped away from: under a
        // mouse nothing happened at all, under a finger the section folded
        // with its filter still on. With the margins doing the centring, the
        // press is left its own 1px.
        collapse
          ? "absolute inset-y-0 right-6 -mx-1 my-auto h-fit px-1 py-1 pointer-coarse:min-h-11"
          : // 39.5px on a coarse pointer, not the 44 the utility's name
            // suggests: the overlay reaches 44px in both axes from the
            // control's centre, and this control sits in a flex row whose
            // own height the 19px line box sets, so what it can claim
            // downwards stops where the first filter row begins, 17px under
            // that centre. Left at 39.5. The 4px per section that an mb-3
            // here would buy back is 36px of sheet body across nine
            // sections, and the sheet's own headers are the ones moving to
            // the folding shape above, where the coarse floor is a real 44.
            "p-0 pointer-coarse:tap-target",
      )}
    >
      {messages.resetFilters}
    </Button>
  ) : null;

  if (!collapse) {
    return (
      <div
        className={cn(
          "mb-2 flex min-h-5 items-center justify-between gap-3",
          className,
        )}
      >
        <h3 className={sectionLabelClass(tone)}>{label}</h3>
        {resetButton}
      </div>
    );
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={(event) => {
        revealOnOpen(event);
        collapse.onToggle();
      }}
      onKeyDown={moveSectionFocus}
      aria-expanded={collapse.open}
      aria-controls={collapse.contentId}
      // uppercase and tracking-wide repeat what the h3 around this button
      // already sets. The browser's own button rules reset text-transform and
      // letter-spacing, so without them a folding heading printed in sentence
      // case while every heading that never folds printed uppercase. The
      // summary chip below sets its own case and tracking, so it still reads
      // as a value rather than a heading.
      //
      // rounded-ui and not shadcn's stock rounded-md. The hover box this draws
      // is the same box a ghost button draws (the sort trigger beside it, via
      // buttonVariants), it is within a few px of their height, and it sits in
      // the same column; rounded-md's 8px against their 10px was a corner off
      // the site's scale by an amount nobody can see and every reader of this
      // file has to re-decide. Not rounded-sm either: that step is for the
      // small marks inside a card, and this box runs the panel's full width.
      //
      // The focus ring is drawn inset, which is the one thing that survives
      // from the outline this replaced. -mx-1 puts this button's left edge
      // exactly on the sidebar's padding edge, measured at 0px of room there:
      // the aside is -mx-1 px-1 and clips at lg (lg:overflow-x-hidden in
      // animal-grid.tsx), so a ring drawn outside the box loses its whole left
      // side. ring-inset puts the same green the rest of the site answers the
      // keyboard with where the black outline used to be, and keeps it.
      //
      // pointer-coarse:min-h-11 and not the tap-target overlay. This row is
      // 24px drawn and the sidebar it lives in only exists from lg, so the
      // max-lg gate that used to be here never applied anywhere: on a 1180px
      // touch tablet every section heading measured 24px. The overlay is the
      // wrong instrument for it, because the header's own mb-2 puts the first
      // filter row 8px below and an overlay overhangs 10, so it would reach
      // into the row under it. Growing the box moves the rows down instead,
      // and only where there is a finger.
      //
      // hover:text-foreground beside the ground. Every row in the sections
      // below answers a pointer in both, and this heading answered in the
      // ground alone, which made the one control in the column that opens
      // something the quietest thing in it under the cursor. The two marks
      // beside the caption keep their own ink: they say what they say whether
      // the pointer is here or not.
      className={cn(
        "-mx-1 -my-1 flex w-full items-center gap-2 rounded-ui px-1 py-1 text-left outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11",
        TONE_CASE[tone],
      )}
    >
      <span className="truncate">{label}</span>
      {hint ? (
        // /80 and not the /60 this was, which measured 2.47:1 in light mode.
        // On a mouse the hint sentence is never drawn, so this glyph is the
        // only sign that a section has an explanation at all, including the
        // one saying that animals with no shelter answer are left out of DOMA
        // IMAM. /80 measures 3.62:1 light and 5.20:1 dark, which is the 3:1 an
        // icon carrying meaning is held to.
        //
        // Not drawn on a coarse pointer. There it is a mark inside the fold
        // trigger, so a tap on it folds the section, and the text it stands
        // for opens on hover or keyboard focus, neither of which a tap gives.
        // SectionHint draws the sentence in the body under the same query,
        // and Starost, which keeps its hint out of the body, prints the
        // ranges the hint states under its grove.
        <Info
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground/80 pointer-coarse:hidden"
          strokeWidth={1.8}
        />
      ) : null}
      {!collapse.open && collapse.summary ? (
        // motion-reduce:duration-0, not motion-reduce:animate-none: see the
        // comment on DialogOverlay in ui/dialog.tsx for why the animate-none
        // guard does not actually take effect here.
        //
        // Keyed, and the mark below too. The two are one ternary, and unkeyed
        // React kept one span for both and swapped its classes. duration-200
        // sets a transition duration over the default transition-property,
        // which is all, so a fold tweened the chip out of the dot's dark green
        // with its words unreadable on it, and an unfold shrank an empty pill
        // into the dot. Keyed, each mounts fresh and plays only its own
        // animate-in.
        //
        // text-2xs below lg and text-3xs from it, the one step up below lg
        // that NOTE_CLASS takes for the same reason: at 10px the chip was the
        // smallest type in the sheet, a phone held at arm's length, while
        // 10px stays right for a 224px column.
        <span
          key="summary"
          className="max-w-28 truncate rounded-full border border-brand-border/50 bg-brand px-2 py-px text-2xs font-medium normal-case tracking-normal text-brand-foreground animate-in fade-in zoom-in-95 duration-200 motion-reduce:duration-0 lg:text-3xs"
        >
          {collapse.summary}
        </span>
      ) : active ? (
        // The same thing the chip above says, in the space an open section has
        // for it. One rule out of two: a section holding an answer carries a
        // green mark in its heading, whether or not its cards are drawn. The
        // panel is a column of ten headings taller than its own scrollport, and
        // without this the only sections announcing themselves in a scan were
        // the folded ones -- folding an active section made it more visibly
        // active than leaving it open.
        //
        // The dot and not the chip, because the words do not fit twice. Open,
        // the chosen rows are eight pixels below and say which answer it is;
        // what is missing is only that there is one. A chip here would push a
        // long heading into its own truncation (CAS V ZAVETISCU at 224px) to
        // repeat what the row underneath already reads out.
        //
        // Left of the chevron and not beside it: the reset link is absolute at
        // right-6 whenever the section is open and active, which is exactly
        // when this is drawn, and the two would be laid over each other. Where
        // the chip stands is where this stands.
        //
        // --brand-border is the one green measured against both grounds this
        // heading has, the page and --muted under the pointer: 3.27:1 and
        // 3.00:1, the 3:1 SC 1.4.11 asks of a graphic that carries meaning
        // (globals.css). aria-hidden because it carries none that is not
        // already said: a folded section spells its answer in the chip, an
        // open one in the pressed state of its own rows.
        <span
          key="answered"
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-brand-border animate-in fade-in zoom-in-95 duration-200 motion-reduce:duration-0"
        />
      ) : null}
      {/* /80 for the same reason as the info mark above, from /70: 2.99:1 to
          3.62:1 in light, 5.20:1 in dark. This is the one thing that says the
          heading is a disclosure and not a label.

          motion-reduce:transition-none, because the turn is a transition and
          not an animation, so nothing else stops it: under reduced motion the
          body lands at once and the chevron still turned for 200ms. */}
      <ChevronDown
        aria-hidden
        className={cn(
          "ml-auto size-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-200 motion-reduce:transition-none",
          !collapse.open && "-rotate-90",
        )}
      />
    </button>
  );

  return (
    <div
      className={cn(
        "relative flex min-h-5 items-center",
        collapse.open && "mb-2",
        className,
      )}
    >
      <h3 className={cn("min-w-0 flex-1", sectionLabelClass(tone))}>
        {hint ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="max-w-56">
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          trigger
        )}
      </h3>
      {resetButton}
    </div>
  );
}
