"use client";

import { MapPin } from "lucide-react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { FilterSectionHeader } from "@/components/filters/filter-section-header";
import { MiniMap } from "@/components/filters/mini-map";
import { useOneShotCelebration } from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-provider";
import { useNearbyOrigin } from "@/hooks/use-nearby-origin";
import type { FilterOption } from "@/lib/filters";
import { cityAt } from "@/lib/geo";
import { shelterScopeLabel } from "@/lib/labels";
import type { ShelterPin } from "@/lib/map-layout";
import { cn } from "@/lib/utils";

// Where the filter panels ask the question the map answers. Two surfaces draw
// it: the sidebar, where the press opens the picker in place, and the sheet,
// where the press closes the drawer first and the dock's picker opens after
// it. Both get the same header, the same live glyph and the same sentence, so
// a phone and a desktop cannot disagree about what is currently in scope.
//
// It is not a collapsible section. Every other section in the panel folds
// behind its header and remembers the fold; this one holds a single control
// and folding it would hide the only way to the map.

// How long the strip's region flash stays mounted, comfortably past
// CELEBRATION_PULSE_SECONDS in mini-map.tsx so the fade always finishes
// before the element is torn down rather than being cut off mid-flash.
const CELEBRATION_HOLD_MS = 750;

// How long the scope sentence takes to trade one value for the next, and how
// long the invitation under it takes to leave. Short enough to read as the row
// changing its mind rather than as an animation of its own.
const LABEL_TRANSITION_SECONDS = 0.15;

/** The shelters a map can place, as pins. Both lists are the same thing to a
 *  mini-map, so they are located the same way; a shelter whose town does not
 *  resolve to a point is left off rather than placed somewhere plausible.
 *  Off-roster shelters carry no count and are never selectable, which is what
 *  keeps a region's own state honest (lib/map-layout.ts). */
export function shelterPins(
  options: FilterOption[],
  counts: Map<string, number>,
  offSite: FilterOption[] = [],
): ShelterPin[] {
  const place = (option: FilterOption, count: number, selectable?: boolean) => {
    const at = option.city ? cityAt(option.city) : undefined;
    return at
      ? [
          {
            value: option.value,
            label: option.label,
            city: option.city ?? "",
            at,
            count,
            ...(selectable === false ? { selectable: false } : {}),
          },
        ]
      : [];
  };
  return [
    ...options.flatMap((option) =>
      place(option, counts.get(option.value) ?? 0),
    ),
    ...offSite.flatMap((option) => place(option, 0, false)),
  ];
}

