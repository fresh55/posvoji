"use client";

import { m, useReducedMotion } from "motion/react";
import { useId, type ReactElement } from "react";
import { AgeGrowthControl } from "@/components/filters/age-growth-control";
import { CareCards, type CareOption } from "@/components/filters/care-cards";
import { EnergyCards } from "@/components/filters/energy-cards";
import { HomeCards, type HomeOption } from "@/components/filters/home-cards";
import type { FilterActionContract } from "@/components/filters/filter-contract";
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
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
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
  type CareKey,
  type FilterOption,
  type Filters,
  type GoodWithKey,
  type HomeKey,
  type MultiGroup,
  type ToggleDef,
  type ToggleKey,
} from "@/lib/filters";
import { useI18n } from "@/components/i18n-context";
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
  layout: FilterCardLayout;
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

/** Everything the home section needs, absent while no animal answers it. Its
    sentence names both numbers for the same reason Družba's does. */
export type HomeSection = {
  options: HomeOption[];
  counts: Map<string, number>;
  resultCount: number;
  total: number;
  onToggle: (key: HomeKey) => void;
  onToggleMany: (values: HomeKey[]) => void;
};

/** Everything the special-care section needs, absent while no animal answers
    it. */
export type CareSection = {
  options: CareOption[];
  counts: Map<string, number>;
  resultCount: number;
  total: number;
  onToggle: (key: CareKey) => void;
  onToggleMany: (values: CareKey[]) => void;
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
      // Health labels ("Sterilizacija", "Cepljenje") are long enough that
      // three sheet columns clip them badly at 320px; two leaves room.
      sheetColumns={sheetColumnsFor(toggles.length, 2)}
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
                        ? "text-brand-strong"
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
  layout,
}: Omit<GroupProps, "group">) {
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
          layout={layout}
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
  layout,
}: Omit<GroupProps, "group">) {
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
          layout={layout}
        />
      </CollapsibleBody>
    </section>
  );
}

const COAT_SWATCHES: Record<string, string> = {
  black: "#292524",
  white: "#ffffff",
  grey: "#8b8b8b",
  brown: "#795548",
  orange: "#d88a3d",
  cream: "#e8d8b7",
  multicolour: "conic-gradient(#292524 0deg 120deg, #d88a3d 120deg 240deg, #ffffff 240deg)",
};

function OptionGroup({
  group,
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout,
  collapse,
}: GroupProps) {
  const { locale } = useI18n();
  const label = groupLabel(group, locale);
  let hint: string | undefined;
  if (group === "waiting") {
    hint = locale === "sl" ? "Po znanem datumu sprejema v zavetišče." : "Based on the recorded shelter intake date.";
  } else if (group === "coatColor") {
    hint = locale === "sl" ? "Iščemo po prevladujoči barvi." : "Filter by predominant colour.";
  }
  return (
    <FilterCardSection
      label={label}
      hint={hint}
      active={selected.length > 0}
      onReset={() => onToggleMany(selected)}
      resetAriaLabel={(locale === "sl" ? "Ponastavi: " : "Reset: ") + label}
      layout={layout}
      collapse={collapse}
      sheetColumns="grid-cols-2"
    >
      {options.map(({ value, label: option }) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={checked}
            aria-label={option + ", " + animalCount(count, locale)}
            disabled={isDeadOption(count, checked)}
            onClick={() => onToggle(value)}
            className={filterCardVariants({
              layout,
              selected: checked,
              className: cn("flex", filterCardLayoutClass(layout)),
            })}
          >
            <FilterCardMark layout={layout} checked={checked} appearDelay={0} />
            {group === "coatColor" && (
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-full border border-foreground/20"
                style={{ background: COAT_SWATCHES[value] }}
              />
            )}
            <FilterCardTail
              layout={layout}
              label={option}
              checked={checked}
              renderCount={(className) => <CountRoll value={count} className={className} />}
            />
          </button>
        );
      })}
    </FilterCardSection>
  );
}

// Every group names its own renderer. The declared return type is what makes a
// new CardGroup fail to compile here rather than inherit whichever branch
// happens to be last.
function FilterGroup({ group, ...rest }: GroupProps): ReactElement {
  switch (group) {
    case "coatColor":
    case "coatLength":
    case "waiting":
      return <OptionGroup group={group} {...rest} />;
    case "age":
      return (
        <AgeGrowthControl
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          layout={rest.layout}
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
          layout={rest.layout}
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
          layout={rest.layout}
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
          layout={rest.layout}
          collapse={rest.collapse}
        />
      );
  }
}

