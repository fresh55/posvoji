"use client";

import { m, useReducedMotion } from "motion/react";
import { useId, type ReactElement } from "react";
import { AgeGrowthControl } from "@/components/filters/age-growth-control";
import { EnergyCards } from "@/components/filters/energy-cards";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import {
  CollapsibleBody,
  FilterSectionHeader,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
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
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  GoodWithCards,
  type GoodWithOption,
} from "@/components/filters/good-with-cards";
import { SexCards } from "@/components/filters/sex-cards";
import { SizePawCards } from "@/components/filters/size-paw-cards";
import {
  useFilterCardHover,
  useOneShotCelebration,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import {
  useFilterSections,
  type FilterSectionKey,
} from "@/components/filters/use-filter-sections";
import {
  groupLabel,
  type FilterOption,
  type Filters,
  type GoodWithKey,
  type MultiGroup,
  type ToggleDef,
  type ToggleKey,
} from "@/lib/filters";
import { useI18n } from "@/components/i18n-provider";
import { HEALTH_ICONS } from "@/lib/animal-icons";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

type IconGesture = {
  rotate: number | number[];
  scale: number | number[];
  x: number | number[];
  y: number | number[];
};

const GESTURE_REST: IconGesture = { rotate: 0, scale: 1, x: 0, y: 0 };

// Each icon acts out the thing it stands for, once, as it is switched on.
const HEALTH_GESTURES: Record<ToggleKey, IconGesture> = {
  sterilizacija: { rotate: [0, -8, 5, 0], scale: 1, x: 0, y: 0 },
  // The lucide syringe carries its needle at the bottom left and its plunger at
  // the top right, so the press runs down that diagonal.
  cepljenje: { rotate: 0, scale: 1, x: [0, -1.2, 0], y: [0, 1.2, 0] },
  cip: { rotate: 0, scale: [1, 1.12, 1], x: 0, y: 0 },
  "brez-fiv": { rotate: 0, scale: [1, 1.1, 1], x: 0, y: 0 },
  "brez-felv": { rotate: [0, -6, 4, 0], scale: 1, x: 0, y: 0 },
};

const GESTURE_DURATION = 0.35;
const GESTURE_MS = 500;
// The check confirms as the icon gesture lands, not before it starts.
const GESTURE_CHECK_DELAY = 0.2;
const RIPPLE_OPACITY = 0.5;
const RIPPLE_SCALE = 1.35;
const RIPPLE_DURATION = 0.35;

type GroupProps = {
  group: CardGroup;
  ageLayout: "sidebar" | "sheet";
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  collapse?: SectionCollapse;
};

export type CardGroup = Exclude<MultiGroup, "shelter">;

/** Everything the household section needs, absent while no facet has data. */
export type GoodWithSection = {
  options: GoodWithOption[];
  counts: Map<string, number>;
  /** What the current filters leave, and the pool they were taken from. The
      section says both out loud, because its choices narrow together. */
  resultCount: number;
  total: number;
  onToggle: (key: GoodWithKey) => void;
  onToggleMany: (values: GoodWithKey[]) => void;
};

function HealthToggleCards({
  toggles,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
}: {
  toggles: ToggleDef[];
  counts: Map<string, number>;
  selected: ToggleKey[];
  onToggle: (key: ToggleKey) => void;
  onToggleMany: (values: ToggleKey[]) => void;
  layout?: FilterCardLayout;
  collapse?: SectionCollapse;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<ToggleKey>(GESTURE_MS);
  const { beginReset, resetDelay } = useResetStagger(selected.length);
  const { hoveredValue: hoveredKey, handlers: hoverHandlers } =
    useFilterCardHover();

  return (
    <FilterCardSection
      label={messages.health}
      hint={messages.healthFilterHint}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetHealthFilters}
      layout={layout}
      collapse={collapse}
    >
      {toggles.map(({ key, label }, index) => {
        const count = counts.get(key) ?? 0;
        const checked = selected.includes(key);
        const Icon = HEALTH_ICONS[key];
        const hovered = hoveredKey === key;
        const celebrating = celebration?.value === key && checked;

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
              onToggle(key);
            }}
            disabled={isDeadOption(count, checked)}
            {...hoverHandlers(key)}
            aria-pressed={checked}
            aria-label={`${label}, ${animalCount(count, locale)}`}
            className={filterCardVariants({
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
              exitDelay={resetDelay(index)}
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
                <m.span
                  className="flex items-center justify-center"
                  initial={false}
                  animate={
                    celebrating && !shouldReduceMotion
                      ? HEALTH_GESTURES[key]
                      : GESTURE_REST
                  }
                  transition={
                    celebrating && !shouldReduceMotion
                      ? { duration: GESTURE_DURATION, ease: "easeOut" }
                      : { duration: 0.16 }
                  }
                >
                  <Icon
                    className={cn(
                      "size-5 transition-colors duration-150",
                      checked
                        ? "text-[var(--filter-accent-strong)]"
                        : "text-muted-foreground",
                    )}
                    strokeWidth={1.65}
                  />
                </m.span>
              </FilterCardHoverLift>
            </FilterCardIconWell>

            <FilterCardTail
              layout={layout}
              label={label}
              checked={checked}
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

function SizeGroup({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  collapse,
}: Omit<GroupProps, "group" | "ageLayout">) {
  const { locale, messages } = useI18n();
  const { isResetting, beginReset } = useResetStagger(selected.length);

  return (
    <section>
      <FilterSectionHeader
        label={groupLabel("size", locale)}
        active={selected.length > 0}
        onReset={() => {
          beginReset();
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetSizeFilters}
        collapse={collapse}
      />
      <CollapsibleBody collapse={collapse}>
        <SizePawCards
          options={options}
          counts={counts}
          selected={selected}
          onToggle={onToggle}
          isResetting={isResetting}
        />
      </CollapsibleBody>
    </section>
  );
}

function SexGroup({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  collapse,
}: Omit<GroupProps, "group" | "ageLayout">) {
  const { locale, messages } = useI18n();

  return (
    <section>
      <FilterSectionHeader
        label={groupLabel("sex", locale)}
        active={selected.length > 0}
        onReset={() => onToggleMany(selected)}
        resetAriaLabel={messages.resetSexFilters}
        collapse={collapse}
      />
      <CollapsibleBody collapse={collapse}>
        <SexCards
          options={options}
          counts={counts}
          selected={selected}
          onToggle={onToggle}
        />
      </CollapsibleBody>
    </section>
  );
}

// Every group names its own renderer. The declared return type is what makes a
// new CardGroup fail to compile here rather than inherit whichever branch
// happens to be last.
function FilterGroup({ group, ...rest }: GroupProps): ReactElement {
  switch (group) {
    case "age":
      return (
        <AgeGrowthControl
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          layout={rest.ageLayout}
          collapse={rest.collapse}
        />
      );
    case "sex":
      return (
        <SexGroup
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          collapse={rest.collapse}
        />
      );
    case "size":
      return (
        <SizeGroup
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          collapse={rest.collapse}
        />
      );
    case "energy":
      return (
        <EnergyCards
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          layout={rest.ageLayout}
          collapse={rest.collapse}
        />
      );
  }
}

// A closed section still says what it holds: the first selected label, and how
// many more stand behind it. Language-neutral, so it needs no plural rules.
function selectionSummary(
  selected: string[],
  labelOf: (value: string) => string | undefined,
): string | null {
  if (selected.length === 0) return null;
  const first = labelOf(selected[0]) ?? selected[0];
  return selected.length === 1 ? first : `${first} +${selected.length - 1}`;
}

// The desktop sidebar and the mobile sheet frame these differently but show the
// same controls, so the list lives here and each frame supplies only its chrome.
export function FilterGroupList({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  goodWith,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  ageLayout = "sidebar",
  collapsible = false,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  goodWith?: GoodWithSection;
  ageLayout?: "sidebar" | "sheet";
  /** Folds sections behind their headers. The sidebar turns this on; the
      sheet scrolls as one page and leaves it off. */
  collapsible?: boolean;
} & FilterActionContract) {
  const { isOpen, toggleSection } = useFilterSections();
  // One base per list, so a header and the body it controls agree on an id
  // even with the sidebar and the sheet mounted at once.
  const idBase = useId();

  const collapseFor = (
    key: FilterSectionKey,
    summary: string | null,
  ): SectionCollapse | undefined =>
    collapsible
      ? {
          open: isOpen(key),
          onToggle: () => toggleSection(key),
          summary,
          contentId: `${idBase}-${key}`,
        }
      : undefined;

  return (
    <>
      {groups.map(({ group, options }) => (
        <FilterGroup
          key={group}
          group={group}
          ageLayout={ageLayout}
          options={options}
          counts={counts[group]}
          selected={filters[group]}
          onToggle={(value) => onToggle(group, value)}
          onToggleMany={(values) => onToggleMany(group, values)}
          collapse={collapseFor(
            group,
            selectionSummary(
              filters[group],
              (value) => options.find((option) => option.value === value)?.label,
            ),
          )}
        />
      ))}

      {toggles.length > 0 && (
        <HealthToggleCards
          toggles={toggles}
          counts={toggleTally}
          selected={filters.toggles}
          onToggle={onToggleProperty}
          onToggleMany={onToggleManyProperties}
          layout={ageLayout}
          collapse={collapseFor(
            "health",
            selectionSummary(
              filters.toggles,
              (value) => toggles.find((toggle) => toggle.key === value)?.label,
            ),
          )}
        />
      )}

      {goodWith && goodWith.options.length > 0 && (
        <GoodWithCards
          options={goodWith.options}
          counts={goodWith.counts}
          selected={filters.goodWith}
          resultCount={goodWith.resultCount}
          total={goodWith.total}
          onToggle={goodWith.onToggle}
          onToggleMany={goodWith.onToggleMany}
          layout={ageLayout}
          collapse={collapseFor(
            "goodWith",
            selectionSummary(
              filters.goodWith,
              (value) =>
                goodWith.options.find((option) => option.key === value)?.label,
            ),
          )}
        />
      )}
    </>
  );
}
