"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowDownNarrowWide, Expand, LoaderCircle } from "lucide-react";
import { ShelterMap } from "@/components/filters/shelter-map";
import { ShelterRows, type ShelterRow } from "@/components/filters/shelter-rows";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ShelterPin } from "@/lib/map-layout";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption } from "@/lib/filters";
import { cityAt, distanceKm, onMap } from "@/lib/geo";
import { plural, SHELTER_FORMS } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Shelter is the filter people actually use, because you adopt near where you
// live, so it leads with a map. In the sidebar that map is 209px across, which
// is enough to show the country and to pick a region but not enough to tell two
// shelters in one town apart. The expanded view is the same map with room for
// names, and the list is always there underneath.
export function ShelterPicker({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
}) {
  const { state, toggle: toggleNearby } = useNearby();
  const origin = state.status === "on" ? state.at : undefined;
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [expanded, setExpanded] = useState(false);

  const rows: (ShelterRow & { at?: ReturnType<typeof cityAt> })[] = useMemo(() => {
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

  // Picking a region picks every shelter in it, which is as fine as a 209px map
  // can honestly be. The list is where you drop the ones you did not mean, so
  // bringing the first of them into view is what shows what just happened.
  const pickRegion = useCallback(
    (values: string[]) => {
      onToggleMany(values);
      rowRefs.current.get(values[0])?.scrollIntoView({ block: "nearest" });
    },
    [onToggleMany],
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
    unplaced > 0
      ? `${plural(unplaced, SHELTER_FORMS)} ni na zemljevidu.`
      : undefined;

  const map = (labelled: boolean) => (
    <ShelterMap
      pins={pins}
      busiest={busiest}
      selected={selected}
      onPickRegion={pickRegion}
      origin={origin}
      labelled={labelled}
    />
  );

  return (
    // No negative margin anywhere below: the sidebar scrolls vertically, and
    // any child wider than its padding box turns that into a horizontal
    // scrollbar too.
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* Not shaped like the pills in Zdravje. This sorts the list, it does
            not filter it: nothing drops out, no chip appears and the URL does
            not change, so it should not wear the look used for filters. */}
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

        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 rounded-md py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Expand className="size-3.5" aria-hidden />
          Povečaj
        </button>
      </div>

      {map(false)}

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

      <ShelterRows
        rows={rows}
        counts={counts}
        selected={selected}
        onToggle={onToggle}
        refs={rowRefs}
      />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[46rem]">
          <DialogHeader>
            <DialogTitle>Zavetišča po Sloveniji</DialogTitle>
            <DialogDescription>
              Izberi območje na zemljevidu ali zavetišče s seznama.
            </DialogDescription>
          </DialogHeader>
          {map(true)}
          <p className="text-[11px] leading-tight text-muted-foreground">
            Meje statističnih regij:{" "}
            <a
              href="https://www.gov.si/drzavni-organi/organi-v-sestavi/geodetska-uprava/"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              GURS
            </a>
            , CC BY 4.0.
          </p>
          <ShelterRows
            rows={rows}
            counts={counts}
            selected={selected}
            onToggle={onToggle}
            className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
