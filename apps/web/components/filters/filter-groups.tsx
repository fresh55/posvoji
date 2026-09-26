"use client";

import { Fragment, useId, type ReactElement, type ReactNode } from "react";
import { AgeGrowthControl } from "@/components/filters/age-growth-control";
import { CareCards } from "@/components/filters/care-cards";
import {
  CoatColorCards,
  CoatLengthCards,
} from "@/components/filters/coat-cards";
import { EnergyCards } from "@/components/filters/energy-cards";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import {
  isDeadOption,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  SectionNote,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import {
  GoodWithCards,
  type GoodWithOption,
} from "@/components/filters/good-with-cards";
import { HealthToggleCards } from "@/components/filters/health-cards";
import { SexCards } from "@/components/filters/sex-cards";
import { SizePawCards } from "@/components/filters/size-paw-cards";
import { UnansweredNote } from "@/components/filters/unanswered-note";
import { WaitingCards } from "@/components/filters/waiting-cards";
import { useResetStagger } from "@/components/filters/use-filter-motion";
import {
  answeredSections,
  useFilterSections,
  type FilterSectionKey,
} from "@/components/filters/use-filter-sections";
import {
  groupLabel,
  namesUnanswered,
  picksEverySex,
  type CareKey,
  type CareOption,
  type FilterFacet,
  type FilterOption,
  type Filters,
  type GoodWithKey,
  type MultiGroup,
  type ToggleDef,
  type Unanswered,
  type UnansweredTally,
} from "@/lib/filters";
import { useI18n } from "@/components/i18n-context";

type GroupProps = {
  // Barva is drawn by the Videz block itself, which also hands it the species
  // tab its swatches grow the ears of. No other group reads the species.
  group: Exclude<CardGroup, "coatColor">;
  layout: FilterCardLayout;
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  collapse?: SectionCollapse;
  /** What a pick in this section leaves out for want of an answer. */
  unanswered?: Unanswered;
  /** Velikost on Vse, where a pick leaves out every cat (groupAsks in
   *  lib/filters/engine.ts) and the rows alone do not say so. */
  leavesOutCats?: boolean;
  /** This section's picks the sidebar keeps drawn (KeptPicks). */
  kept?: readonly string[];
};

export type CardGroup = Exclude<MultiGroup, "shelter">;

/**
 * The picks the sidebar keeps drawn once they come off, by section: those
 * that read 0 while they were picked on the current species tab
 * (use-animal-filter-model.ts remembers them until the tab changes).
 *
 * Such a row was drawn only for its pick, so unticking it took it away in the
 * same render, from under the pointer and with keyboard focus on it. The
 * sidebar answers a kept pick the way it answers a selection wherever it asks
 * whether an option is dead: drawnOptions draws it, and its section leaves it
 * enabled, since a disabled row gives up focus too. It reads 0 and can be
 * picked again. The sheet passes none: a dead option keeps its tile there.
 */
export type KeptPicks = Partial<Record<FilterFacet, readonly string[]>>;

const NOTHING_KEPT: readonly string[] = [];

/**
 * The order the panel asks its questions in, top to bottom, in the sidebar and
 * the sheet alike. Kje comes before all of it, drawn by each surface itself.
 *
 * It is the order adopters decide in rather than the order an animal's record
 * reads in. In the ASPCA's study of 1,491 adopters, behaviour with people and
 * age mattered to about two thirds or more and sex to about a third, and UK
 * rescues ask where, then what the home already holds, then age, and do not
 * offer sex at all. So age and size first, then what the home already holds
 * (Doma imam) and the lab answer a household with a cat needs beside it
 * (Zdravje: FIV and FeLV), then temperament, then sex and looks. The two
 * sections about what the visitor can give and how long an animal has waited
 * close the list.
 *
 * Čaka na dom stays last, and never beside Starost: the same months and years
 * beside the age rows read as an age.
 *
 * The chips row reads in the same order (FILTER_FACETS in
 * lib/filters/contracts.ts), and filter-groups.test.tsx holds the two together.
 */
export const SECTION_ORDER = [
  "age",
  "size",
  "goodWith",
  "health",
  "energy",
  "sex",
  "appearance",
  "care",
  "waiting",
] as const satisfies readonly FilterSectionKey[];

// A section missing from SECTION_ORDER fails to compile here.
const everySectionOrdered: [
  Exclude<FilterSectionKey, (typeof SECTION_ORDER)[number]>,
] extends [never]
  ? true
  : never = true;
void everySectionOrdered;

/** The two groups Videz owns. */
const isAppearance = (
  group: MultiGroup,
): group is "coatColor" | "coatLength" =>
  group === "coatColor" || group === "coatLength";

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

/** Everything Lahko ponudim needs, absent while no animal answers it. */
export type CareSection = {
  options: CareOption[];
  counts: Map<string, number>;
  resultCount: number;
  total: number;
  onToggle: (key: CareKey) => void;
  onToggleMany: (values: CareKey[]) => void;
};

function SizeGroup({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  collapse,
  layout,
  unanswered,
  leavesOutCats,
  kept,
}: Omit<GroupProps, "group">) {
  const { locale, messages, t } = useI18n();
  const { isResetting, beginReset } = useResetStagger(
    selected.length,
    options.length,
  );

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
          kept={kept}
          onToggle={onToggle}
          isResetting={isResetting}
          layout={layout}
        />
        {/* On Vse a pick leaves out two kinds of animal: cats, which are
            never asked (leavesOutCats), and the others with no answer. Said
            separately that was four 11px lines under the rows; one sentence
            is two. The count is the plain unanswered share (namesUnanswered
            gates it below the tenth worth mentioning), so the sentence only
            ever says what a pick leaves out. */}
        {leavesOutCats ? (
          <SectionNote>
            {unanswered && namesUnanswered(unanswered)
              ? t("sizeLeavesOutCatsAndUnanswered", {
                  count: unanswered.unanswered,
                })
              : messages.sizeLeavesOutCats}
          </SectionNote>
        ) : (
          <UnansweredNote tally={unanswered} />
        )}
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
  unanswered,
  kept,
}: Omit<GroupProps, "group">) {
  const { locale, messages } = useI18n();
  // The reset lives on the heading here, so the stagger does too, and the
  // cards are handed their turns.
  const { beginReset, resetDelay } = useResetStagger(
    selected.length,
    options.length,
  );

  return (
    <section>
      <FilterSectionHeader
        label={groupLabel("sex", locale)}
        active={selected.length > 0}
        onReset={() => {
          beginReset();
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetSexFilters}
        collapse={collapse}
      />
      <CollapsibleBody collapse={collapse}>
        <SexCards
          options={options}
          counts={counts}
          selected={selected}
          kept={kept}
          onToggle={onToggle}
          layout={layout}
          resetDelay={resetDelay}
        />
        {/* Both ticked leave nobody out, so the unanswered line would be
            saying something untrue; this one says what both do. */}
        {picksEverySex(selected) ? (
          <SectionNote>{messages.sexBothLine}</SectionNote>
        ) : (
          <UnansweredNote tally={unanswered} />
        )}
      </CollapsibleBody>
    </section>
  );
}

// Every group names its own renderer. The declared return type is what makes a
// new CardGroup fail to compile here rather than inherit whichever branch
// happens to be last.
function FilterGroup({ group, ...rest }: GroupProps): ReactElement {
  switch (group) {
    case "coatLength":
      return <CoatLengthCards {...rest} />;
    case "waiting":
      return (
        <WaitingCards {...rest} />
      );
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
          unanswered={rest.unanswered}
        />
      );
    case "sex":
      return (
        <SexGroup
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          kept={rest.kept}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          collapse={rest.collapse}
          layout={rest.layout}
          unanswered={rest.unanswered}
        />
      );
    case "size":
      return (
        <SizeGroup
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          kept={rest.kept}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          collapse={rest.collapse}
          layout={rest.layout}
          unanswered={rest.unanswered}
          leavesOutCats={rest.leavesOutCats}
        />
      );
    case "energy":
      return (
        <EnergyCards
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          kept={rest.kept}
          onToggle={rest.onToggle}
          onToggleMany={rest.onToggleMany}
          layout={rest.layout}
          collapse={rest.collapse}
          unanswered={rest.unanswered}
        />
      );
  }
}

