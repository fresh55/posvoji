"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PawPrint } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalCard, AnimalCardSkeleton } from "@/components/animal-card";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { AnimalFilters } from "@/components/filters/animal-filters";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import type { CardGroup } from "@/components/filters/filter-groups";
import { type Chip } from "@/components/filters/filter-chips";
import { Button } from "@/components/ui/button";
import { useAnimalDialogHost } from "@/hooks/use-animal-dialog-host";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import { CARD_GRID } from "@/lib/card-grid";
import {
  applyFilters,
  bySpecies,
  careCounts,
  careOptions,
  facetCounts,
  goodWithCounts,
  goodWithOptions,
  GROUPS,
  groupOptions,
  homeCounts,
  homeOptions,
  optionLabel,
  speciesCounts,
  toggleCounts,
  toggleLabel,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  visibleHome,
  visibleToggles,
  type FilterOption,
  type SpeciesFilter,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import { careLabel, goodWithChipLabel, homeLabel } from "@/lib/labels";
import { summarizeShelters } from "@/lib/shelter-summary";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { DEFAULT_ANIMAL_SORT, sortAnimals } from "@/lib/sort";
import { cn } from "@/lib/utils";
import type { ShelterLogos } from "@/lib/shelter-logos";

// Which species-absence message key fills the {species} slot of
// noResultsShelterSingular/Plural. Keyed by the species tab rather than
// spelled out inline, so a new species fails to compile here instead of
// silently falling back to the wrong noun form.
const SPECIES_ABSENCE_KEY: Record<SpeciesFilter, TranslationKey> = {
  all: "speciesAbsenceAll",
  dog: "speciesAbsenceDogs",
  cat: "speciesAbsenceCats",
  rabbit: "speciesAbsenceRabbits",
  other: "speciesAbsenceOther",
};

export function AnimalGrid({
  animals,
  logos,
  referenceDate,
  municipalities,
  offSiteShelters,
}: {
  animals: Animal[];
  logos: ShelterLogos;
  /** When the dataset was built. Ages are measured from it rather than from
      the clock, so the prerendered HTML and the hydrated page agree. */
  referenceDate: string;
  /** Municipality → responsible-shelter entries for the shelter dialog's
   *  "found an animal" mode. Built on the server from data/. */
  municipalities?: LookupEntry[];
  /** Registry shelters with no animals on the site, drawn inert in the
   *  location picker's map and list. */
  offSiteShelters?: FilterOption[];
}) {
  const { locale, messages, t } = useI18n();
  const [clearTrailKey, setClearTrailKey] = useState(0);
  const pendingClearCount = useRef<number | null>(null);
  const {
    filters,
    sort,
    setSpecies,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    toggleGoodWith,
    toggleManyGoodWith,
    toggleHome,
    toggleManyHome,
    toggleCare,
    toggleManyCare,
    setSort,
    clearAll,
    activeCount,
  } = useAnimalFilters();

  const reference = useMemo(
    () => new Date(referenceDate),
    [referenceDate],
  );
  // One Date per mount keeps age buckets stable across re-renders.
  const now = useMemo(() => new Date(), []);
  const visible = useMemo(
    () => applyFilters(animals, filters, now),
    [animals, filters, now],
  );
  const sorted = useMemo(
    () => sortAnimals(visible, sort, locale, now),
    [visible, sort, locale, now],
  );

  // What the dialog steps through is what the visitor is looking at: the list
  // as filtered and sorted on screen, in that order.
  const { selected, origin, shownIds, handleOpen, handleNavigate, close } =
    useAnimalDialogHost({
      animals,
      shown: sorted,
      basePath: locale === "sl" ? "/" : "/en",
    });

  const isEmpty = animals.length === 0;

  // Reachable zero state: every other facet is pre-guarded by isDeadOption
  // disabling, so a filtered-to-zero result in practice means a shelter
  // selection with none of the active species. Only worth a second full
  // applyFilters pass (with the shelter group dropped, the same way the rest
  // of the file measures facets) when the list is actually empty and a
  // shelter is actually selected — otherwise this short-circuits and the
  // normal case (a shelter picked, some animals showing) never pays for it.
  const shelterOnlyEmpty = useMemo(
    () =>
      visible.length === 0 &&
      filters.shelter.length > 0 &&
      applyFilters(animals, { ...filters, shelter: [] }, now).length > 0,
    [animals, filters, now, visible.length],
  );

  const handleClearAll = useCallback(() => {
    if (activeCount > 0 || filters.species !== "all") {
      pendingClearCount.current = visible.length;
    }
    clearAll();
  }, [activeCount, clearAll, filters.species, visible.length]);

  useEffect(() => {
    const previousCount = pendingClearCount.current;
    const hasCleared = activeCount === 0 && filters.species === "all";
    if (previousCount === null || !hasCleared) return;

    pendingClearCount.current = null;
    if (visible.length > previousCount) {
      setClearTrailKey((key) => key + 1);
    }
  }, [activeCount, filters.species, visible.length]);

  const speciesTally = useMemo(() => speciesCounts(animals), [animals]);
  // What the location picker's card says about a shelter beyond its filtered
  // count: which species live there and who has waited longest. Built from the
  // whole dataset and not from `visible`, so the card answers "who is this
  // shelter" rather than "what matches my filter" — the count pill next to the
  // shelter's name already carries the filtered number. `now` and not
  // `reference`, because the wait is measured the same way the age buckets are.
  const shelterSummaries = useMemo(
    () => summarizeShelters(animals, locale, now),
    [animals, locale, now],
  );
  const counts = useMemo(
    () => facetCounts(animals, filters, now),
    [animals, filters, now],
  );
  // The panel follows the species tab: measured against the whole dataset it
  // would offer groups the animals on screen don't vary on.
  const pool = useMemo(
    () => bySpecies(animals, filters.species),
    [animals, filters.species],
  );
  // Zavetisce is split off from the rest. The others are short runs of options
  // you weigh against each other and belong in a column of small controls;
  // where you adopt from is a map, and it goes next to the species tabs as the
  // other question people arrive with.
  const shown = useMemo(
    () => visibleGroups(pool, filters.species, now),
    [pool, filters.species, now],
  );
  const groups = useMemo(
    () =>
      GROUPS.filter(
        (group): group is CardGroup => group !== "shelter" && shown[group],
      ).map((group) => ({ group, options: groupOptions(group, pool, locale) })),
    [locale, pool, shown],
  );
  // Not gated on shown.shelter, unlike every group above. visibleGroups drops a
  // group with fewer than two distinct values, which is right for a facet: one
  // value narrows nothing. The shelter picker is not that facet. It is a map of
  // where every shelter in the country is, the way back out of a narrow result,
  // and on a phone the mobile dock is built around it. Gating it on two
  // distinct shelters took the whole dock off the page at /?vrsta=zajcek, where
  // one rabbit sits at one shelter: the single state where a visitor most needs
  // to widen the search was the one state with nothing left to press. Absent
  // only when the pool has no shelter to show at all.
  const shelters = useMemo(() => {
    const options = groupOptions("shelter", pool, locale);
    return options.length > 0 ? options : undefined;
  }, [locale, pool]);
  const toggles = useMemo(
    () =>
      visibleToggles(pool, filters.species).map((toggle) => ({
        ...toggle,
        label: toggleLabel(toggle.key, locale),
      })),
    [locale, pool, filters.species],
  );
  const toggleTally = useMemo(
    () => toggleCounts(animals, filters, now),
    [animals, filters, now],
  );
  // The section carries its own options, tally and actions, and is left out
  // entirely while no facet has enough answers to narrow anything.
  const goodWith = useMemo(() => {
    const keys = visibleGoodWith(pool);
    if (keys.length === 0) return undefined;
    return {
      options: goodWithOptions(locale).filter(({ key }) => keys.includes(key)),
      counts: goodWithCounts(animals, filters, now),
      resultCount: visible.length,
      total: pool.length,
      onToggle: toggleGoodWith,
      onToggleMany: toggleManyGoodWith,
    };
  }, [
    animals,
    filters,
    locale,
    now,
    pool,
    visible.length,
    toggleGoodWith,
    toggleManyGoodWith,
  ]);

  // Same rule as the household section: absent until the shelters have
  // answered for some animals and not for all of them.
  const home = useMemo(() => {
    const keys = visibleHome(pool);
    if (keys.length === 0) return undefined;
    return {
      options: homeOptions(locale).filter(({ key }) => keys.includes(key)),
      counts: homeCounts(animals, filters, now),
      resultCount: visible.length,
      total: pool.length,
      onToggle: toggleHome,
      onToggleMany: toggleManyHome,
    };
  }, [
    animals,
    filters,
    locale,
    now,
    pool,
    visible.length,
    toggleHome,
    toggleManyHome,
  ]);

  const care = useMemo(() => {
    const keys = visibleCare(pool);
    if (keys.length === 0) return undefined;
    return {
      options: careOptions(locale).filter(({ key }) => keys.includes(key)),
      counts: careCounts(animals, filters, now),
      resultCount: visible.length,
      total: pool.length,
      onToggle: toggleCare,
      onToggleMany: toggleManyCare,
    };
  }, [
    animals,
    filters,
    locale,
    now,
    pool,
    visible.length,
    toggleCare,
    toggleManyCare,
  ]);

  // The pressed species tab already shows itself, so chips cover only the
  // sidebar/sheet groups.
  const chips: Chip[] = [
    ...GROUPS.flatMap((group) =>
      filters[group].map((value) => ({
        key: `${group}:${value}`,
        label: optionLabel(group, value, animals, locale),
        onRemove: () => toggle(group, value),
      })),
    ),
    ...filters.toggles.map((key) => ({
      key: `toggle:${key}`,
      label: toggleLabel(key, locale),
      onRemove: () => toggleProperty(key),
    })),
    // Not the card label: on a row of chips "Psi" would read as the species
    // tab, so these name the household instead.
    ...filters.goodWith.map((key) => ({
      key: `goodWith:${key}`,
      label: goodWithChipLabel(key, locale),
      onRemove: () => toggleGoodWith(key),
    })),
    // Both of these read as whole phrases on the card already, so a chip says
    // the same words rather than a second wording of them.
    ...filters.home.map((key) => ({
      key: `home:${key}`,
      label: homeLabel(key, locale),
      onRemove: () => toggleHome(key),
    })),
    ...filters.care.map((key) => ({
      key: `care:${key}`,
      label: careLabel(key, locale),
      onRemove: () => toggleCare(key),
    })),
  ];

  const hasSidebar =
    groups.length > 0 ||
    toggles.length > 0 ||
    goodWith !== undefined ||
    home !== undefined ||
    care !== undefined;

  return (
    <section
      className={cn(
        "pb-20 lg:pb-0",
        hasSidebar &&
          "lg:grid lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-column-gap",
      )}
    >
      {hasSidebar && (
        <FilterSidebar
          className="hidden lg:sticky lg:top-[var(--sticky-top)] lg:block lg:max-h-[calc(100dvh-var(--sticky-top)*2)] lg:overflow-x-hidden lg:overflow-y-auto"
          filters={filters}
          groups={groups}
          counts={counts}
          toggles={toggles}
          toggleTally={toggleTally}
          goodWith={goodWith}
          home={home}
          care={care}
          onToggle={toggle}
          onToggleMany={toggleMany}
          onToggleProperty={toggleProperty}
          onToggleManyProperties={toggleManyProperties}
          onClearAll={handleClearAll}
        />
      )}

      <div className="flex flex-col gap-4">
        <AnimalFilters
          isEmpty={isEmpty}
          filters={filters}
          speciesTally={speciesTally}
          groups={groups}
          counts={counts}
          toggles={toggles}
          toggleTally={toggleTally}
          goodWith={goodWith}
          home={home}
          care={care}
          shelters={shelters}
          shelterTally={counts.shelter}
          municipalities={municipalities}
          offSiteShelters={offSiteShelters}
          shelterSummaries={shelterSummaries}
          chips={chips}
          resultCount={visible.length}
          clearTrailKey={clearTrailKey}
          sort={sort}
          onSpeciesChange={setSpecies}
          onToggle={toggle}
          onToggleMany={toggleMany}
          onToggleProperty={toggleProperty}
          onToggleManyProperties={toggleManyProperties}
          onClearAll={handleClearAll}
          onSortChange={setSort}
        />

        {isEmpty ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {messages.animalsComingSoon}
            </p>
            <div aria-hidden className={cn(CARD_GRID, "opacity-60")}>
              {Array.from({ length: 4 }, (_, i) => (
                <AnimalCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <PawPrint
              className="size-8 text-muted-foreground/50"
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {shelterOnlyEmpty
                  ? t(
                      filters.shelter.length === 1
                        ? "noResultsShelterSingular"
                        : "noResultsShelterPlural",
                      { species: t(SPECIES_ABSENCE_KEY[filters.species]) },
                    )
                  : messages.noResults}
              </p>
              {!shelterOnlyEmpty && (
                <p className="text-sm text-muted-foreground">
                  {messages.tryFewerFilters}
                </p>
              )}
            </div>
            {shelterOnlyEmpty && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleMany("shelter", filters.shelter)}
              >
                {messages.showFromAllShelters}
              </Button>
            )}
            <Button
              variant={shelterOnlyEmpty ? "ghost" : "outline"}
              size="sm"
              onClick={handleClearAll}
            >
              {messages.clearFilters}
            </Button>
          </div>
        ) : (
          <div className={CARD_GRID}>
            {sorted.map((animal) => (
              <AnimalCard
                key={animal.id}
                animal={animal}
                reference={reference}
                onOpen={handleOpen}
              />
            ))}
          </div>
        )}
      </div>

      <AnimalDialog
        animal={selected}
        logos={logos}
        origin={origin}
        siblingIds={shownIds}
        reference={reference}
        onNavigate={handleNavigate}
        onClose={close}
        // The default sort already leads with the longest waits, so the
        // callout's link only exists while some other order is on.
        onSeeLongestWaiting={
          sort === DEFAULT_ANIMAL_SORT
            ? undefined
            : () => {
                setSort(DEFAULT_ANIMAL_SORT);
                close();
              }
        }
      />
    </section>
  );
}
