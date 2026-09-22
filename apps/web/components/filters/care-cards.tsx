"use client";

import type { TargetAndTransition, Transition } from "motion/react";
import { m, useReducedMotion } from "motion/react";
import { useId } from "react";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardRipple,
  FilterCardMark,
  FilterCardSection,
  FilterCardTail,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  sheetColumnsFor,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import type { SectionCollapse } from "@/components/filters/filter-section-header";
import {
  useFilterCardGestures,
  useOneShotCelebration,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import type { CareKey, CareOptionDef } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type CareOption = CareOptionDef;

// One drawing per row, each stroke drawn in list order when the row is
// chosen. Four different marks rather than one heart four times: the section
// reads down as four things a home can give, and a column of identical icons
// told the visitor nothing the labels had not.
//
// Line art on the 24 grid at the section's 1.65 stroke, from lucide's geometry
// (lucide-react, ISC license), so the chip and the animal's requirement pill,
// which draw lucide, show the same shape. The two hearts are lucide's heart
// twice at 0.6; lucide has no pair of them.
type Stroke = { d: string };

const CARE_GLYPHS: Record<CareKey, readonly Stroke[]> = {
  // A snail: at the animal's pace. It was the hourglass until that turned out
  // to be the site's mark for a long wait in the shelter, drawn beside the
  // stay line in the same dialog this row's pill appears in.
  patient: [
    { d: "M2 13a8 8 0 1 0 16 0a8 8 0 1 0-16 0" },
    { d: "M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0" },
    { d: "M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6" },
    { d: "M18 3 19.1 5.2" },
    { d: "M22 3 20.9 5.2" },
  ],
  "bonded-pair": [
    {
      d: "M12 11.4c.894-.876 1.8-1.926 1.8-3.3A3.3 3.3 0 0 0 10.5 4.8c-1.056 0-1.8.3-2.7 1.2-.9-.9-1.644-1.2-2.7-1.2A3.3 3.3 0 0 0 1.8 8.1c0 1.38.9 2.43 1.8 3.3l4.2 4.2Z",
    },
    {
      d: "M19.8 15.6c.894-.876 1.8-1.926 1.8-3.3A3.3 3.3 0 0 0 18.3 9c-1.056 0-1.8.3-2.7 1.2-.9-.9-1.644-1.2-2.7-1.2A3.3 3.3 0 0 0 9.6 12.3c0 1.38.9 2.43 1.8 3.3l4.2 4.2Z",
    },
  ],
  "ongoing-care": [
    { d: "m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" },
    { d: "m8.5 8.5 7 7" },
  ],
  // A medal, the disc before the ribbon. It was lucide's hand and heart until
  // the section heading's own mark turned out to be the same drawing, so a
  // folded chip for the section and the chip for this row were one picture.
  "experienced-carer": [
    { d: "M6 8a6 6 0 1 0 12 0a6 6 0 1 0-12 0" },
    {
      d: "m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",
    },
  ],
};

// The slowest drawing sets the hold, so every row's beat finishes inside it.
const MOST_STROKES = Math.max(
  ...Object.values(CARE_GLYPHS).map((strokes) => strokes.length),
);

// Patience is the tempo of this section, so every number here is the slowest
// in the sidebar on purpose.
const DRAW_DURATION = 0.5;
const DRAW_STAGGER = 0.16;
const FADE_DURATION = 0.14;

// One deep lub-dub. Two beats, the second the fuller of the pair, then still.
// Six keyframes, so it can only run as a tween carrying its own times.
const BEAT_DURATION = 1.15;
const BEAT_TIMES = [0, 0.13, 0.3, 0.46, 0.66, 1];
const BEAT_SCALE = [1, 1.11, 1.02, 1.18, 1, 1];
const BEAT: TargetAndTransition = { scale: BEAT_SCALE };
const BEAT_TRANSITION: Transition = {
  duration: BEAT_DURATION,
  times: BEAT_TIMES,
  ease: "easeInOut",
};

// One warm ring leaving the heart, wider and slower than the household ripple.
const RIPPLE_DURATION = 1.05;
const RIPPLE_OPACITY = 0.26;
const RIPPLE_SCALE = 2.1;

// The check confirms after the second beat, not between the two.
const CHECK_DELAY = 0.72;
// Matches FilterSelectionMark's own appear duration.
const CHECK_DURATION = 0.14;

// The press is a hold rather than a tap: it eases in and nothing springs back.
const PRESS_HOLD: TargetAndTransition = { scale: 0.965 };
const PRESS_REST: TargetAndTransition = { scale: 1 };
const PRESS_TRANSITION: Transition = { duration: 0.3, ease: "easeOut" };

// Letting go is an exhale, quick and small, and never a snap.
const EXHALE: TargetAndTransition = { scale: [1, 0.97, 1] };
const EXHALE_TRANSITION: Transition = {
  duration: 0.3,
  times: [0, 0.4, 1],
  ease: "easeInOut",
};
const EXHALE_MS = 320;

const BEAT_REST: TargetAndTransition = { scale: 1 };
const REST_TRANSITION: Transition = { duration: 0.16 };

// The mark the chosen heart leaves behind on a selected card.
const WATERMARK_OPACITY = 0.08;
const WATERMARK_IN_DURATION = 0.3;
const WATERMARK_OUT_DURATION = 0.12;

// Every phase measured from the moment the card is switched on. The hold has
// to outlast the slowest of them, because clearing the celebration snaps
// whatever is still running back to rest.
const HEARTBEAT_MS = Math.ceil(
  1000 *
    Math.max(
      BEAT_DURATION,
      RIPPLE_DURATION,
      (MOST_STROKES - 1) * DRAW_STAGGER + DRAW_DURATION,
      CHECK_DELAY + CHECK_DURATION,
      CHECK_DELAY + WATERMARK_IN_DURATION,
    ),
);

// Two layers: a muted outline that is always there, and an accent copy that
// draws itself on when the card is chosen, stroke by stroke.
function CareGlyph({
  strokes,
  checked,
  resetDelay,
  className,
}: {
  strokes: readonly Stroke[];
  checked: boolean;
  /** Holds the drawing back so a reset empties the section in order. */
  resetDelay: number;
  className: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  // The whole retract waits its turn, fade and drawn length together, so the
  // section empties one row at a time. The delay used to stop at the icon
  // well's halo and never reach the heart inside it, so the halos winked out
  // in order over drawings that had all gone grey at once.
  const wait = shouldReduceMotion || checked ? 0 : resetDelay;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className="text-muted-foreground" stroke="currentColor">
        {strokes.map(({ d }) => (
          <path key={d} d={d} />
        ))}
      </g>
      <m.g
        stroke="var(--brand-strong)"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : FADE_DURATION,
          delay: wait,
          ease: "easeOut",
        }}
      >
        {strokes.map(({ d }, index) => (
          <m.path
            key={d}
            d={d}
            initial={false}
            animate={{ pathLength: checked ? 1 : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : checked
                  ? {
                      duration: DRAW_DURATION,
                      delay: index * DRAW_STAGGER,
                      ease: "easeOut",
                    }
                  : // The drawn length drops only once the overlay has faded
                    // out, so unchecking never runs the draw backwards.
                    { duration: 0, delay: wait + FADE_DURATION }
            }
          />
        ))}
      </m.g>
    </svg>
  );
}

