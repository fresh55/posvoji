"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownNarrowWide,
  ChevronDown,
  LoaderCircle,
  MapPin,
} from "lucide-react";
import { ShelterMap } from "@/components/filters/shelter-map";
import { ShelterRows, type ShelterRow } from "@/components/filters/shelter-rows";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption } from "@/lib/filters";
import { cityAt, distanceKm, onMap } from "@/lib/geo";
import { ALL_FORMS, pick, plural, SHELTER_FORMS } from "@/lib/labels";
import type { ShelterPin } from "@/lib/map-layout";
import { cn } from "@/lib/utils";

// Where you adopt from is not the same kind of question as what sex or size you
// want. Those are three-option enumerations you weigh side by side, and they
// belong in a column of small controls. This one is a map, and in a 14rem
// column a map of a whole country is 209px across, which is what kept its
// targets too small to hit however they were drawn. It sits beside the species
// tabs instead, as the second question everyone actually brings: what, and
// where. That also means the map is only ever drawn at a size it works at.
export function LocationPicker({
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
  const [open, setOpen] = useState(false);
  const { state, toggle: toggleNearby } = useNearby();
  const origin = state.status === "on" ? state.at : undefined;
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

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

  // Picking a region picks every shelter in it, which is as fine as a map of a
  // country can honestly be. The list is where you drop the ones you did not
  // mean, so bringing the first of them into view is what shows what happened.
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

  // The trigger has to answer "what is behind this" before it is clicked, and
  // the count is what answers it: eleven shelters exist and this is where they
  // are. "Vsa zavetišča" alone read as a filter state, not as a way in.
  const total = options.length;
  const quantifier = pick(total, ALL_FORMS);
  const label =
    selected.length === 0
      ? `${quantifier[0].toUpperCase()}${quantifier.slice(1)} ${plural(total, SHELTER_FORMS)}`
      : `${selected.length} od ${total} ${SHELTER_FORMS[3]}`;

  return (
    <>
      {/* shadcn's combobox trigger, not an action button. A button says "do
          something"; this holds a value you can change, and the field shape
          and the chevron are what say so before it is clicked. */}
      <Button
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Zavetišče: ${label}. Odpri zemljevid.`}
        onClick={() => setOpen(true)}
        className="max-w-[14rem] justify-between gap-2 font-normal"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 opacity-60" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="size-3.5 opacity-50" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[46rem]">
          <DialogHeader>
            <DialogTitle>Kje iščeš?</DialogTitle>
            <DialogDescription>
              Klikni zavetišče ali celo regijo na zemljevidu, ali izbiraj s
              seznama.
            </DialogDescription>
          </DialogHeader>

          {/* Not shaped like the pills in Zdravje. This sorts the list, it does
              not filter it: nothing drops out, no chip appears and the URL does
              not change, so it should not wear the look used for filters. */}
          <button
            type="button"
            onClick={toggleNearby}
            aria-pressed={nearbyOn}
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-md py-0.5 text-xs transition-colors",
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
            onPick={pickRegion}
            origin={origin}
          />

          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
            <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden>
              <circle cx="5" cy="5" r="4" className="fill-foreground/45" />
            </svg>
            Zavetišče. Večji krog pomeni več živali.
          </p>

          <div className="space-y-1">
            {/* Stays mounted so a denied permission is announced, not just
                drawn. */}
            <p
              aria-live="polite"
              className="text-[11px] leading-tight text-muted-foreground empty:hidden"
            >
              {status}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground empty:hidden">
              {missing}
            </p>
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
          </div>

          <ShelterRows
            rows={rows}
            counts={counts}
            selected={selected}
            onToggle={onToggle}
            refs={rowRefs}
            className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
