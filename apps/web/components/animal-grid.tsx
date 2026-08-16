"use client";

import { useMemo } from "react";
import { PawPrint } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalCard, AnimalCardSkeleton } from "@/components/animal-card";
import { useI18n } from "@/components/i18n-provider";
import { AnimalFilters } from "@/components/filters/animal-filters";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import type { CardGroup } from "@/components/filters/filter-groups";
import { type Chip } from "@/components/filters/filter-chips";
import { Button } from "@/components/ui/button";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import {
  applyFilters,
  bySpecies,
  facetCounts,
  GROUPS,
  groupOptions,
  optionLabel,
  speciesCounts,
  toggleCounts,
  toggleLabel,
  visibleGroups,
  visibleToggles,
} from "@/lib/filters";
import { cn } from "@/lib/utils";

// Cards claim a target width and the column count falls out of whatever space
// is left. Fixed counts made cards jump from 309px to 222px the moment the
// sidebar appeared at lg, because the count stayed at three while the room for
// it shrank by a quarter. Two columns stay hard-coded on phones because
// auto-fill would drop to one there, and a single column of photos is a worse
// phone page.
const CARD_GRID =
  "grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]";

export function AnimalGrid({ animals }: { animals: Animal[] }) {
  const { locale, messages } = useI18n();
  const {
    filters,
    setSpecies,
    toggle,
    toggleMany,
    toggleProperty,
    clearAll,
    activeCount,
  } = useAnimalFilters();

  // One Date per mount keeps age buckets stable across re-renders.
  const now = useMemo(() => new Date(), []);
  const visible = useMemo(
    () => applyFilters(animals, filters, now),
    [animals, filters, now],
  );

  const isEmpty = animals.length === 0;

  const speciesTally = useMemo(() => speciesCounts(animals), [animals]);
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
  const shelters = useMemo(
    () => (shown.shelter ? groupOptions("shelter", pool, locale) : undefined),
    [locale, pool, shown],
  );
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
  ];

  const hasSidebar = groups.length > 0 || toggles.length > 0;

  return (
    <section
      className={cn(
        hasSidebar &&
          "lg:grid lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-rhythm",
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
          onToggle={toggle}
          onToggleMany={toggleMany}
          onToggleProperty={toggleProperty}
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
          shelters={shelters}
          shelterTally={counts.shelter}
          chips={chips}
          activeCount={activeCount}
          resultCount={visible.length}
          onSpeciesChange={setSpecies}
          onToggle={toggle}
          onToggleMany={toggleMany}
          onToggleProperty={toggleProperty}
          onClearAll={clearAll}
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
              <p className="text-sm font-medium">{messages.noResults}</p>
              <p className="text-sm text-muted-foreground">
                {messages.tryFewerFilters}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearAll}>
              {messages.clearFilters}
            </Button>
          </div>
        ) : (
          <div className={CARD_GRID}>
            {visible.map((animal) => (
              <AnimalCard key={animal.id} animal={animal} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
