"use client";

import { useMemo, useState } from "react";
import { Cat, Dog, PawPrint, Rabbit, type LucideIcon } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalCard, AnimalCardSkeleton } from "@/components/animal-card";
import { cn } from "@/lib/utils";

type Filter = "all" | "dog" | "cat" | "other";

const FILTERS: { value: Filter; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "Vse", icon: PawPrint },
  { value: "dog", label: "Psi", icon: Dog },
  { value: "cat", label: "Mačke", icon: Cat },
  { value: "other", label: "Ostale", icon: Rabbit },
];

export function AnimalGrid({ animals }: { animals: Animal[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    if (filter === "all") return animals;
    // "Ostale" collects rabbits and anything else, so no species is unreachable.
    if (filter === "other") {
      return animals.filter((a) => a.species !== "dog" && a.species !== "cat");
    }
    return animals.filter((a) => a.species === filter);
  }, [animals, filter]);

  const isEmpty = animals.length === 0;

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              disabled={isEmpty}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-40 sm:px-2.5",
                filter === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
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
              // Four fills a 2- or 4-column row, but orphans on 3 columns.
              <div key={i} className={i === 3 ? "md:hidden lg:block" : undefined}>
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
