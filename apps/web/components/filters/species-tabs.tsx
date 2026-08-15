"use client";

import { Cat, Dog, PawPrint, Rabbit, type LucideIcon } from "lucide-react";
import { Species } from "@posvoji/schema";
import { type SpeciesFilter } from "@/lib/filters";
import { cn } from "@/lib/utils";

// Keyed by species rather than listed, so one added to the schema fails to
// compile here instead of existing in the data and nowhere in the UI.
const SPECIES_TABS: Record<Species, { label: string; icon: LucideIcon }> = {
  dog: { label: "Psi", icon: Dog },
  cat: { label: "Mačke", icon: Cat },
  rabbit: { label: "Zajčki", icon: Rabbit },
  other: { label: "Ostale", icon: PawPrint },
};

const TABS: { value: SpeciesFilter; label: string; icon?: LucideIcon }[] = [
  { value: "all", label: "Vse" },
  ...Species.options.map((value) => ({ value, ...SPECIES_TABS[value] })),
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
    // Five tabs plus the sheet trigger don't fit a 375px phone, and wrapping
    // cost a second row on a bar that is pinned to the top the whole time.
    // Scrolling keeps it one row tall at every width.
    <div
      className={cn(
        "flex min-w-0 gap-1 overflow-x-auto no-scrollbar",
        fullWidth && "w-full overflow-visible",
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
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors disabled:opacity-40",
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
