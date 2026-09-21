"use client";

import { ChevronDown, Info } from "lucide-react";
import {
  AnimatePresence,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-context";
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

const BODY_EASE = [0.16, 1, 0.3, 1] as const;
// The fold runs 0.3s; the section is measured once it has settled.
const FOLD_SETTLE_MS = 350;

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

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            key="body"
            id={collapse?.contentId}
            // The clip exists for the fold alone. A settled body lets focus
            // rings and tooltips spill past its box again.
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{
              height: "auto",
              opacity: 1,
              transitionEnd: { overflow: "visible" },
            }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
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

/** The hint sentence a section keeps under its header. A folding section moves
    the hint into the header tooltip, which a touch screen cannot open, so
    coarse pointers keep the sentence in the body; a section that never folds
    keeps it visible outright. */
export function SectionHint({
  collapse,
  children,
}: {
  collapse?: SectionCollapse;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        // 12px in the sheet, 11px in the sidebar. The two sizes are one
        // decision about column width and not two tastes: the sidebar is a
        // 224px column beside the grid, while the sheet is a phone held at
        // arm's length, where 11px was the smallest type on the page. The
        // sheet is below lg and the sidebar only from it, so the width gate
        // says which one this is.
        "mb-2 text-xs leading-snug text-muted-foreground lg:text-2xs",
        collapse && "hidden [@media(pointer:coarse)]:block",
      )}
    >
      {children}
    </p>
  );
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
  target?.focus();
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
}: {
  label: string;
  active: boolean;
  onReset?: () => void;
  resetAriaLabel?: string;
  collapse?: SectionCollapse;
  hint?: string;
  className?: string;
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
      section.scrollIntoView({
        block: "nearest",
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    }, FOLD_SETTLE_MS);
  };

  const resetButton = (
    <Button
      type="button"
      variant="link"
      size="xs"
      onClick={onReset}
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
        // the one caller with no collapse contract (location-scope-row.tsx),
        // this sits in the header's flex row and takes the overlay; the
        // sheet's filter sections fold now and take the absolute branch below
        // with its 44px coarse floor. A folding section's
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
        // No -my-1 with it. The row places this button at top-1/2 and pulls it
        // back by half its own height, so a taller box re-centres itself and
        // the ink does not move; a negative block margin would shift the ink
        // up by 4px. -mx-1 is needed, because right-6 pins the right margin
        // edge and without it the words would move 4px left.
        collapse
          ? "absolute right-6 top-1/2 -mx-1 -translate-y-1/2 px-1 py-1 pointer-coarse:min-h-11"
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
  );

  if (!collapse) {
    return (
      <div
        className={cn(
          "mb-2 flex min-h-5 items-center justify-between gap-3",
          className,
        )}
      >
        <h3 className={SECTION_LABEL_CLASS}>{label}</h3>
        {resetButton}
      </div>
    );
  }

  const trigger = (
    <button
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
      className="-mx-1 -my-1 flex w-full items-center gap-2 rounded-ui px-1 py-1 text-left uppercase tracking-wide outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11"
    >
      <span className="truncate">{label}</span>
      {hint ? (
        // /80 and not the /60 this was, which measured 2.47:1 in light mode.
        // On a mouse the hint sentence is never drawn, so this glyph is the
        // only sign that a section has an explanation at all, including the
        // one saying that animals with no shelter answer are left out of DOMA
        // IMAM. /80 measures 3.62:1 light and 5.20:1 dark, which is the 3:1 an
        // icon carrying meaning is held to.
        <Info
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground/80"
          strokeWidth={1.8}
        />
      ) : null}
      {!collapse.open && collapse.summary ? (
        // motion-reduce:duration-0, not motion-reduce:animate-none: see the
        // comment on DialogOverlay in ui/dialog.tsx for why the animate-none
        // guard does not actually take effect here.
        <span className="max-w-28 truncate rounded-full border border-brand-border/50 bg-brand px-2 py-px text-3xs font-medium normal-case tracking-normal text-brand-foreground animate-in fade-in zoom-in-95 duration-200 motion-reduce:duration-0">
          {collapse.summary}
        </span>
      ) : null}
      {/* /80 for the same reason as the info mark above, from /70: 2.99:1 to
          3.62:1 in light, 5.20:1 in dark. This is the one thing that says the
          heading is a disclosure and not a label. */}
      <ChevronDown
        aria-hidden
        className={cn(
          "ml-auto size-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-200",
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
      <h3 className={cn("min-w-0 flex-1", SECTION_LABEL_CLASS)}>
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
