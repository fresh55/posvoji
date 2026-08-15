"use client";

import { useMemo } from "react";
import { Check, LoaderCircle, LocateFixed } from "lucide-react";
import { ShelterMap, type ShelterPin } from "@/components/filters/shelter-map";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption } from "@/lib/filters";
import { cityAt, distanceKm, formatKm } from "@/lib/geo";
import { plural, SHELTER_FORMS } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Shelter is the filter people actually use — you adopt near where you live —
// so it leads with a map. The list under it is not a fallback for narrow
// screens: it is the accessible path, and it always holds every shelter,
// including the ones no marker could be placed for.
export function ShelterPicker({
  options,
  counts,
  selected,
  onToggle,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const { state, toggle: toggleNearby } = useNearby();
  const origin = state.status === "on" ? state.at : undefined;

  const rows = useMemo(() => {
    const located = options.map((option) => {
      const at = option.city ? cityAt(option.city) : undefined;
      return {
        ...option,
        at,
        km: at && origin ? distanceKm(origin, at) : undefined,
      };
    });
    if (!origin) return located;
    // Shelters we cannot place keep their alphabetical order at the end,
    // rather than being dropped from a sort they cannot join.
    return [...located].sort(
      (a, b) => (a.km ?? Infinity) - (b.km ?? Infinity),
    );
  }, [options, origin]);

  const pins: ShelterPin[] = rows.flatMap((row) =>
    row.at
      ? [
          {
            value: row.value,
            label: row.label,
            city: row.city ?? "",
            at: row.at,
            count: counts.get(row.value) ?? 0,
          },
        ]
      : [],
  );

  const unplaced = rows.length - pins.length;
  const note =
    state.status === "error"
      ? state.message
      : unplaced > 0
        ? `${plural(unplaced, SHELTER_FORMS)} ni na zemljevidu.`
        : undefined;

  return (
    // No negative margin anywhere below: the sidebar scrolls vertically, and
    // any child wider than its padding box turns that into a horizontal
    // scrollbar too.
    <div className="space-y-2.5">
      <ShelterMap
        pins={pins}
        selected={selected}
        onToggle={onToggle}
        origin={origin}
      />

      <button
        type="button"
        onClick={toggleNearby}
        aria-pressed={state.status === "on"}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
          state.status === "on"
            ? "border-foreground bg-foreground text-background"
            : "text-muted-foreground hover:border-foreground/25 hover:text-foreground",
        )}
      >
        {state.status === "locating" ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <LocateFixed className="size-3.5" aria-hidden />
        )}
        {state.status === "locating" ? "Iščem lokacijo…" : "Blizu mene"}
      </button>

      {/* Stays mounted so a denied permission is announced, not just drawn. */}
      <p
        aria-live="polite"
        className="text-[11px] leading-tight text-muted-foreground empty:hidden"
      >
        {note}
      </p>

      <div className="space-y-0.5">
        {rows.map(({ value, label, city, km }) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const sublabel = [city, km === undefined ? undefined : formatKm(km)]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              disabled={count === 0 && !checked}
              aria-pressed={checked}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors disabled:opacity-40",
                checked ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              {/* Always laid out, so selecting a row doesn't shift the list. */}
              <Check
                className={cn("size-3.5 shrink-0", !checked && "opacity-0")}
                strokeWidth={2.25}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    !checked && "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {sublabel && (
                  <span className="block truncate text-[11px] text-muted-foreground/80">
                    {sublabel}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
