"use client";

import { Cat, Dog, PawPrint, Rabbit, type LucideIcon } from "lucide-react";
import { type SpeciesFilter } from "@/lib/filters";
import { cn } from "@/lib/utils";

const TABS: { value: SpeciesFilter; label: string; icon?: LucideIcon }[] = [
  { value: "all", label: "Vse" },
  { value: "dog", label: "Psi", icon: Dog },
  { value: "cat", label: "Mačke", icon: Cat },
  { value: "rabbit", label: "Zajčki", icon: Rabbit },
  { value: "other", label: "Ostale", icon: PawPrint },
];

export function SpeciesTabs({
  value,
  onChange,
  counts,
  disabled = false,
  fullWidth = false,
}: {
  value: SpeciesFilter;
  onChange: (species: SpeciesFilter) => void;
  counts: Record<SpeciesFilter, number>;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1",
        fullWidth && "flex w-full",
      )}
    >
      {TABS.map(({ value: tab, label, icon: Icon }) => {
        // An empty dataset keeps all tabs (disabled); otherwise empty
        // categories disappear rather than leading to zero results.
        if (!disabled && tab !== "all" && counts[tab] === 0) return null;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            disabled={disabled}
            aria-pressed={value === tab}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors disabled:opacity-40",
              fullWidth && "flex-1 py-1.5",
              value === tab
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-4" strokeWidth={1.75} aria-hidden />}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
