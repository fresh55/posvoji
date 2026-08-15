"use client";

import { useMemo, useState } from "react";
import type { Animal, Species } from "@posvoji/schema";
import { AnimalCard, AnimalCardSkeleton } from "@/components/animal-card";
import { cn } from "@/lib/utils";

type Filter = "all" | Species;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Vse" },
  { value: "dog", label: "Psi" },
  { value: "cat", label: "Mačke" },
  { value: "other", label: "Ostale" },
];

export function AnimalGrid({ animals }: { animals: Animal[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () =>
      filter === "all" ? animals : animals.filter((a) => a.species === filter),
    [animals, filter],
  );

  const isEmpty = animals.length === 0;

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <div className="flex gap-1">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              disabled={isEmpty}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors disabled:opacity-40",
                filter === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {visible.length}
        </span>
      </div>

      {isEmpty ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Tu bodo živali, ko se dogovorimo s prvimi zavetišči.
          </p>
          <div
            aria-hidden
            className="grid grid-cols-2 gap-4 opacity-60 md:grid-cols-3 lg:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, i) => (
              // The 4th would orphan itself on a 3-column row.
              <div key={i} className={i === 3 ? "hidden lg:block" : undefined}>
                <AnimalCardSkeleton />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((animal) => (
            <AnimalCard key={animal.id} animal={animal} />
          ))}
        </div>
      )}
    </section>
  );
}
