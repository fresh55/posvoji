"use client";

import { useMemo } from "react";
import { PawPrint } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalCard, AnimalCardSkeleton } from "@/components/animal-card";
import { AnimalFilters } from "@/components/filters/animal-filters";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { type Chip } from "@/components/filters/filter-chips";
import { Button } from "@/components/ui/button";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import {
  applyFilters,
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

export function AnimalGrid({ animals }: { animals: Animal[] }) {
  const { filters, setSpecies, toggle, toggleProperty, clearAll, activeCount } =
    useAnimalFilters();

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
  const groups = useMemo(() => {
    const shown = visibleGroups(animals, now);
    return GROUPS.filter((group) => shown[group]).map((group) => ({
      group,
      options: groupOptions(group, animals),
    }));
  }, [animals, now]);
  const toggles = useMemo(() => visibleToggles(animals), [animals]);
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
        label: optionLabel(group, value, animals),
        onRemove: () => toggle(group, value),
      })),
    ),
    ...filters.toggles.map((key) => ({
      key: `toggle:${key}`,
      label: toggleLabel(key),
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
          className="hidden lg:sticky lg:top-[var(--sticky-top)] lg:block lg:max-h-[calc(100dvh-var(--sticky-top)*2)] lg:overflow-y-auto"
          filters={filters}
          groups={groups}
          counts={counts}
          toggles={toggles}
          toggleTally={toggleTally}
          hasActiveFilters={activeCount > 0}
          onToggle={toggle}
          onToggleProperty={toggleProperty}
          onClearAll={clearAll}
        />
      )}

      <div className="space-y-5">
        <AnimalFilters
          isEmpty={isEmpty}
          filters={filters}
          speciesTally={speciesTally}
          groups={groups}
          counts={counts}
          toggles={toggles}
          toggleTally={toggleTally}
          chips={chips}
          activeCount={activeCount}
          resultCount={visible.length}
          onSpeciesChange={setSpecies}
          onToggle={toggle}
          onToggleProperty={toggleProperty}
          onClearAll={clearAll}
        />

        {isEmpty ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Tu bodo živali, ko se dogovorimo s prvimi zavetišči.
            </p>
            <div
              aria-hidden
              className="grid grid-cols-2 gap-4 opacity-60 md:grid-cols-3 xl:grid-cols-4"
            >
              {Array.from({ length: 4 }, (_, i) => (
                // Four fills a 2- or 4-column row, but orphans on 3 columns.
                <div
                  key={i}
                  className={i === 3 ? "md:hidden xl:block" : undefined}
                >
                  <AnimalCardSkeleton />
                </div>
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
              <p className="text-sm font-medium">Ni zadetkov.</p>
              <p className="text-sm text-muted-foreground">
                Poskusi z manj filtri.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearAll}>
              Počisti filtre
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((animal) => (
              <AnimalCard key={animal.id} animal={animal} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
