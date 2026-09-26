"use client";

import { useReducedMotion } from "motion/react";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardRipple,
  FilterCardSection,
  FilterCardTail,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  sheetColumnsFor,
  SIDEBAR_NOTE_TYPE,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  SectionNote,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import {
  GoodWithGlyph,
  LONGEST_GOOD_WITH_GESTURE_MS,
} from "@/components/filters/good-with-glyphs";
import { useRowNotes } from "@/components/filters/unanswered-note";
import {
  resetDelayStyle,
  useFilterCardHover,
  useOneShotCelebration,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import {
  GOOD_WITH_KEYS,
  type GoodWithKey,
  type Unanswered,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type GoodWithOption = { key: GoodWithKey; label: string };

// The hold comes from the glyphs themselves, so the check and the ripple
// never cut a laugh or a blink short when the choreography changes.
const GESTURE_MS = LONGEST_GOOD_WITH_GESTURE_MS;
// The check confirms as the icon gesture lands, not before it starts.
const GESTURE_CHECK_DELAY = 0.2;
const RIPPLE_OPACITY = 0.5;
const RIPPLE_SCALE = 1.35;
const RIPPLE_DURATION = 0.35;

const LEAD_KEYS: Record<GoodWithKey, TranslationKey> = {
  kids: "goodWithLeadKids",
  dogs: "goodWithLeadDogs",
  cats: "goodWithLeadCats",
};

const TAIL_KEYS: Record<GoodWithKey, TranslationKey> = {
  kids: "goodWithTailKids",
  dogs: "goodWithTailDogs",
  cats: "goodWithTailCats",
};

/** Fixed facet order, so the sentence does not reshuffle as you pick. */
function orderedSelection(selected: GoodWithKey[]): GoodWithKey[] {
  return GOOD_WITH_KEYS.filter((key) => selected.includes(key));
}

export function GoodWithCards({
  options,
  counts,
  selected,
  kept = [],
  resultCount,
  total,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
  unanswered,
  sectionKeys,
}: {
  options: GoodWithOption[];
  counts: Map<string, number>;
  selected: GoodWithKey[];
  /** Picks the sidebar keeps drawn once they come off (KeptPicks in
   *  filter-groups.tsx); never dead. */
  kept?: readonly string[];
  /** Animals the current filters leave, and the pool they were taken from. */
  resultCount: number;
  total: number;
  onToggle: (key: GoodWithKey) => void;
  onToggleMany: (values: GoodWithKey[]) => void;
  layout?: FilterCardLayout;
  collapse?: SectionCollapse;
  /** Per question, what a pick leaves out for having no answer. */
  unanswered?: Readonly<Record<GoodWithKey, Unanswered>>;
  /** Every question the section has, drawn or not (useRowNotes). */
  sectionKeys?: readonly GoodWithKey[];
}) {
  const { locale, messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const rowNotes = useRowNotes(
    options.map(({ key }) => key),
    unanswered,
    "goodWithUnansweredRow",
    sectionKeys,
  );
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<GoodWithKey>(GESTURE_MS);
  const { beginReset, resetDelay } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue: hoveredKey,
    previewing: previewingKey,
    settle,
    handlers: hoverHandlers,
  } = useFilterCardHover<GoodWithKey>();

  const chosen = orderedSelection(selected);

  const outcome =
    chosen.length === 0
      ? null
      : t("goodWithOutcome", {
          list: joinPhrases(
            chosen.map((key, index) =>
              index === 0 ? t(LEAD_KEYS[key]) : t(TAIL_KEYS[key]),
            ),
            messages.goodWithJoiner,
          ),
          count: resultCount,
          total,
        });

  return (
    <FilterCardSection
      label={messages.goodWith}
      hint={messages.goodWithFilterHint}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetGoodWithFilters}
      layout={layout}
      collapse={collapse}
      // As many columns as there are answers. The three columns are for the
      // three facets this section can hold, and a dataset that answers only
      // two of them (today: psi and mačke) left a third of the row empty.
      sheetColumns={sheetColumnsFor(options.length)}
      // The one place the section says its choices hold at once, and the one
      // the screen reader hears. Before a pick, and only while a row names
      // animals with no answer, it says what a pick will do with them: the
      // sentence the hint used to carry where a mouse never saw it. Where no
      // row has a single answer it says that instead (useRowNotes).
      footer={
        <>
          <p
            aria-live="polite"
            className={`mt-2 leading-snug text-muted-foreground empty:mt-0 ${SIDEBAR_NOTE_TYPE}`}
          >
            {outcome}
          </p>
          {outcome === null && rowNotes.section !== undefined && (
            <SectionNote>
              {rowNotes.section === "none"
                ? messages.goodWithUnansweredNone
                : messages.goodWithUnansweredLine}
            </SectionNote>
          )}
        </>
      }
    >
      {options.map(({ key, label }, index) => {
        const count = counts.get(key) ?? 0;
        const checked = selected.includes(key);
        const dead = isDeadOption(count, checked, kept.includes(key));
        const hovered = hoveredKey === key;
        const celebrating = celebration?.value === key && checked;
        // A taste of the pick gesture for a card nobody has chosen yet and
        // that has something to pick.
        const previewing = previewingKey(key) && !checked && !dead;
        const exitDelay = resetDelay(index);
        // The "brez odgovora" line is a warning about what a pick would hide,
        // so it belongs on rows nobody has pressed yet. Left on after a pick,
        // it kept recomputing against the narrower result and changed a
        // number the visitor never touched.
        const rawNote = rowNotes.at(index);
        const note = checked ? { ...rawNote, description: undefined } : rawNote;

        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (checked) {
                clearCelebration();
              } else {
                celebrate(key);
              }
              settle(key);
              onToggle(key);
            }}
            disabled={dead}
            {...hoverHandlers(key)}
            aria-pressed={checked}
            aria-label={`${label}, ${animalCount(count, locale)}`}
            aria-describedby={note.description ? note.descriptionId : undefined}
            className={filterCardVariants({
              layout,
              selected: checked,
              className: cn("flex", filterCardLayoutClass(layout)),
            })}
          >
            <FilterCardMark
              layout={layout}
              checked={checked}
              appearDelay={GESTURE_CHECK_DELAY}
            />

            <FilterCardIconWell
              layout={layout}
              checked={checked}
              exitDelay={exitDelay}
            >
              {celebrating && !shouldReduceMotion ? (
                <FilterCardRipple
                  key={celebration?.id}
                  layout={layout}
                  opacity={RIPPLE_OPACITY}
                  scale={RIPPLE_SCALE}
                  duration={RIPPLE_DURATION}
                />
              ) : null}
              <FilterCardHoverLift hovered={hovered}>
                {/* The gesture, the preview and the dead posture all live
                    inside the glyph, one part at a time, so this wrapper
                    carries only colour. */}
                <span
                  // The colour rides the wrapper rather than the glyph. It is
                  // a class here and not a motion target, so the only place to
                  // put the reset's turn is a transition-delay, and the glyph
                  // itself takes no style prop. The strokes are currentColor,
                  // so they inherit the value as it transitions.
                  className={cn(
                    "flex items-center justify-center transition-colors duration-150",
                    checked ? "text-brand-strong" : "text-muted-foreground",
                  )}
                  style={resetDelayStyle(checked, exitDelay)}
                >
                  <GoodWithGlyph
                    facet={key}
                    gesture={celebrating ? "celebrate" : "rest"}
                    previewing={previewing}
                    dead={dead}
                    shouldReduceMotion={shouldReduceMotion ?? false}
                    className="size-5"
                  />
                </span>
              </FilterCardHoverLift>
            </FilterCardIconWell>

            <FilterCardTail
              layout={layout}
              label={label}
              checked={checked}
              {...note}
              descriptionAfterCount
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

// Commas and the joining word are the sentence's own punctuation; the words
// being joined all come from the message catalogue.
function joinPhrases(phrases: string[], joiner: string): string {
  if (phrases.length < 2) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} ${joiner} ${phrases[phrases.length - 1]}`;
}
