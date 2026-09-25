"use client";

import { useId, type ReactElement } from "react";
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
};

export type CardGroup = Exclude<MultiGroup, "shelter">;

/** The two groups Videz owns, and so the ones the flat list skips. */
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
}: Omit<GroupProps, "group">) {
  const { locale, messages, t } = useI18n();
  const { isResetting, beginReset } = useResetStagger(
    selected.length,
    options.length,
  );
  // On Vse this section can have two things to say about a pick: cats are
  // never asked at all (leavesOutCats), and some of the dogs and others who
  // are asked have no answer (unanswered). Said separately that was two
  // sentences each, four 11px lines stacked under the rows; folded into one
  // when both apply, it is two lines. The count stays the plain "some have no
  // answer" share (namesUnanswered already gates on that below the tenth
  // worth mentioning), so the sentence never claims a pick will show
  // something, only what it leaves out, and stays true whichever share it is.
  const unansweredApplies = unanswered !== undefined && namesUnanswered(unanswered);
  const sizeNote = !leavesOutCats
    ? null
    : unansweredApplies
      ? t("sizeLeavesOutCatsAndUnanswered", { count: unanswered.unanswered })
      : messages.sizeLeavesOutCats;

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
        {/* Cats first, folded into sizeNote with the plain unanswered count
            when both apply; UnansweredNote alone on a tab where cats do
            answer (sizeNote is then unused, leavesOutCats is false there). */}
        {leavesOutCats ? (
          <SectionNote>{sizeNote}</SectionNote>
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
  care,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  layout = "sidebar",
  unanswered,
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

  // The same call three times over, in the three sections whose options carry a
  // `key`: health, Družba and Lahko ponudim. Each differed only in which
  // tally to count in and which list of chosen values to ask, and spelled the
  // dead test out again to say so.
  //
  // Two shapes and not one, because the options have two shapes. The card
  // groups below key on `value` (FilterOption, which is what lib/filters
  // builds a group from) and these three key on `key`, so a single helper would
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

  const cardGroup = (
    group: Exclude<CardGroup, "coatColor" | "coatLength">,
    options: FilterOption[],
  ) => {
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
            (value) => options.find((option) => option.value === value)?.label,
          ),
        )}
        unanswered={unanswered?.groups[group]}
        leavesOutCats={group === "size" && filters.species === "all"}
      />
    );
  };
  const waiting = groups.find(({ group }) => group === "waiting");

  return (
    <>
      {groups.map(({ group, options }) =>
        // Videz draws these two itself, below, and Čaka na dom closes the
        // list. Skipped here rather than filtered out of the list first,
        // because only control flow narrows `group` for the call.
        isAppearance(group) || group === "waiting"
          ? null
          : cardGroup(group, options),
      )}

      {appearanceGroups.length > 0 && (
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
                  // Barva draws as a palette (CoatColorPalette in
                  // coat-cards.tsx), a grid of swatches rather than a column
                  // of rows, and drawnOptions dropping a dead one reflowed the
                  // rest: each solid colour split from its two-toned twin.
                  // The palette keeps every option and draws a dead swatch
                  // disabled in its own cell instead, the way the sheet's
                  // tiles already do for every section; only a row list keeps
                  // the sidebar's usual rule of leaving a dead row out, so
                  // Dolžina dlake here still gets it. A permanently dead
                  // option, one the species pool never answers at all, is a
                  // different question answered further up, in the options
                  // the pool builds this list from (use-animal-filter-model.ts).
                  options:
                    group === "coatColor"
                      ? options
                      : drawn(options, ({ value }) =>
                          isDeadOption(
                            groupCounts.get(value) ?? 0,
                            selected.includes(value),
                          ),
                        ),
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
                  <FilterGroup key={group} group={group} {...props} />
                );
              })}
            </div>
          </CollapsibleBody>
        </section>
      )}

      {toggles.length > 0 && (
        <HealthToggleCards
          toggles={drawnByKey(toggles, toggleTally, filters.toggles)}
          sectionKeys={toggles.map(({ key }) => key)}
          counts={toggleTally}
          selected={filters.toggles}
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
      )}

      {goodWith && goodWith.options.length > 0 && (
        <GoodWithCards
          options={drawnByKey(
            goodWith.options,
            goodWith.counts,
            filters.goodWith,
          )}
          sectionKeys={goodWith.options.map(({ key }) => key)}
          counts={goodWith.counts}
          selected={filters.goodWith}
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
      )}

      {/* Lahko ponudim comes after the animal's own traits: it is the one
          section that asks what the visitor can give rather than what they
          are looking for. */}
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

      {/* Čaka na dom closes the list. How long an animal has waited is a
          fact about its stay and not one of its traits, so it stands apart
          from them, and above all away from Starost: the same months and
          years beside the age rows read as an age. */}
      {waiting && cardGroup("waiting", waiting.options)}
    </>
  );
}
