"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownNarrowWide,
  ChevronDown,
  LoaderCircle,
  MapPin,
  PawPrint,
} from "lucide-react";
import { ShelterMap } from "@/components/filters/shelter-map";
import { ShelterRows, type ShelterRow } from "@/components/filters/shelter-rows";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption } from "@/lib/filters";
import { cityAt, distanceKm, onMap } from "@/lib/geo";
import { allShelters, sheltersMissingFromMap } from "@/lib/labels";
import type { ShelterPin } from "@/lib/map-layout";
import { cn } from "@/lib/utils";

// The map needs dialog width. Narrow screens use regions and the exact list.
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
  const { locale, messages, t } = useI18n();
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

  const pins: ShelterPin[] = useMemo(
    () =>
      rows.flatMap((row) =>
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
      ),
    [counts, rows],
  );

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
        ? messages.locationOutsideMap
        : nearbyOn
          ? messages.sortedByDistance
          : undefined;
  const missing =
    unplaced > 0
      ? sheltersMissingFromMap(unplaced, locale)
      : undefined;

  // The trigger has to answer "what is behind this" before it is clicked, and
  // the count is what answers it: eleven shelters exist and this is where they
  // are. "Vsa zavetišča" alone read as a filter state, not as a way in.
  const total = options.length;
  const label =
    selected.length === 0
      ? allShelters(total, locale)
      : t("selectedShelters", { selected: selected.length, total });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("shelterPickerLabel", { label })}
          className="max-w-[14rem] justify-between gap-2 font-normal"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 opacity-60" aria-hidden />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="size-3.5 opacity-50" aria-hidden />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-w-[46rem]"
        closeLabel={messages.close}
      >
        <DialogHeader>
            <DialogTitle>{messages.whereSearching}</DialogTitle>
            <DialogDescription>
              <span className="hidden md:inline">
                {messages.mapInstructionsDesktop}
              </span>
              <span className="md:hidden">
                {messages.mapInstructionsMobile}
              </span>
            </DialogDescription>
        </DialogHeader>

        {/* This changes sort order, not filter state. */}
        <button
            type="button"
            onClick={toggleNearby}
            aria-pressed={nearbyOn}
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-ui py-0.5 text-xs transition-colors",
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
            {state.status === "locating"
              ? messages.locating
              : messages.nearestFirst}
        </button>

        <ShelterMap
            pins={pins}
            selected={selected}
            onPick={pickRegion}
            origin={origin}
        />

        <p className="flex items-center gap-2 text-[10px] leading-none text-muted-foreground md:hidden">
            <span>{messages.fewerAnimals}</span>
            <span className="flex items-center gap-0.5" aria-hidden>
              {[14, 18, 22, 26, 30].map((opacity) => (
                <span
                  key={opacity}
                  className="size-2 rounded-[2px] bg-foreground"
                  style={{ opacity: opacity / 100 }}
                />
              ))}
            </span>
            <span>{messages.moreAnimals}</span>
        </p>

        <p className="hidden items-center gap-1.5 text-[11px] leading-tight text-muted-foreground md:flex">
            <span
              aria-hidden
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-foreground/70 bg-background"
            >
              <PawPrint className="size-2.5 text-foreground/70" strokeWidth={2.25} />
            </span>
            {messages.shelter}
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
              {messages.regionBoundaries}:{" "}
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
  );
}