/**
 * The options a layout draws, which is not always every option a section has.
 *
 * A dead option explains itself on the sheet, where there is a tile with a 0
 * in it and a page to scroll. In the sidebar it costs the panel its fold: the
 * column is 224px of rows in a 720px window with nine sections in it, and a
 * row that answers nothing pushes a section that does below the fold. So the
 * sidebar draws the live options only, the same rule PR #231 applied one level
 * up when it stopped drawing a section the pool answers nothing of.
 *
 * One option always stays, because a section must not fold down to a bare
 * heading. That is reachable: the section survives PR #231's test on the
 * species pool while the counts are taken against the whole filter state, so
 * a narrowing in one section can zero every option of another. The one kept
 * is the first, which is the section's own leading answer and the same row
 * each time, rather than whichever happens to sit last.
 *
 * Age is not filtered. Its three stages are one drawing: the grove above the
 * rows is a three-column grid whose plants stand over the rows they belong to,
 * so an age stage is not a row that can be taken out on its own.
 *
 * Here and not in filter-card.tsx, which is the surface primitive the portal
 * shares: which options a list puts on screen is this list's rule, and
 * FilterGroupList below is its only caller.
 */
export function drawnOptions<T>(
  options: T[],
  layout: FilterCardLayout,
  isDead: (option: T) => boolean,
): T[] {
  if (layout !== "sidebar") return options;
  const live = options.filter((option) => !isDead(option));
  return live.length > 0 ? live : options.slice(0, 1);
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
  home,
  care,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  layout = "sidebar",
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  goodWith?: GoodWithSection;
  home?: HomeSection;
  care?: CareSection;
  /** The sheet draws tiles; the sidebar draws rows. */
  layout?: FilterCardLayout;
} & FilterActionContract) {
  const { locale } = useI18n();
  const appearanceGroups = groups.filter(({ group }) => group === "coatColor" || group === "coatLength");
  const appearanceSelected = [...filters.coatColor, ...filters.coatLength];
  const { isOpen, toggleSection } = useFilterSections({
    layout,
    initiallyOpen: layout === "sheet" ? {
      sex: filters.sex.length > 0,
      age: filters.age.length > 0,
      size: filters.size.length > 0,
      energy: filters.energy.length > 0,
      appearance: appearanceSelected.length > 0,
      waiting: filters.waiting.length > 0,
      health: filters.toggles.length > 0,
      goodWith: filters.goodWith.length > 0,
      home: filters.home.length > 0,
      care: filters.care.length > 0,
    } : undefined,
  });
  // One base per list, so a header and the body it controls agree on an id
  // even with the sidebar and the sheet mounted at once.
  const idBase = useId();

  // Which of a section's options this layout draws. The rule and the reason
  // for it are in drawnOptions; it is applied here, once, rather than in each
  // of the seven section components, so no section can quietly opt out. The
  // closed-section summary below still reads its labels off the full list,
  // which differs only by options nobody has chosen.
  const drawn = <T,>(options: T[], isDead: (option: T) => boolean) =>
    drawnOptions(options, layout, isDead);

  // The same call four times over, in the four sections whose options carry a
  // `key`: health, Družba, Dom and Posebna skrb. Each differed only in which
  // tally to count in and which list of chosen values to ask, and spelled the
  // dead test out again to say so.
  //
  // Two shapes and not one, because the options have two shapes. The card
  // groups below key on `value` (FilterOption, which is what lib/filters
  // builds a group from) and these four key on `key`, so a single helper would
  // have to take a reader function per call and would be the thing it
  // replaced. The groups.map case keeps its own call.
  const drawnByKey = <T extends { key: string }>(
    options: T[],
    counts: Map<string, number>,
    selected: readonly string[],
  ): T[] =>
    drawn(options, ({ key }) =>
      isDeadOption(counts.get(key) ?? 0, selected.includes(key)),
    );

  // Every section folds, on both surfaces. This was a prop for the pass in
  // which only the sidebar folded; the phone sheet joined it on 2026-09-17
  // (filter-sheet.tsx has the numbers: nine open sections through a 189px
  // window at 320x568), and with both callers passing the same answer the
  // unfolded list was a configuration the site no longer had.
  const collapseFor = (
    key: FilterSectionKey,
    summary: string | null,
  ): SectionCollapse => ({
    open: isOpen(key),
    onToggle: () => toggleSection(key),
    summary,
    contentId: `${idBase}-${key}`,
  });
  const appearanceOptions = appearanceGroups.flatMap(({ options }) => options);
  const appearanceCollapse = collapseFor(
    "appearance",
    selectionSummary(
      appearanceSelected,
      (value) => appearanceOptions.find((option) => option.value === value)?.label,
    ),
  );

  return (
    <>
      {groups.map(({ group, options }) => {
        if (group === "coatColor" || group === "coatLength") return null;
        // Read once and widened to string[]: indexed by a union of groups,
        // filters[group] is a union of arrays, and .includes on one of those
        // takes the intersection of their element types, which is never.
        const selected: string[] = filters[group];
        const groupCounts = counts[group];

        return (
          <FilterGroup
            key={group}
            group={group}
            layout={layout}
            // Age keeps every stage in both layouts: drawnOptions says why.
            options={
              group === "age"
                ? options
                : drawn(options, ({ value }) =>
                    isDeadOption(
                      groupCounts.get(value) ?? 0,
                      selected.includes(value),
                    ),
                  )
            }
            counts={groupCounts}
            selected={selected}
            onToggle={(value) => onToggle(group, value)}
            onToggleMany={(values) => onToggleMany(group, values)}
            collapse={collapseFor(
              group,
              selectionSummary(
                selected,
                (value) =>
                  options.find((option) => option.value === value)?.label,
              ),
            )}
          />
        );
      })}

      {appearanceGroups.length > 0 && (
        <section>
          <FilterSectionHeader
            label={locale === "sl" ? "Videz" : "Appearance"}
            active={appearanceSelected.length > 0}
            collapse={appearanceCollapse}
          />
          <CollapsibleBody collapse={appearanceCollapse}>
            <div className="space-y-4 pt-2">
              {appearanceGroups.map(({ group, options }) => (
                <FilterGroup
                  key={group}
                  group={group}
                  layout={layout}
                  options={options}
                  counts={counts[group]}
                  selected={filters[group]}
                  onToggle={(value) => onToggle(group, value)}
                  onToggleMany={(values) => onToggleMany(group, values)}
                />
              ))}
            </div>
          </CollapsibleBody>
        </section>
      )}

      {toggles.length > 0 && (
        <HealthToggleCards
          toggles={drawnByKey(toggles, toggleTally, filters.toggles)}
          counts={toggleTally}
          selected={filters.toggles}
          onToggle={onToggleProperty}
          onToggleMany={onToggleManyProperties}
          layout={layout}
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
          options={drawnByKey(
            goodWith.options,
            goodWith.counts,
            filters.goodWith,
          )}
          counts={goodWith.counts}
          selected={filters.goodWith}
          resultCount={goodWith.resultCount}
          total={goodWith.total}
          onToggle={goodWith.onToggle}
          onToggleMany={goodWith.onToggleMany}
          layout={layout}
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

      {/* Dom follows Družba: both ask what the visitor's household is like,
          and Posebna skrb closes the list because it is the one section that
          asks what the visitor is willing to take on. */}
      {home && home.options.length > 0 && (
        <HomeCards
          options={drawnByKey(home.options, home.counts, filters.home)}
          counts={home.counts}
          selected={filters.home}
          resultCount={home.resultCount}
          total={home.total}
          onToggle={home.onToggle}
          onToggleMany={home.onToggleMany}
          layout={layout}
          collapse={collapseFor(
            "home",
            selectionSummary(
              filters.home,
              (value) =>
                home.options.find((option) => option.key === value)?.label,
            ),
          )}
        />
      )}

      {care && care.options.length > 0 && (
        <CareCards
          options={drawnByKey(care.options, care.counts, filters.care)}
          counts={care.counts}
          selected={filters.care}
          resultCount={care.resultCount}
          total={care.total}
          onToggle={care.onToggle}
          onToggleMany={care.onToggleMany}
          layout={layout}
          collapse={collapseFor(
            "care",
            selectionSummary(
              filters.care,
              (value) =>
                care.options.find((option) => option.key === value)?.label,
            ),
          )}
        />
      )}
    </>
  );
}
