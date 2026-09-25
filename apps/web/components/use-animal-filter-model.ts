import { type Chip } from "@/components/filters/filter-chips";
import type { CardGroup } from "@/components/filters/filter-groups";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import type { ClientAnimal } from "@/lib/animal";
import {
  bySpecies,
  careCounts,
  careOptions,
  chipGains,
  chipKey,
  facetCounts,
  goodWithCounts,
  goodWithOptions,
  groupOptions,
  GROUPS,
  speciesCounts,
  speciesFacetCounts,
  toggleCounts,
  toggleLabel,
  unansweredCounts,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  valueChipLabel,
  visibleToggles,
  type MultiGroup,
} from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import {
  byShelterName,
  goodWithChipLabel,
  shelterChipLabel,
} from "@/lib/labels";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { summarizeShelters } from "@/lib/shelter-summary";
import { useMemo, useState } from "react";

type FilterActions = Pick<
  ReturnType<typeof useAnimalFilters>,
  | "filters"
  | "toggle"
  | "toggleProperty"
  | "toggleGoodWith"
  | "toggleManyGoodWith"
  | "toggleCare"
  | "toggleManyCare"
>;

/** Facet options, counts and recovery chips all describe the same result set. */
export function useAnimalFilterModel({
  animals,
  logos,
  reference,
  locale,
  resultCount,
  actions,
}: {
  animals: ClientAnimal[];
  logos: ShelterLogos;
  reference: Date;
  locale: Locale;
  resultCount: number;
  actions: FilterActions;
}) {
  const {
    filters,
    toggle,
    toggleProperty,
    toggleGoodWith,
    toggleManyGoodWith,
    toggleCare,
    toggleManyCare,
  } = actions;
  // Two numbers, deliberately. `speciesRoster` decides which tabs exist and
  // ignores the filters; `speciesTally` is what each tab draws and obeys all
  // of them except species. See speciesFacetCounts in lib/filters.ts for why
  // the tab counts stopped being the raw dataset, and species-tabs.tsx for
  // why the roster could not follow them.
  const speciesRoster = useMemo(() => speciesCounts(animals), [animals]);
  const speciesTally = useMemo(
    () => speciesFacetCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  // What the location picker's card says about a shelter beyond its filtered
  // count: which species live there and who has waited longest. Built from the
  // whole dataset and not from `visible`, so the card answers "who is this
  // shelter" rather than "what matches my filter" — the count pill next to the
  // shelter's name already carries the filtered number. Measured from
  // `reference`, the same way the age buckets above are.
  //
  // summarizeShelters only ever sees animals, so the logo is folded in here:
  // `logos` is keyed by the same shelter id (see shelter-block.tsx for the
  // same lookup against an animal's own shelter), and a shelter the fetch
  // never found a logo for is simply left for ShelterAvatar's initial-letter
  // fallback to answer.
  const shelterSummaries = useMemo(() => {
    const summaries = summarizeShelters(animals, locale, reference);
    for (const [id, summary] of summaries) {
      const logo = logos[id];
      if (logo) summary.logo = logo;
    }
    return summaries;
  }, [animals, locale, logos, reference]);
  const counts = useMemo(
    () => facetCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  // The panel follows the species tab and keeps every applicable group available
  // so a zero-count option is still there to explain its unknown state, which
  // the sheet's tile does; the sidebar leaves it out (drawnOptions in
  // filters/filter-groups.tsx) unless it is the section's only option. A
  // section no animal in the pool answers at all is the one exception: it has
  // no unknown to explain, only disabled zeros, so it goes whole until the
  // dataset carries the field.
  const pool = useMemo(
    () => bySpecies(animals, filters.species),
    [animals, filters.species],
  );
  // Zavetisce is split off from the rest. The others are short runs of options
  // you weigh against each other and belong in a column of small controls;
  // where you adopt from is a map, and it goes next to the species tabs as the
  // other question people arrive with.
  // filters and not just filters.species: a group the visitor has answered stays
  // on the panel even where the pool has nothing left to narrow, or the
  // selection goes on working from the URL with no control to switch it off
  // (visibleGroups in lib/filters.ts). Every visible* call below is passed its
  // own selection for the same reason.
  const shown = useMemo(
    () => visibleGroups(pool, filters, reference, true),
    [pool, filters, reference],
  );
  // A section, once drawn on a tab, stays for as long as the tab does.
  // visibleGroups keeps one the pool cannot narrow only while it is answered,
  // and an answer can stand where nothing else would draw the section:
  // carried over from another tab, or arriving in a link (Energija carried to
  // a tab nobody rated). Pressing the last one off there took the section out
  // from under the press, and keyboard focus with it. Set while rendering,
  // React's own shape for state that follows a value (use-filter-sections.ts
  // has the same).
  const [drawn, setDrawn] = useState(() => ({
    tab: filters.species,
    groups: GROUPS.filter((group) => shown[group]),
  }));
  const sameTab = drawn.tab === filters.species;
  const gained = GROUPS.filter(
    (group) => shown[group] && !(sameTab && drawn.groups.includes(group)),
  );
  if (!sameTab || gained.length > 0) {
    setDrawn({
      tab: filters.species,
      groups: sameTab ? [...drawn.groups, ...gained] : gained,
    });
  }
  const keptOnTab = drawn.groups;
  const groups = useMemo(
    () =>
      GROUPS.filter(
        (group): group is CardGroup =>
          group !== "shelter" && (shown[group] || keptOnTab.includes(group)),
      ).map((group) => ({ group, options: groupOptions(group, pool, locale) })),
    [keptOnTab, locale, pool, shown],
  );
  // The shelter picker uses the complete roster so visitors can widen their
  // search. Species and other filters change each shelter's count, not which
  // shelters are available to choose.
  // In the order a picker row reads (byShelterName).
  const shelters = useMemo(() => {
    const options = groupOptions("shelter", animals, locale).sort(byShelterName);
    return options.length > 0 ? options : undefined;
  }, [animals, locale]);
  // Their names, by id. The chips row used to ask optionLabel for each one,
  // and optionLabel rebuilds the whole roster from every animal to answer,
  // so a row of shelter chips walked the dataset once per pill on every
  // render. The roster above is that same walk, already done.
  const shelterLabels = useMemo(
    () => new Map((shelters ?? []).map(({ value, label }) => [value, label])),
    [shelters],
  );
  const toggles = useMemo(
    () =>
      visibleToggles(pool, filters.species, filters.toggles, true).map((toggle) => ({
        ...toggle,
        label: toggleLabel(toggle.key, locale),
      })),
    [locale, pool, filters.species, filters.toggles],
  );
  const toggleTally = useMemo(
    () => toggleCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  // What each question leaves out for want of an answer, beside the counts
  // above and over the same animals (unansweredCounts in lib/filters).
  const unanswered = useMemo(
    () => unansweredCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  // The two sections' counts, each a pass over the dataset, kept apart from
  // the result count they are drawn beside. That count follows the grid a
  // render behind (animal-grid.tsx), and in one memo with it the passes ran
  // twice per press: once for the filters and again when the count caught up.
  const goodWithTally = useMemo(
    () => goodWithCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  const careTally = useMemo(
    () => careCounts(animals, filters, reference),
    [animals, filters, reference],
  );

  // Every option of a live section stays visible; counts indicate which answers
  // are confirmed. visible* answers only whether the section is live at all,
  // so it returns every key or none (visibleFacet in lib/filters.ts).
  const goodWith = useMemo(() => {
    const keys = visibleGoodWith(pool, filters.goodWith, true);
    return {
      options: goodWithOptions(locale).filter((option) =>
        keys.includes(option.key),
      ),
      counts: goodWithTally,
      resultCount: resultCount,
      total: pool.length,
      onToggle: toggleGoodWith,
      onToggleMany: toggleManyGoodWith,
    };
  }, [
    filters.goodWith,
    goodWithTally,
    locale,
    pool,
    resultCount,
    toggleGoodWith,
    toggleManyGoodWith,
  ]);

  const care = useMemo(() => {
    const keys = visibleCare(pool, filters.care, true);
    return {
      // The tab decides one description: Izkušeno roko names the dogs it
      // holds, and on Mačke it holds two very frightened cats instead.
      options: careOptions(locale, filters.species).filter((option) =>
        keys.includes(option.key),
      ),
      counts: careTally,
      resultCount: resultCount,
      total: pool.length,
      onToggle: toggleCare,
      onToggleMany: toggleManyCare,
    };
  }, [
    careTally,
    filters.care,
    filters.species,
    locale,
    pool,
    resultCount,
    toggleCare,
    toggleManyCare,
  ]);

  // What each active value is costing: how many more animals show if it comes
  // off, everything else left alone. The row spends it two ways: a tooltip on
  // hover, and, when nothing matches at all, a mark on the single chip that is
  // the cheapest way out.
  //
  // This used to be a full applyFilters pass per chip, on the reasoning that
  // no one-pass shortcut could answer it: counting the animals that fail
  // exactly one filter is a different question, and gets every multi-value
  // facet backwards. True as far as it went. The answer was to stop counting
  // failures and count the two things that actually move, which chipGains does
  // in one walk (lib/filters.ts), so a row of chips now costs what one chip
  // used to.
  const chipGain = useMemo(
    () => chipGains(animals, filters, reference),
    [animals, filters, reference],
  );

  // The pressed species tab already shows itself, so chips cover only the
  // sidebar/sheet groups and the shelter picker. The rule is not "everything
  // that is on": it is "everything with no other one-click way off". A
  // species goes back to Vse in one press of its own tab; a shelter takes a
  // dialog, which is why it is here and the species is not.
  //
  // Each chip carries the facet that set it, because the row groups by facet
  // and draws one icon per facet: flat, they were nine questions' answers
  // wearing the same pill.
  //
  // In FILTER_FACETS order, the order the panel asks in: Čaka na dom is the
  // panel's last section, so its chip comes after Lahko ponudim's even though
  // it is one of the GROUPS.
  const groupChips = (group: MultiGroup): Chip[] =>
    filters[group].map((value) => ({
      key: chipKey(group, value),
      facet: group,
      value,
      label:
        group === "shelter"
          ? shelterChipLabel(shelterLabels.get(value) ?? value)
          : valueChipLabel(group, value, locale),
      gain: chipGain.get(chipKey(group, value)),
      onRemove: () => toggle(group, value),
    }));
  const chips: Chip[] = [
    ...GROUPS.filter((group) => group !== "waiting").flatMap(groupChips),
    ...filters.toggles.map((key) => ({
      key: chipKey("toggles", key),
      facet: "toggles" as const,
      value: key,
      label: toggleLabel(key, locale),
      gain: chipGain.get(chipKey("toggles", key)),
      onRemove: () => toggleProperty(key),
    })),
    // Not the card label: on a row of chips "Psi" would read as the species
    // tab, so these name the household instead.
    ...filters.goodWith.map((key) => ({
      key: chipKey("goodWith", key),
      facet: "goodWith" as const,
      value: key,
      label: goodWithChipLabel(key, locale),
      gain: chipGain.get(chipKey("goodWith", key)),
      onRemove: () => toggleGoodWith(key),
    })),
    // The row's words, in the nominative where the row's own only reads
    // after the section heading.
    ...filters.care.map((key) => ({
      key: chipKey("care", key),
      facet: "care" as const,
      value: key,
      label: valueChipLabel("care", key, locale),
      gain: chipGain.get(chipKey("care", key)),
      onRemove: () => toggleCare(key),
    })),
    ...groupChips("waiting"),
  ];

  const hasSidebar =
    groups.length > 0 ||
    toggles.length > 0 ||
    goodWith !== undefined ||
    care !== undefined;

  return {
    speciesRoster,
    speciesTally,
    shelterSummaries,
    counts,
    pool,
    groups,
    shelters,
    toggles,
    toggleTally,
    goodWith,
    care,
    chips,
    hasSidebar,
    unanswered,
  };
}
