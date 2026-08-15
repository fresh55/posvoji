"use client";

import { useCallback, useMemo, useRef } from "react";
import { ArrowDownNarrowWide, Check, LoaderCircle } from "lucide-react";
import { ShelterMap } from "@/components/filters/shelter-map";
import type { ShelterPin } from "@/lib/map-layout";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption } from "@/lib/filters";
import { cityAt, distanceKm, formatKm, onMap } from "@/lib/geo";
import { plural, SHELTER_FORMS } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Shelter is the filter people actually use, because you adopt near where you
// live, so it leads with a map. The list under it is not a fallback for narrow
// screens: it is the accessible path, it always holds every shelter including
// the ones no marker could be placed for, and its rows are the full-size target
// for anyone who cannot hit a marker.
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
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

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
    return [...located].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
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

  // The yardstick markers are sized against: the largest a single town can be
  // on this species tab, which does not move when another filter changes.
  const busiest = useMemo(() => {
    const byTown = new Map<string, number>();
    for (const option of options) {
      const town = option.city ?? option.value;
      byTown.set(town, (byTown.get(town) ?? 0) + (option.total ?? 0));
    }
    return Math.max(0, ...byTown.values());
  }, [options]);

  // Picking a marker checks a row that may be well below the fold, and on touch
  // there is no hover to say which shelter a marker was. Bringing the row into
  // view is what confirms the pick.
  const pick = useCallback(
    (value: string) => {
      onToggle(value);
      rowRefs.current.get(value)?.scrollIntoView({ block: "nearest" });
    },
    [onToggle],
  );

  const unplaced = rows.length - pins.length;
  const nearbyOn = state.status === "on";
  // Two independent facts, so two lines. Sharing one slot meant a geolocation
  // error silently replaced the note about shelters missing from the map.
  const status =
    state.status === "error"
      ? state.message
      : nearbyOn && origin && !onMap(origin)
        ? "Vaša lokacija je zunaj zemljevida. Seznam je vseeno razvrščen po bližini."
        : nearbyOn
          ? "Seznam je razvrščen po bližini."
          : undefined;
  const missing =
    unplaced > 0 ? `${plural(unplaced, SHELTER_FORMS)} ni na zemljevidu.` : undefined;

  return (
    // No negative margin anywhere below: the sidebar scrolls vertically, and
    // any child wider than its padding box turns that into a horizontal
    // scrollbar too.
    <div className="space-y-2.5">
      {/* Above the map, and not shaped like the pills in Zdravje. This sorts
          the list, it does not filter it: nothing drops out, no chip appears
          and the URL does not change, so it should not wear the look the panel
          uses for filters. */}
      <button
        type="button"
        onClick={toggleNearby}
        aria-pressed={nearbyOn}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md py-0.5 text-xs transition-colors",
          nearbyOn
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {state.status === "locating" ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <ArrowDownNarrowWide className="size-3.5" aria-hidden />
        )}
        {state.status === "locating" ? "Iščem lokacijo…" : "Najbližje prvo"}
      </button>

      <ShelterMap
        pins={pins}
        busiest={busiest}
        selected={selected}
        onPick={pick}
        origin={origin}
      />

      {/* Stays mounted so a denied permission is announced, not just drawn. */}
      <p
        aria-live="polite"
        className="text-[11px] leading-tight text-muted-foreground empty:hidden"
      >
        {status}
      </p>
      <p className="text-[11px] leading-tight text-muted-foreground empty:hidden">
        {missing}
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
              ref={(node) => {
                if (node) rowRefs.current.set(value, node);
                else rowRefs.current.delete(value);
              }}
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
