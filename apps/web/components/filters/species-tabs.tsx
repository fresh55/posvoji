"use client";

import { type LucideIcon } from "lucide-react";
import { Species } from "@posvoji/schema";
import { type SpeciesFilter } from "@/lib/filters";
import { useI18n } from "@/components/i18n-provider";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { cn } from "@/lib/utils";

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
        // The vertical padding is what the tabs' touch overlays live in.
        // Scrolling sideways makes this a scroll box in both axes, and a
        // scroll box clips at its padding edge, so without the padding the
        // overlays are cut back to the height of the pills. The matching
        // negative margin keeps the row occupying its old height.
        "flex min-w-0 gap-1 overflow-x-auto no-scrollbar max-lg:-my-2 max-lg:py-2",
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
            // The pill stays 28px tall so the toolbar row keeps its height.
            // Below lg, which is the only place this copy of the tabs is
            // shown, the tap target grows to 44px around it.
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-ui px-2.5 py-1 text-sm transition-colors disabled:opacity-40 max-lg:tap-target",
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