export function CareCards({
  options,
  counts,
  selected,
  resultCount,
  total,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
}: {
  options: CareOption[];
  counts: Map<string, number>;
  selected: CareKey[];
  /** Animals the current filters leave, and the pool they were taken from. */
  resultCount: number;
  total: number;
  onToggle: (key: CareKey) => void;
  onToggleMany: (values: CareKey[]) => void;
  layout?: FilterCardLayout;
  collapse?: SectionCollapse;
}) {
  const { locale, messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<CareKey>(HEARTBEAT_MS);
  // Letting go is its own one-shot, held as {value, id} for the same reason
  // the beat is: switching the same card off twice has to run twice.
  const {
    celebration: exhale,
    celebrate: exhaleNow,
    clear: clearExhale,
  } = useOneShotCelebration<CareKey>(EXHALE_MS);
  const { beginReset, resetDelay } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue: hoveredKey,
    pressedValue: pressedKey,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures<CareKey>();

  const describedBy = useId();

  const outcome =
    selected.length === 0
      ? null
      : t("careOutcome", { count: resultCount, total });

  return (
    <FilterCardSection
      label={messages.care}
      hint={messages.careFilterHint}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetCareFilters}
      layout={layout}
      collapse={collapse}
      // Two at most, like health and the household questions: each tile also
      // carries the line saying which animals it shows.
      sheetColumns={sheetColumnsFor(options.length, 2)}
      // What the section did to the list, and the one line the screen reader
      // hears. Nothing selected says nothing.
      footer={
        <p
          aria-live="polite"
          className="mt-2 text-2xs leading-snug text-muted-foreground empty:mt-0"
        >
          {outcome}
        </p>
      }
    >
      {options.map(({ key, label, description }, index) => {
            const count = counts.get(key) ?? 0;
            const checked = selected.includes(key);
            const dead = isDeadOption(count, checked);
            const hovered = hoveredKey === key;
            const celebrating = celebration?.value === key && checked;
            const exhaling = exhale?.value === key && !checked;
            // The hold is press feedback, so it runs on touch too, and it
            // yields the moment the beat takes over.
            const pressing =
              pressedKey === key && !celebrating && !shouldReduceMotion;
            // A reset winks the row out rather than dropping it.
            const exitDelay = resetDelay(index);
            const gestures = gestureHandlers(key);
            const strokes = CARE_GLYPHS[key];
            const descriptionId = `${describedBy}-${key}`;

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (checked) {
                    clearCelebration();
                    exhaleNow(key);
                  } else {
                    clearExhale();
                    celebrate(key);
                  }
                  // Touch browsers can skip pointerleave when the finger slides
                  // off, and pointercancel does not cover every path, so the
                  // click clears the press too.
                  releasePress(key);
                  onToggle(key);
                }}
                disabled={dead}
                {...gestures}
                aria-pressed={checked}
                aria-label={`${label}, ${animalCount(count, locale)}`}
                aria-describedby={descriptionId}
                className={filterCardVariants({
                  layout,
                  selected: checked,
                  className: cn(
                    // isolate keeps the watermark's negative z-index above the
                    // card's own background instead of behind it.
                    "isolate flex",
                    filterCardLayoutClass(layout),
                  ),
                })}
              >
                {/* The mark the chosen drawing leaves on the card, clipped by
                    the card's own overflow. */}
                <m.span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -z-10",
                    layout === "sheet"
                      ? "-bottom-2 -right-1.5"
                      : "-bottom-1 -right-1",
                  )}
                  // A real initial, so a card checked from the URL stamps its
                  // mark on load instead of having it already there.
                  initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 1.06 }}
                  animate={{
                    opacity: checked ? WATERMARK_OPACITY : 0,
                    scale: shouldReduceMotion || checked ? 1 : 1.06,
                  }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : checked
                        ? {
                            duration: WATERMARK_IN_DURATION,
                            delay: CHECK_DELAY,
                            ease: "easeOut",
                          }
                        : {
                            duration: WATERMARK_OUT_DURATION,
                            delay: exitDelay,
                            ease: "easeOut",
                          }
                  }
                >
                  {/* The rotation stays on the svg; the span owns transform. */}
                  <svg
                    viewBox="0 0 24 24"
                    className={cn(
                      "rotate-[-12deg]",
                      layout === "sheet" ? "size-12" : "size-9",
                    )}
                    fill="none"
                    stroke="var(--brand-strong)"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {strokes.map(({ d }) => (
                      <path key={d} d={d} />
                    ))}
                  </svg>
                </m.span>

                <FilterCardMark
                  layout={layout}
                  checked={checked}
                  appearDelay={CHECK_DELAY}
                />

                <FilterCardIconWell
                  layout={layout}
                  checked={checked}
                  exitDelay={exitDelay}
                >
                  {celebrating && !shouldReduceMotion ? (
                    <FilterCardRipple
                      key={`ring-${celebration?.id}`}
                      layout={layout}
                      opacity={RIPPLE_OPACITY}
                      scale={RIPPLE_SCALE}
                      duration={RIPPLE_DURATION}
                    />
                  ) : null}
                  <FilterCardHoverLift hovered={hovered}>
                    <m.span
                      className="flex items-center justify-center"
                      initial={false}
                      animate={
                        shouldReduceMotion
                          ? BEAT_REST
                          : celebrating
                            ? BEAT
                            : exhaling
                              ? EXHALE
                              : BEAT_REST
                      }
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : celebrating
                            ? BEAT_TRANSITION
                            : exhaling
                              ? EXHALE_TRANSITION
                              : REST_TRANSITION
                      }
                    >
                      <m.span
                        className="flex items-center justify-center"
                        initial={false}
                        animate={pressing ? PRESS_HOLD : PRESS_REST}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : pressing
                              ? PRESS_TRANSITION
                              : REST_TRANSITION
                        }
                      >
                        <CareGlyph
                          strokes={strokes}
                          checked={checked}
                          resetDelay={exitDelay}
                          className={cn(
                            "size-5 transition-[opacity,transform] duration-200",
                            // A dead option is a drawing nobody is waiting on.
                            dead && "rotate-[10deg] opacity-60",
                          )}
                        />
                      </m.span>
                    </m.span>
                  </FilterCardHoverLift>
                </FilterCardIconWell>

                <FilterCardTail
                  layout={layout}
                  label={label}
                  checked={checked}
                  description={description}
                  descriptionId={descriptionId}
                  renderCount={(className) => (
                    <CountRoll value={count} className={className} />
                  )}
                />
              </button>
            );
          })}
    </FilterCardSection>
  );
}
