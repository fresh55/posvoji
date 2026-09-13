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
  homeCounts,
  homeOptions,
  optionLabel,
  speciesCounts,
  speciesFacetCounts,
  toggleCounts,
  toggleLabel,
  visibleGroups,
  visibleToggles,
} from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import {
  careLabel,
  goodWithChipLabel,
  homeLabel,
  shelterChipLabel,
} from "@/lib/labels";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { summarizeShelters } from "@/lib/shelter-summary";
import { useMemo } from "react";

type FilterActions = Pick<
  ReturnType<typeof useAnimalFilters>,
  | "filters"
  | "toggle"
  | "toggleProperty"
  | "toggleGoodWith"
  | "toggleManyGoodWith"
  | "toggleHome"
  | "toggleManyHome"
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
    toggleHome,
    toggleManyHome,
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
  // so a zero-count option remains visible and explains its unknown state.
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
  const groups = useMemo(
    () =>
      GROUPS.filter(
        (group): group is CardGroup => group !== "shelter" && shown[group],
      ).map((group) => ({ group, options: groupOptions(group, pool, locale) })),
    [locale, pool, shown],
  );
  // The shelter picker uses the complete roster so visitors can widen their
  // search. Species and other filters change each shelter's count, not which
  // shelters are available to choose.
  const shelters = useMemo(() => {
    const options = groupOptions("shelter", animals, locale);
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
  // Every option stays visible; counts indicate which answers are confirmed.
  const goodWith = useMemo(() => {
    return {
      options: goodWithOptions(locale),
      counts: goodWithCounts(animals, filters, reference),
      resultCount: resultCount,
      total: pool.length,
      onToggle: toggleGoodWith,
      onToggleMany: toggleManyGoodWith,
    };
  }, [
    animals,
    filters,
    locale,
    reference,
    pool,
    resultCount,
    toggleGoodWith,
    toggleManyGoodWith,
  ]);

  const home = useMemo(() => {
    return {
      options: homeOptions(locale),
      counts: homeCounts(animals, filters, reference),
      resultCount: resultCount,
      total: pool.length,
      onToggle: toggleHome,
      onToggleMany: toggleManyHome,
    };
  }, [
    animals,
    filters,
    locale,
    reference,
    pool,
    resultCount,
    toggleHome,
    toggleManyHome,
  ]);

  const care = useMemo(() => {
    return {
      options: careOptions(locale),
      counts: careCounts(animals, filters, reference),
      resultCount: resultCount,
      total: pool.length,
      onToggle: toggleCare,
      onToggleMany: toggleManyCare,
    };
  }, [
    animals,
    filters,
    locale,
    reference,
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
  const chips: Chip[] = [
    ...GROUPS.flatMap((group) =>
      filters[group].map((value) => ({
        key: chipKey(group, value),
        facet: group,
        value,
        label:
          group === "shelter"
            ? shelterChipLabel(shelterLabels.get(value) ?? value)
            : optionLabel(group, value, animals, locale),
        gain: chipGain.get(chipKey(group, value)),
        onRemove: () => toggle(group, value),
      })),
    ),
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
    // Both of these read as whole phrases on the card already, so a chip says
    // the same words rather than a second wording of them.
    ...filters.home.map((key) => ({
      key: chipKey("home", key),
      facet: "home" as const,
      value: key,
      label: homeLabel(key, locale),
      gain: chipGain.get(chipKey("home", key)),
      onRemove: () => toggleHome(key),
    })),
    ...filters.care.map((key) => ({
      key: chipKey("care", key),
      facet: "care" as const,
      value: key,
      label: careLabel(key, locale),
      gain: chipGain.get(chipKey("care", key)),
      onRemove: () => toggleCare(key),
    })),
  ];

  const hasSidebar =
    groups.length > 0 ||
    toggles.length > 0 ||
    goodWith !== undefined ||
    home !== undefined ||
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
    home,
    care,
    chips,
    hasSidebar,
  };
}
