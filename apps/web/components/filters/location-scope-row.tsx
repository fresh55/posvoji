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
import { shelterSelectionLabel } from "@/lib/labels";
import type { ShelterPin } from "@/lib/map-layout";
import { cn } from "@/lib/utils";

// Where the filter panels ask the question the map answers. Two surfaces draw
// it: the sidebar, where the press opens the picker in place, and the sheet,
// where the press closes the drawer first and the dock's picker opens after
// it. Both get the same header, the same sentence, the same live map of the
// picks and the same press, so a phone and a desktop cannot disagree about
// what is currently in scope.
//
// What the two surfaces do not share is how much room the row may take, and
// so how big that map is drawn: 96px of plate with the region seams and the
// town dots on one, a 32px glyph inside the sentence's own line on the other,
// which also costs the sheet the invitation line under it.
//
// The sidebar scrolls on its own and keeps the plate, where the country is worth
// looking at before the map is ever opened. The sheet is 608px of drawer at
// 390x844, and the plate spent 164px of it on a picture of the control the
// visitor had just pressed to get here: with the title and the sort select
// above it, Spol was the only filter section left above the fold. There the
// same row folds onto one 52px line and hands the difference to the sections
// under it.
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
  layout = "plate",
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
  /** How much of the panel the row is allowed to spend. "plate" is the card
   *  with the 96px country on it, which the sidebar keeps: a column that
   *  scrolls on its own has the room, and the plate is what makes the map
   *  worth opening. "row" is the same row folded onto one 52px line, which is
   *  what the sheet asks for; see the fold budget above the glyph below. */
  layout?: "plate" | "row";
  /** The chips under the row, where a surface has them to draw. */
  children?: ReactNode;
}) {
  const { locale, messages, t } = useI18n();
  const origin = useNearbyOrigin();
  const pins = useMemo(
    () => shelterPins(options, counts, offSite),
    [counts, offSite, options],
  );
  // Resolve names from the full registry, matching the picker footer chips.
  const selectedRows = selected.map((value) =>
    [...options, ...(offSite ?? [])].find((row) => row.value === value) ?? { label: value },
  );
  const label = shelterSelectionLabel(selectedRows, locale);
  const oneRow = layout === "row";

  const shouldReduceMotion = useReducedMotion();
  // Nothing picked is the one state where the sentence alone does not say the
  // row can be pressed, so that is the only state carrying the invitation.
  // The folded row has nowhere to put it: it is a second line, and there is
  // no room beside the caption either (the measurement is above the glyph).
  const inviting = !oneRow && selected.length === 0;

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
          "hover:border-brand-border hover:bg-muted active:bg-muted",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring",
          // 52px, the same height the sheet pays for its sort select. It is a
          // floor and not a height, so it is one rule for both layouts rather
          // than one each: the folded row's glyph and sentence come to 48px
          // with the padding and take the floor, while the plate stands at
          // about 146px and never reaches it. Past the 44px a finger needs
          // either way, so the reach never depends on how tall the drawing
          // above the sentence ends up.
          "min-h-13 justify-center",
        )}
      >
        {/* The wash the silhouette stands on. Against the button's own ground
            the country floated and read as a logo; a muted panel behind it
            reads as a place. A tint and nothing else: the border stays on the
            button, so the row keeps its single outline.

            Not drawn at all in the one-row layout: there the glyph moves down
            into the sentence's own line and the plate, the wash and the whole
            96px card go with it.

            rounded-ui, the radius the button around it already carries. This
            is a content surface, which is what that step is for (--radius-ui in
            globals.css), and the wash is inset only 8px from the button's
            border, so its corner is read against that one rather than on its
            own: rounded-md's 8px beside 10px was two shapes disagreeing by an
            amount too small to look deliberate. */}
        {!oneRow && (
          <span className="flex justify-center rounded-ui bg-muted/40 py-1">
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
        )}
        <LazyMotion features={domAnimation}>
          <span className="flex items-center gap-2">
            {/* The one-row layout's glyph, at the detail the dock trigger
                already draws: 32px tall is 49px of country, where a seam is a
                quarter of a pixel and a town dot half of one, so both would
                land as dirt rather than as reading. Only the size changes, so
                what the sheet shows is the dock's own glyph one step up.
                celebration stays wired, which is the whole reason the row can
                afford to lose the plate: the region the newest pick landed in
                still flashes here.

                The fold budget this row exists for, measured in the app's own
                Inter at 320px, the narrowest phone the sheet is built for. The
                scroller pays px-5 and the button a border and p-2, so the line
                has 262px: glyph 49, gap 8, the longest Slovene sentence
                "3 od 17 zavetišč" 106, gap 8, and the "Zemljevid" caption with
                its pin 73. That is 244, and it still fits at 262. The
                invitation is what does not: 170px of "Izberi zavetišča na
                zemljevidu" puts the line 160px over at 320 and 90px over at
                390, so the one-row layout drops it and the plate keeps it.
                Against the plate's 164px card this row costs 52, so the
                sections under Spol get about 112px of the first screen back.
                */}
            {oneRow && (
              <MiniMap
                pins={pins}
                selected={selected}
                celebration={celebration}
                className="h-8 w-auto text-foreground/60"
              />
            )}
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
                  and on the way out, and the fade covers the change. Which
                  layout may draw it at all is decided with `inviting` itself,
                  above. */}
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
