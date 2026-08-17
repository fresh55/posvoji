"use client";

import { Cat, Dog, PawPrint, Rabbit, type LucideIcon } from "lucide-react";
import { Species } from "@posvoji/schema";
import { type SpeciesFilter } from "@/lib/filters";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

// Keyed by species rather than listed, so one added to the schema fails to
// compile here instead of existing in the data and nowhere in the UI.
const SPECIES_ICONS: Record<Species, LucideIcon> = {
  dog: Dog,
  cat: Cat,
  rabbit: Rabbit,
  other: PawPrint,
};

const LABELS: Record<"sl" | "en", Record<SpeciesFilter, string>> = {
  sl: { all: "Vse", dog: "Psi", cat: "Mačke", rabbit: "Zajčki", other: "Ostale" },
  en: { all: "All", dog: "Dogs", cat: "Cats", rabbit: "Rabbits", other: "Other" },
};

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
  const { locale } = useI18n();
  const tabs: { value: SpeciesFilter; label: string; icon?: LucideIcon }[] = [
    { value: "all", label: LABELS[locale].all },
    ...Species.options.map((value) => ({
      value,
      label: LABELS[locale][value],
      icon: SPECIES_ICONS[value],
    })),
  ];

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
      {tabs.map(({ value: tab, label, icon: Icon }) => {
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
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-ui px-2.5 py-1 text-sm transition-colors disabled:opacity-40",
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
