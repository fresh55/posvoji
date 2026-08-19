"use client";

import { ChevronDown, Info } from "lucide-react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";
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

const BODY_EASE = [0.16, 1, 0.3, 1] as const;
// The fold runs 0.3s; the section is measured once it has settled.
const FOLD_SETTLE_MS = 350;

/** The folding half of a section. Without a collapse contract it renders its
    children directly (open defaults true, no id to control), so the sheet
    and plain lists stay as they were. */
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
        "mb-2 text-[11px] leading-snug text-muted-foreground",
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
  const container = event.currentTarget.closest("aside");
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
  onReset: () => void;
  resetAriaLabel: string;
  collapse?: SectionCollapse;
  hint?: string;
  className?: string;
}) {
  const { messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  // A closed section trades the reset link for the summary chip; opening it
  // brings the reset back.
  const showReset = active && (collapse ? collapse.open : true);

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
      aria-hidden={!showReset}
      tabIndex={showReset ? undefined : -1}
      aria-label={resetAriaLabel}
      className={cn(
        "h-auto p-0 text-[11px] font-normal text-muted-foreground transition-opacity hover:text-foreground",
        !showReset && "pointer-events-none opacity-0",
        collapse && "absolute right-6 top-1/2 -translate-y-1/2",
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
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
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
      className="-mx-1 -my-1 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left outline-none transition-colors duration-150 hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      <span className="truncate">{label}</span>
      {hint ? (
        <Info
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground/60"
          strokeWidth={1.8}
        />
      ) : null}
      {!collapse.open && collapse.summary ? (
        <span className="max-w-28 truncate rounded-full border border-[var(--filter-accent-border)]/50 bg-[var(--filter-accent)] px-2 py-px text-[10px] font-medium normal-case tracking-normal text-[var(--filter-accent-foreground)] animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none">
          {collapse.summary}
        </span>
      ) : null}
      <ChevronDown
        aria-hidden
        className={cn(
          "ml-auto size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
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
      <h3 className="min-w-0 flex-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {hint ? (
          <TooltipProvider delayDuration={350} skipDelayDuration={150}>
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