export function LocationScopeRow({
  options,
  counts,
  offSite,
  selected,
  expanded,
  onOpen,
  onReset,
  /** Marks the press target as the trigger the browser tests locate. Only the
   *  instance that opens the dialog in place carries it: the sheet's row hands
   *  the press to the dock's picker, and two visible copies would leave the
   *  specs with two things to click. */
  isPickerTrigger = false,
  children,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  offSite?: FilterOption[];
  selected: string[];
  expanded?: boolean;
  onOpen: () => void;
  onReset: () => void;
  isPickerTrigger?: boolean;
  /** The chips under the row, where a surface has them to draw. */
  children?: ReactNode;
}) {
  const { locale, messages, t } = useI18n();
  const origin = useNearbyOrigin();
  const pins = useMemo(
    () => shelterPins(options, counts, offSite),
    [counts, offSite, options],
  );
  // The registry, live shelters and the ones with nothing listed alike, which
  // is the roster the dialog lists and the total its own label counts against.
  const total = options.length + (offSite?.length ?? 0);
  const label = shelterScopeLabel(selected.length, total, locale);

  const shouldReduceMotion = useReducedMotion();
  // Nothing picked is the one state where the sentence alone does not say the
  // row can be pressed, so that is the only state carrying the invitation.
  const inviting = selected.length === 0;

  // The pick lands in the map dialog, a different component entirely, so this
  // row only ever learns about it the way any other prop change arrives: by
  // comparing what it saw last against what it sees now. Held in a ref rather
  // than state because the comparison itself has no view of its own to paint.
  const { celebration, celebrate } =
    useOneShotCelebration<string>(CELEBRATION_HOLD_MS);
  const previousSelectedRef = useRef<string[] | null>(null);

  useEffect(() => {
    const previous = previousSelectedRef.current;
    previousSelectedRef.current = selected;
    // A page load or a restored URL arrives with its selection already made;
    // there is no "before" to have grown from, so the first render of this
    // effect only ever records where things started.
    if (previous === null) return;
    if (selected.length <= previous.length) return;
    const added = selected.filter((value) => !previous.includes(value));
    // A bulk change, an undo, or several picks landing in one update has no
    // single newest one to point the strip's flash at, so it stays quiet
    // rather than guessing.
    if (added.length !== 1) return;
    celebrate(added[0]);
  }, [selected, celebrate]);

  return (
    <section data-slot="location-scope-row">
      <FilterSectionHeader
        label={messages.where}
        active={selected.length > 0}
        onReset={onReset}
        resetAriaLabel={messages.resetShelterFilters}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label={t("shelterPickerLabel", { label })}
        {...(isPickerTrigger ? { "data-picker-trigger": "" } : {})}
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-ui border bg-background p-2 text-sm outline-none transition-colors",
          "hover:border-[var(--filter-accent-border)] hover:bg-muted active:bg-muted",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring",
          // The strip alone already clears 44px below lg; kept explicit
          // anyway so the reach never depends on how tall the strip ends up.
          "max-lg:min-h-11",
        )}
      >
        {/* The wash the silhouette stands on. Against the button's own ground
            the country floated and read as a logo; a muted panel behind it
            reads as a place. A tint and nothing else: the border stays on the
            button, so the row keeps its single outline. */}
        <span className="flex justify-center rounded-md bg-muted/40 py-1">
          {/* The same live preview the toolbar trigger draws, from the same
              region shapes and the same density computation, grown from a
              glyph into a centered plate so the row shows what is behind it
              before it is ever pressed. The country keeps its own shape: a
              silhouette every Slovene knows stretched to fill the row's width
              stops being the country. celebration flashes the region the
              newest pick landed in, once, the moment that pick reaches this
              row. */}
          {/* The rim frames the country, it does not draw it. At 2.5 units of
              foreground/70 the border was the loudest thing on the plate and
              the shape inside it read as a colouring book; now that the
              regions carry their own seams there is nothing left for a heavy
              rim to hold together. Both halves come down a step, to 2 units
              and /60, which is a third less ink: thin enough to stop reading
              as a drawn line, still unbroken where the pale west of the
              country meets the ground. */}
          <MiniMap
            pins={pins}
            selected={selected}
            celebration={celebration}
            outlineWidth={2}
            detail="plate"
            className="h-24 w-auto self-center text-foreground/60"
          />
        </span>
        <LazyMotion features={domAnimation}>
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-left">
              {/* One cell holding whichever sentence is current, so the
                  outgoing one fades out over the incoming one instead of
                  pushing it sideways. initial={false} on the boundary is what
                  keeps the first paint and the hydration commit still: only a
                  changed value animates. */}
              <span className="grid">
                <AnimatePresence initial={false} mode="popLayout">
                  <m.span
                    key={label}
                    className="col-start-1 row-start-1 block min-w-0 truncate"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -2 }
                    }
                    transition={{
                      duration: shouldReduceMotion
                        ? 0
                        : LABEL_TRANSITION_SECONDS,
                      ease: "easeOut",
                    }}
                  >
                    {label}
                  </m.span>
                </AnimatePresence>
              </span>
              {/* The line is only ever there before the first pick, so nothing
                  is reserved for it: it takes its height with it on the way in
                  and on the way out, and the fade covers the change. */}
              <AnimatePresence initial={false}>
                {inviting ? (
                  <m.span
                    key="invite"
                    className="block overflow-hidden text-xs text-muted-foreground"
                    initial={
                      shouldReduceMotion ? false : { opacity: 0, height: 0 }
                    }
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      duration: shouldReduceMotion
                        ? 0
                        : LABEL_TRANSITION_SECONDS,
                      ease: "easeOut",
                    }}
                  >
                    {messages.whereMapInvite}
                  </m.span>
                ) : null}
              </AnimatePresence>
            </span>
            {/* Only a typed origin carries words; a geolocation fix is a point
                with no name and nothing here reverse-geocodes it. The store's
                server snapshot is null, so the hint is absent through
                hydration and arrives in the commit after. */}
            {origin?.place && (
              <span className="max-w-[10rem] shrink-0 truncate text-xs text-muted-foreground">
                {t("originFrom", { place: origin.place })}
              </span>
            )}
            {/* Not a chevron: nothing folds open here, a full-screen map does.
                The pin is the mark every picked shelter already wears on its
                chip, and the word beside it says where the press goes, which a
                bare expand glyph left to be guessed. */}
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5" strokeWidth={1.75} aria-hidden />
              {messages.mapCaption}
            </span>
          </span>
        </LazyMotion>
      </button>
      {children}
    </section>
  );
}