/**
 * The options a layout draws, which is not always every option a section has.
 *
 * A dead option explains itself on the sheet, where there is a tile with a 0
 * in it and a page to scroll. In the sidebar it costs the panel its fold: the
 * column is one list of rows in a 720px window with nine sections in it, and
 * a row that answers nothing pushes a section that does below the fold. So the
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
  care,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  layout = "sidebar",
  unanswered,
  kept,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  goodWith?: GoodWithSection;
  care?: CareSection;
  /** The sheet draws tiles; the sidebar draws rows. */
  layout?: FilterCardLayout;
  /** The picks the sidebar keeps drawn once they come off (KeptPicks). Only
   *  the sidebar passes them. */
  kept?: KeptPicks;
  /** What each question leaves out for want of an answer (unansweredCounts).
   *  Without it the sections say nothing about it, which is all a caller
   *  that has no dataset behind it can honestly say. */
  unanswered?: UnansweredTally;
} & FilterActionContract) {
  const { locale } = useI18n();
  const appearanceGroups = groups.filter(({ group }) => isAppearance(group));
  const appearanceSelected = [...filters.coatColor, ...filters.coatLength];
  // Both layouts now. This was the sheet's alone, for the pass in which the
  // sidebar's sections could not be reached by anything but a click inside
  // them; a shared link carries answers into folded sections on either
  // surface, and the panel that hid them was the one standing open beside the
  // grid the whole time. useFilterSections says when a section reveals itself
  // and what an arriving address does to the sections that are open by
  // default; answeredSections is the one table saying which section a facet
  // answers in, read here and by the pills that go back to them.
  const { isOpen, toggleSection } = useFilterSections({
    layout,
    active: answeredSections(filters),
    species: filters.species,
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

  // A section's kept picks (KeptPicks), which count as picked in every dead
  // test here and in the section's own, so a row drawn for them is also a
  // row that can hold focus.
  const keptOf = (facet: FilterFacet): readonly string[] =>
    kept?.[facet] ?? NOTHING_KEPT;

  // The same call three times over, in the three sections whose options carry a
  // `key`: health, Družba and Lahko ponudim. Each differed only in which
  // tally to count in and which section's picks to ask, and spelled the dead
  // test out again to say so.
  //
  // Two shapes and not one, because the options have two shapes. The card
  // groups key on `value` (FilterOption, which is what lib/filters builds a
  // group from) and these three key on `key`, so a single helper would have to
  // take a reader function per call and would be the thing it replaced.
  const drawnByKey = <T extends { key: string }>(
    facet: "toggles" | "goodWith" | "care",
    options: T[],
    counts: Map<string, number>,
  ): T[] => {
    const selected: readonly string[] = filters[facet];
    const keptHere = keptOf(facet);
    return drawn(options, ({ key }) =>
      isDeadOption(
        counts.get(key) ?? 0,
        selected.includes(key),
        keptHere.includes(key),
      ),
    );
  };

  // The card groups' own, keyed on `value`. Two keep every option in both
  // layouts. Starost's four stages are one drawing: the grove above the rows
  // is a four-column grid whose plants stand over the rows they belong to.
  // Barva draws as a palette, and a dropped swatch reflowed the rest, each
  // solid colour splitting from its two-toned twin; a dead swatch is drawn
  // disabled in its own cell instead. An option the species pool never
  // answers at all is a different question, answered where the options are
  // built (liveInPool in use-animal-filter-model.ts).
  const drawnByValue = (
    group: CardGroup,
    options: FilterOption[],
  ): FilterOption[] => {
    if (group === "age" || group === "coatColor") return options;
    const selected: readonly string[] = filters[group];
    const keptHere = keptOf(group);
    return drawn(options, ({ value }) =>
      isDeadOption(
        counts[group].get(value) ?? 0,
        selected.includes(value),
        keptHere.includes(value),
      ),
    );
  };

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

  // A card group's section, or nothing where this pool leaves the group out.
  const cardSection = (
    group: Exclude<CardGroup, "coatColor" | "coatLength">,
  ) => {
    const options = groups.find((entry) => entry.group === group)?.options;
    if (!options) return null;
    // Read once and widened to string[]: indexed by a union of groups,
    // filters[group] is a union of arrays, and .includes on one of those
    // takes the intersection of their element types, which is never.
    const selected: string[] = filters[group];
    const groupCounts = counts[group];

    return (
      <FilterGroup
        group={group}
        layout={layout}
        options={drawnByValue(group, options)}
        counts={groupCounts}
        selected={selected}
        kept={keptOf(group)}
        onToggle={(value) => onToggle(group, value)}
        onToggleMany={(values) => onToggleMany(group, values)}
        collapse={collapseFor(
          group,
          selectionSummary(
            selected,
            (value) => options.find((option) => option.value === value)?.label,
          ),
        )}
        unanswered={unanswered?.groups[group]}
        leavesOutCats={group === "size" && filters.species === "all"}
      />
    );
  };

  // Every section by its key, drawn in SECTION_ORDER below. A record and not a
  // list, so a section with no entry here fails to compile, and the order is
  // stated in one place only: it used to be the groups in URL order and then
  // five sections placed by hand after them.
  const sections: Record<FilterSectionKey, ReactNode> = {
    age: cardSection("age"),
    size: cardSection("size"),
    goodWith: goodWith && goodWith.options.length > 0 && (
      <GoodWithCards
        options={drawnByKey("goodWith", goodWith.options, goodWith.counts)}
        sectionKeys={goodWith.options.map(({ key }) => key)}
        counts={goodWith.counts}
        selected={filters.goodWith}
        kept={keptOf("goodWith")}
        resultCount={goodWith.resultCount}
        total={goodWith.total}
        onToggle={goodWith.onToggle}
        onToggleMany={goodWith.onToggleMany}
        unanswered={unanswered?.goodWith}
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
    ),
    health: toggles.length > 0 && (
      <HealthToggleCards
        toggles={drawnByKey("toggles", toggles, toggleTally)}
        sectionKeys={toggles.map(({ key }) => key)}
        counts={toggleTally}
        selected={filters.toggles}
        kept={keptOf("toggles")}
        onToggle={onToggleProperty}
        onToggleMany={onToggleManyProperties}
        layout={layout}
        unanswered={unanswered?.toggles}
        collapse={collapseFor(
          "health",
          selectionSummary(
            filters.toggles,
            (value) => toggles.find((toggle) => toggle.key === value)?.label,
          ),
        )}
      />
    ),
    energy: cardSection("energy"),
    sex: cardSection("sex"),
    appearance: appearanceGroups.length > 0 && (
      <section>
        <FilterSectionHeader
          label={locale === "sl" ? "Videz" : "Appearance"}
          active={appearanceSelected.length > 0}
          collapse={appearanceCollapse}
        />
        <CollapsibleBody collapse={appearanceCollapse}>
          <div className="space-y-4 pt-2">
            {appearanceGroups.map(({ group, options }) => {
              const selected: string[] = filters[group];
              const groupCounts = counts[group];
              const props = {
                layout,
                options: drawnByValue(group, options),
                counts: groupCounts,
                selected,
                onToggle: (value: string) => onToggle(group, value),
                onToggleMany: (values: string[]) => onToggleMany(group, values),
                unanswered: unanswered?.groups[group],
              };

              return group === "coatColor" ? (
                <CoatColorCards
                  key={group}
                  {...props}
                  species={filters.species}
                  longCoat={filters.coatLength.includes("long")}
                />
              ) : (
                <FilterGroup
                  key={group}
                  group={group}
                  {...props}
                  kept={keptOf(group)}
                />
              );
            })}
          </div>
        </CollapsibleBody>
      </section>
    ),
    care: care && care.options.length > 0 && (
      <CareCards
        options={drawnByKey("care", care.options, care.counts)}
        counts={care.counts}
        selected={filters.care}
        kept={keptOf("care")}
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
    ),
    waiting: cardSection("waiting"),
  };

  return (
    <>
      {SECTION_ORDER.map((key) => (
        <Fragment key={key}>{sections[key]}</Fragment>
      ))}
    </>
  );
}
