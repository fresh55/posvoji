"use client";

import { m, useReducedMotion } from "motion/react";
import { memo } from "react";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardRipple,
  FilterCardSection,
  FilterCardTail,
  MARK_APPEAR_DURATION,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  sheetColumnsFor,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  SectionNote,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import {
  CHECK_DELAY,
  READ_END,
  RIM,
  TestTubeGlyph,
  tubeTracks,
} from "@/components/filters/health-glyphs";
import { useRowNotes } from "@/components/filters/unanswered-note";
import {
  useFilterCardHover,
  useOneShotCelebration,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import type { ToggleDef, ToggleKey, Unanswered } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The ring leaving the tube as a test is switched on, the household section's
// ring: the same press, answered the same way.
const RIPPLE_OPACITY = 0.5;
const RIPPLE_SCALE = 1.35;
const RIPPLE_DURATION = 0.35;

// Every phase of a pick, measured from the press. The hold has to outlast the
// slowest of them, with a few frames to spare, because clearing the one-shot
// settles whatever is still moving back to rest.
const HOLD_MS =
  Math.ceil(
    1000 *
      Math.max(READ_END, RIPPLE_DURATION, CHECK_DELAY + MARK_APPEAR_DURATION),
  ) + 50;

/**
 * The row's tube: the hover's tip and the pick's read on spans of their own,
 * both about the rim, so a pick under the pointer eases out of the tip while
 * the read lifts. Memoised, because the section renders again for every
 * hover and press on any of its rows, and this takes only primitives.
 */
const HealthTube = memo(function HealthTube({
  checked,
  reading,
  previewing,
  reduced,
  resetDelay,
  dead,
}: {
  checked: boolean;
  reading: boolean;
  previewing: boolean;
  reduced: boolean;
  resetDelay: number;
  dead: boolean;
}) {
  const tracks = tubeTracks({ checked, reading, previewing, reduced, resetDelay });
  return (
    <m.span
      className="flex items-center justify-center"
      style={RIM}
      data-tipped={previewing ? "" : undefined}
      initial={false}
      animate={tracks.preview.animate}
      transition={tracks.preview.transition}
    >
      <m.span
        className="flex items-center justify-center"
        style={RIM}
        initial={false}
        animate={tracks.tilt.animate}
        transition={tracks.tilt.transition}
      >
        <TestTubeGlyph
          tracks={tracks}
          className={cn(
            // rotate and not transform: that is the property Tailwind's
            // rotate-* sets, so a row the narrowing empties tips over rather
            // than jumping.
            "size-5 transition-[opacity,rotate] duration-200 motion-reduce:transition-none",
            // A row with no animal left to show: the tube lies tipped over,
            // emptied.
            dead && "rotate-[25deg] opacity-60",
          )}
        />
      </m.span>
    </m.span>
  );
});

/**
 * Zdravje: the two cat tests, FIV and FeLV, the only health questions the
 * panel still asks (FILTER_TOGGLE_KEYS in lib/filters/contracts.ts). Both rows
 * draw the one tube (health-glyphs.tsx), and a pick works it: the sample is
 * drawn in and the tube is raised once to be read.
 */
export function HealthToggleCards({
  toggles,
  counts,
  selected,
  kept = [],
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
  unanswered,
  sectionKeys,
}: {
  toggles: ToggleDef[];
  /** Every test the section has, drawn or not (useRowNotes). */
  sectionKeys?: readonly ToggleKey[];
  counts: Map<string, number>;
  selected: ToggleKey[];
  /** Picks the sidebar keeps drawn once they come off (KeptPicks in
   *  filter-groups.tsx); never dead. */
  kept?: readonly string[];
  onToggle: (key: ToggleKey) => void;
  onToggleMany: (values: ToggleKey[]) => void;
  layout?: FilterCardLayout;
  collapse?: SectionCollapse;
  /** Per test: a cat can carry an FeLV result and no FIV one. */
  unanswered?: Readonly<Record<ToggleKey, Unanswered>>;
}) {
  const { locale, messages } = useI18n();
  const reduced = useReducedMotion() ?? false;
  const rowNotes = useRowNotes(
    toggles.map(({ key }) => key),
    unanswered,
    "unansweredRow",
    sectionKeys,
  );
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<ToggleKey>(HOLD_MS);
  const { beginReset, resetDelay } = useResetStagger(
    selected.length,
    toggles.length,
  );
  const {
    hoveredValue: hoveredKey,
    previewing: previewingKey,
    settle,
    handlers: hoverHandlers,
  } = useFilterCardHover<ToggleKey>();

  return (
    <FilterCardSection
      label={messages.health}
      hint={messages.healthFilterHint}
      // The rows name FIV and FeLV and nothing else on the panel says what
      // they are. The dialog explains each result once it is on an animal;
      // the visitor choosing a row needs it here, on a phone too.
      lead={messages.healthLead}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetHealthFilters}
      layout={layout}
      collapse={collapse}
      // Two columns at most, for the line a tile carries under its label
      // saying how many cats have no result.
      sheetColumns={sheetColumnsFor(toggles.length, 2)}
      footer={
        rowNotes.section === undefined ? undefined : (
          <SectionNote>
            {rowNotes.section === "none"
              ? messages.unansweredNone
              : messages.unansweredHides}
          </SectionNote>
        )
      }
    >
      {toggles.map(({ key, label }, index) => {
        const count = counts.get(key) ?? 0;
        const checked = selected.includes(key);
        const dead = isDeadOption(count, checked, kept.includes(key));
        const hovered = hoveredKey === key;
        const reading = celebration?.value === key && checked;
        const exitDelay = resetDelay(index);
        const note = rowNotes.at(index);
        // The hover shows the read a pick would play, so a test already
        // picked, or one with nothing to pick, has nothing to preview.
        const previewing = previewingKey(key) && !checked && !dead && !reduced;

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
              appearDelay={CHECK_DELAY}
            />

            <FilterCardIconWell
              layout={layout}
              checked={checked}
              exitDelay={exitDelay}
            >
              {reading && !reduced ? (
                <FilterCardRipple
                  key={celebration?.id}
                  layout={layout}
                  opacity={RIPPLE_OPACITY}
                  scale={RIPPLE_SCALE}
                  duration={RIPPLE_DURATION}
                />
              ) : null}
              <FilterCardHoverLift hovered={hovered}>
                <HealthTube
                  checked={checked}
                  reading={reading}
                  previewing={previewing}
                  reduced={reduced}
                  resetDelay={exitDelay}
                  dead={dead}
                />
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
