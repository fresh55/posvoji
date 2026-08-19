"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  MapPin,
  Navigation,
  PawPrint,
  Search,
  X,
} from "lucide-react";
import { MunicipalityFinder } from "@/components/filters/municipality-finder";
import {
  FOUND_ANIMAL_PARAM,
  OPEN_MUNICIPALITY_LOOKUP_EVENT,
} from "@/lib/found-animal";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { ResultCount } from "@/components/filters/result-count";
import { ShelterMap } from "@/components/filters/shelter-map";
import { ShelterRows, type ShelterRow } from "@/components/filters/shelter-rows";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption, SpeciesFilter } from "@/lib/filters";
import { cityAt, distanceKm, formatKm, onMap } from "@/lib/geo";
import { allShelters, sheltersMissingFromMap } from "@/lib/labels";
import { DENSITY_STEPS, type ShelterPin } from "@/lib/map-layout";
import { readTypedLocation, resolveOrigin } from "@/lib/origin";
import { looksLikePostcode } from "@/lib/postal-lookup";
import { cn } from "@/lib/utils";

// Search matches with or without diacritics, so "sezana" finds Sežano.
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// The map needs dialog width. Narrow screens use regions and the exact list.
export function LocationPicker({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  resultCount,
  species,
  municipalities,
  offSite,
  deepLink,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  /** Animals the whole filter state currently matches, shown live on the
   *  confirm button so picking a shelter has visible consequences. */
  resultCount: number;
  species: SpeciesFilter;
  /** Municipality → responsible-shelter entries. When present, the dialog
   *  grows a second mode behind a quiet button: search by občina instead of
   *  by shelter. */
  municipalities?: LookupEntry[];
  /** Registry shelters with no animals on the site. Drawn as inert markers
   *  and as rows linking to their shelter page, so the map answers "where are
   *  Slovenia's shelters" and not just "where are ours". */
  offSite?: FilterOption[];
  /** Which rendered instance answers the found-animal strip and the ?najdena
   *  deep link. The picker is mounted twice (desktop toolbar, mobile dock);
   *  only the one visible at the current breakpoint may open, or two dialogs
   *  would fight. Omit to opt out of deep-linking entirely. */
  deepLink?: "desktop" | "mobile";
}) {
  const { locale, messages, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The municipality mode: same dialog, same map, different question. Off by
  // default and behind its own button, so the shelter picker stays what it
  // was until someone arrives with a found animal instead of a filter.
  const [muniMode, setMuniMode] = useState(false);
  const [muniShelterIds, setMuniShelterIds] = useState<string[] | null>(null);

  // The found-animal strip and the ?najdena URL both land here: open the
  // dialog straight in municipality mode. Guarded by breakpoint because two
  // instances of this picker are mounted at once and exactly one is visible.
  const canDeepLink = Boolean(deepLink && municipalities?.length);
  useEffect(() => {
    if (!canDeepLink) return;
    const isMine = () => {
      const isDesktop = window.matchMedia("(min-width: 64rem)").matches;
      return deepLink === "desktop" ? isDesktop : !isDesktop;
    };
    const openLookup = () => {
      if (!isMine()) return;
      setMuniMode(true);
      setOpen(true);
    };
    if (new URLSearchParams(window.location.search).has(FOUND_ANIMAL_PARAM)) {
      openLookup();
    }
    window.addEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, openLookup);
    return () =>
      window.removeEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, openLookup);
  }, [canDeepLink, deepLink]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState("");
  const placeRef = useRef<HTMLInputElement>(null);
  // The status line belongs to the place input, both on screen and to a
  // screen reader, so it is named once and pointed at from the field.
  const statusId = useId();
  const {
    state,
    toggle: toggleNearby,
    dismissError,
    turnOff: turnOffNearby,
  } = useNearby();
  const geolocated = state.status === "on" ? state.at : undefined;
  // The point the list sorts from, and where it came from. Memoized because
  // the row sort below takes it as a dependency, and a fresh object every
  // render would re-sort every render.
  const { typed, resolved } = useMemo(() => {
    const read = readTypedLocation(place);
    return { typed: read, resolved: resolveOrigin(geolocated, read) };
  }, [geolocated, place]);
  const origin = resolved.at;
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // Two independent hover states for the two directions: a row lights up its
  // marker and region, a marker lights up its row(s). Keeping them as separate
  // pieces of state means neither can feed back into the other.
  const [hoveredRowValue, setHoveredRowValue] = useState<string | null>(null);
  const [hoveredMarkerValues, setHoveredMarkerValues] = useState<
    string[] | null
  >(null);

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

  // Same locating and sorting as the live rows, in their own list: these are
  // real shelters someone may live next to, they just have nothing to filter.
  const offRows: (ShelterRow & { at?: ReturnType<typeof cityAt> })[] =
    useMemo(() => {
      const located = (offSite ?? []).map((option) => {
        const at = option.city ? cityAt(option.city) : undefined;
        return {
          ...option,
          at,
          km: at && origin ? distanceKm(origin, at) : undefined,
        };
      });
      if (!origin) return located;
      return [...located].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    }, [offSite, origin]);

  // What the municipality cards may offer to select: only shelters that
  // exist as filter options, i.e. currently have animals to show.
  const selectableIds = useMemo(
    () => new Set(options.map((option) => option.value)),
    [options],
  );

  const pins: ShelterPin[] = useMemo(
    () => [
      ...rows.flatMap((row) =>
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
      // selectable: false is what keeps these out of region picks: a region
      // click must never select a shelter that has nothing to show.
      ...offRows.flatMap((row) =>
        row.at
          ? [
              {
                value: row.value,
                label: row.label,
                city: row.city ?? "",
                at: row.at,
                count: 0,
                selectable: false,
              },
            ]
          : [],
      ),
    ],
    [counts, offRows, rows],
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

  // Search narrows the list only. The map keeps every pin, so the country
  // stays whole while you type.
  const visibleRows = query.trim()
    ? rows.filter((row) =>
        fold(`${row.label} ${row.city ?? ""}`).includes(fold(query)),
      )
    : rows;
  const visibleOffRows = query.trim()
    ? offRows.filter((row) =>
        fold(`${row.label} ${row.city ?? ""}`).includes(fold(query)),
      )
    : offRows;

  const unplaced = rows.length + offRows.length - pins.length;
  const hasOffSitePins = pins.some((pin) => pin.selectable === false);
  const nearbyOn = state.status === "on";
  // Two independent facts, so two lines. Sharing one slot meant a geolocation
  // error silently replaced the note about shelters missing from the map.
  //
  // Within this line the order follows the origin the list is actually sorted
  // by, with one exception at the top: a geolocation error is news the user
  // just asked for by pressing the button, so it is said first. It only lasts
  // until the user types, which dismisses it in favor of the input's own
  // feedback.
  const status =
    state.status === "error"
      ? state.message
      : resolved.source === "geolocation"
        ? origin && !onMap(origin)
          ? messages.locationOutsideMap
          : messages.sortedByDistance
        : typed.status === "unknown"
          ? looksLikePostcode(place)
            ? messages.postcodeNotFound
            : messages.locationNotFound
          : resolved.source === "typed"
            ? t("sortedByDistanceFrom", { label: resolved.label ?? "" })
            : undefined;
  const missing =
    unplaced > 0
      ? sheltersMissingFromMap(unplaced, locale)
      : undefined;

  // The trigger has to answer "what is behind this" before it is clicked, and
  // the count is what answers it: eleven shelters exist and this is where they
  // are. "Vsa zavetišča" alone read as a filter state, not as a way in.
  const total = options.length;
  const detailBase = locale === "sl" ? "/zavetisca" : "/en/shelters";
  const label =
    selected.length === 0
      ? allShelters(total, locale)
      : t("selectedShelters", { selected: selected.length, total });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          // Reopening lands in the shelter picker, whatever question the
          // dialog closed on.
          setMuniMode(false);
          setMuniShelterIds(null);
        }
      }}
    >
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
        className="max-w-[min(88rem,calc(100vw-2rem))] md:h-[min(88dvh,56rem)] md:overflow-hidden"
        closeLabel={messages.close}
        onEscapeKeyDown={(event) => {
          // Escape empties the box it is pressed in first, and only closes the
          // panel once that box is already empty: clearing a search should not
          // cost the whole map. It has to be handled here rather than on the
          // inputs, because the dialog listens for the key on the document in
          // the capture phase, before it ever reaches the field.
          const target = event.target;
          if (target === placeRef.current && place !== "") {
            setPlace("");
            event.preventDefault();
          } else if (target === searchRef.current && query !== "") {
            setQuery("");
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          // Keyboards land in search, ready to type a shelter name. Touch
          // devices keep radix's default so the soft keyboard stays down
          // until the search box is asked for.
          if (window.matchMedia?.("(pointer: fine)").matches) {
            event.preventDefault();
            searchRef.current?.focus();
          }
        }}
      >
        {/* Selection changes narrate themselves: a region click can toggle
            several shelters at once, and aria-pressed alone does not say how
            many. The label is the one already on the trigger, so the wording
            cannot drift. */}
        <p aria-live="polite" className="sr-only">
          {label}
        </p>

        <DialogHeader className="shrink-0">
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

        {/* md+: the map owns the dialog. It fills every pixel the fixed-height
            dialog gives it, and the list is a slim sidebar scrolling on its
            own. Below md the two stack in the same order (map, then search and
            list), and the whole dialog scrolls instead.

            Below md this is one flex column and the map's column is display:
            contents, so the map, the inputs and the legend are all siblings in
            it and the legend can be ordered last. On md+ the contents goes
            away, the map column is a real column again, and the legend sits
            under the map where it belongs. */}
        <div className="flex flex-col md:grid md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)] md:gap-8">
          <div className="contents md:flex md:flex-col md:gap-3 md:min-h-0">
            {/* The map's own aspect ratio (320:210) sets its height from its
                width below md, so height is capped there by capping the width
                a calc() derives from it. On md+ the wrapper has a real height
                and the SVG scales to fit it instead. */}
            {/* A quiet canvas behind the country, so the letterboxed space a
                fixed-aspect map leaves in a fluid dialog reads as sea, not as
                a gap. The drop-shadow rides the composited SVG, which gives
                the country one silhouette shadow instead of one per region. */}
            <div className="mx-auto w-full max-w-[calc(42vh*32/21)] rounded-ui bg-muted/40 p-2 sm:p-3 md:mx-0 md:min-h-0 md:flex-1 md:max-w-none">
              <ShelterMap
                pins={pins}
                selected={selected}
                onPick={pickRegion}
                origin={origin}
                highlightedValue={muniMode ? null : hoveredRowValue}
                matchedValues={
                  muniMode
                    ? muniShelterIds
                    : query.trim()
                      ? [...visibleRows, ...visibleOffRows].map(
                          (row) => row.value,
                        )
                      : null
                }
                // The ring and named card that answer "so where is that?"
                // once a municipality is picked. Stronger than the hover
                // highlight on purpose, and the only signal phones get.
                spotlightValues={muniMode ? muniShelterIds : null}
                spotlightNote={messages.muniResponsible}
                onHoverShelters={setHoveredMarkerValues}
                className="md:h-full [filter:drop-shadow(0_1px_1px_rgb(0_0_0/0.06))_drop-shadow(0_6px_14px_rgb(0_0_0/0.07))]"
              />
            </div>

            {/* Same steps the map fills its regions with, read from one array
                so the legend cannot drift away from the picture.

                Ordered last below md: on a phone the legend is the least of
                what the panel is for, and the inputs it used to push down are
                the most. */}
            <div className="order-last mt-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] leading-none text-muted-foreground md:order-none md:mt-0">
              <span className="flex items-center gap-2">
                <span>{messages.fewerAnimals}</span>
                <span className="flex items-center gap-0.5" aria-hidden>
                  {DENSITY_STEPS.map((opacity) => (
                    <span
                      key={opacity}
                      className="size-2 rounded-[2px] bg-foreground"
                      style={{ opacity }}
                    />
                  ))}
                </span>
                <span>{messages.moreAnimals}</span>
              </span>

              <span className="hidden items-center gap-1.5 md:flex">
                <span
                  aria-hidden
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-foreground/70 bg-background"
                >
                  <PawPrint className="size-2.5 text-foreground/70" strokeWidth={2.25} />
                </span>
                {messages.shelter}
              </span>

              {/* The dot the map draws for a shelter with nothing to pick: a
                  different shape from the paw disc, not a fainter copy of it.
                  Only where those markers exist: they are md-only, and only
                  once one of them is on the map. */}
              {hasOffSitePins && (
                <span className="hidden items-center gap-1.5 md:flex">
                  <span
                    aria-hidden
                    className="inline-flex size-4 shrink-0 items-center justify-center"
                  >
                    <span className="size-1.5 rounded-full bg-foreground/35" />
                  </span>
                  {messages.noAnimalsListed}
                </span>
              )}

              {/* Only once there is a point to explain. The ring repeats the
                  dashed circle the map draws at the origin, at legend size. */}
              {origin && (
                <span className="flex items-center gap-1.5">
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="size-4 shrink-0"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      strokeWidth="1.2"
                      strokeDasharray="2.4 2.4"
                      className="fill-none stroke-foreground opacity-70"
                    />
                    <circle cx="8" cy="8" r="2.1" className="fill-foreground" />
                  </svg>
                  {messages.originLegend}
                </span>
              )}

              <span className="leading-tight">
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
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-col md:mt-0 md:min-h-0 md:border-l md:pl-6">
            {municipalities && municipalities.length > 0 && (
              // Two questions, two tabs: filter by shelter, or start from a
              // found animal's občina. Labeled and always visible, so the
              // second mode is discoverable instead of a footnote. Same shape
              // as the species tabs, so the site has one tab.
              <div className="mb-3 flex shrink-0 gap-1">
                {(
                  [
                    { mode: false, label: messages.shelters },
                    { mode: true, label: messages.muniTab },
                  ] as const
                ).map(({ mode, label }) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={muniMode === mode}
                    onClick={() => {
                      setMuniMode(mode);
                      if (!mode) setMuniShelterIds(null);
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center rounded-ui px-2.5 py-1 text-sm transition-colors",
                      muniMode === mode
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {muniMode && municipalities ? (
              <MunicipalityFinder
                entries={municipalities}
                selectableIds={selectableIds}
                selected={selected}
                onToggle={onToggle}
                onActiveShelters={setMuniShelterIds}
              />
            ) : (
              <>
            <div className="relative shrink-0">
              <Search
                className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Enter takes the top match, so search-and-pick is one
                  // gesture. ArrowDown walks into the list instead.
                  if (event.key === "Enter" && query.trim()) {
                    const first = visibleRows.find(
                      (row) =>
                        (counts.get(row.value) ?? 0) > 0 ||
                        selected.includes(row.value),
                    );
                    if (first) onToggle(first.value);
                    event.preventDefault();
                  } else if (event.key === "ArrowDown") {
                    const first = visibleRows.find(
                      (row) =>
                        (counts.get(row.value) ?? 0) > 0 ||
                        selected.includes(row.value),
                    );
                    if (first) {
                      rowRefs.current.get(first.value)?.focus();
                      event.preventDefault();
                    }
                  }
                }}
                placeholder={messages.searchShelters}
                aria-label={messages.searchShelters}
                className="h-8 pl-8 text-sm"
              />
            </div>

            {/* The typed way to sort by distance, and the one that always
                works: no permission prompt, no fix to wait for, and it answers
                "which shelter is near the town I am moving to" as well as it
                answers "near me". A postcode or a town name, resolved against
                the postal-district table. */}
            <div className="relative mt-2 shrink-0">
              <MapPin
                className={cn(
                  "absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 transition-colors",
                  resolved.source === "typed"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
                aria-hidden
              />
              <Input
                ref={placeRef}
                type="text"
                inputMode="text"
                autoComplete="postal-code"
                value={place}
                onChange={(event) => {
                  const next = event.target.value;
                  setPlace(next);
                  // The most recent act wins. Typing a place that resolves is
                  // a newer answer than any fix, so geolocation goes off
                  // rather than quietly outranking what was just typed.
                  // Anything else only clears a stale error, which would
                  // otherwise sit on top of this input's own feedback and make
                  // typing look inert.
                  if (readTypedLocation(next).status === "matched") {
                    turnOffNearby();
                  } else {
                    dismissError();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    // Nothing to submit: the sort already followed the typing.
                    // Enter is how a keyboard says it is done, so take the
                    // focus off the field and leave the dialog alone.
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  // Escape is the dialog's to hear first, so what it does in
                  // this field is decided on DialogContent above.
                }}
                // The field holds one place at a time, so coming back to it
                // means replacing, not appending. Selecting on focus makes
                // typing a new postcode over an old one just work.
                onFocus={(event) => event.currentTarget.select()}
                enterKeyHint="done"
                placeholder={messages.postcodeOrTown}
                aria-label={messages.postcodeOrTown}
                aria-describedby={statusId}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {place !== "" && (
                <button
                  type="button"
                  onClick={() => {
                    setPlace("");
                    placeRef.current?.focus();
                  }}
                  aria-label={messages.clearLocation}
                  className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>

            {/* Directly under the field it is about, where the eye already is
                after typing. Stays mounted so a denied permission is
                announced, not just drawn. */}
            <p
              id={statusId}
              aria-live="polite"
              className="mt-1 shrink-0 text-[11px] leading-tight text-muted-foreground empty:hidden"
            >
              {status}
            </p>

            <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
              {/* This changes sort order, not filter state. The icon is a
                  crosshair rather than the sort arrow the sort picker owns:
                  with a typed box above it, this button's job is "use where I
                  am", and sorting is what both of them cause. It steps aside
                  while a typed place drives the sort: the list is already
                  nearest-first, and pressing it then would silently swap the
                  typed origin for the visitor's own. */}
              {resolved.source !== "typed" && (
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
                    <Navigation className="size-3.5" aria-hidden />
                  )}
                  {state.status === "locating"
                    ? messages.locating
                    : messages.nearestFirst}
                </button>
              )}

              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onToggleMany(selected)}
                  className="ml-auto rounded-ui py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {messages.clear} ({selected.length})
                </button>
              )}
            </div>

            <div className="mt-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
              {visibleRows.length === 0 && visibleOffRows.length === 0 ? (
                <div className="space-y-1.5 px-2 py-2 text-sm text-muted-foreground">
                  <p>
                    {messages.noSheltersFound} »{query.trim()}«
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    className="text-xs underline underline-offset-2 transition-colors hover:text-foreground"
                  >
                    {messages.clearSearch}
                  </button>
                </div>
              ) : (
                <>
                  <ShelterRows
                    rows={visibleRows}
                    counts={counts}
                    selected={selected}
                    onToggle={onToggle}
                    refs={rowRefs}
                    highlighted={hoveredMarkerValues ?? undefined}
                    onHoverRow={setHoveredRowValue}
                    onExitTop={() => searchRef.current?.focus()}
                    lessThanOneKm={messages.lessThanOneKm}
                    className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 md:grid-cols-1 md:gap-x-0"
                  />

                  {/* Registry shelters without animals, under their own
                      heading so the zeroes read as "not here yet" rather
                      than as empty search results. There is nothing to
                      filter by, but there is a page for each of them, so
                      the rows are links out rather than dead toggles. The
                      layout copies ShelterRows down to the spacer where its
                      check sits, so the two lists share their columns. */}
                  {visibleOffRows.length > 0 && (
                    <div className="mt-3">
                      <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                        {messages.noAnimalsListedHeading}
                      </p>
                      <div className="space-y-0.5 sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 md:grid-cols-1 md:gap-x-0">
                        {visibleOffRows.map((row) => {
                          const sublabel = [
                            row.city,
                            row.km === undefined
                              ? undefined
                              : formatKm(row.km, messages.lessThanOneKm),
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          const isHighlighted =
                            hoveredMarkerValues?.includes(row.value) ?? false;
                          return (
                            <a
                              key={row.value}
                              href={`${detailBase}/${row.value}`}
                              onPointerEnter={() => setHoveredRowValue(row.value)}
                              onPointerLeave={() => setHoveredRowValue(null)}
                              data-highlighted={isHighlighted || undefined}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left transition-colors",
                                isHighlighted ? "bg-muted/50" : "hover:bg-muted/50",
                              )}
                            >
                              <span className="size-3.5 shrink-0" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-muted-foreground">
                                  {row.label}
                                </span>
                                {sublabel && (
                                  <span className="block truncate text-[11px] text-muted-foreground/80">
                                    {sublabel}
                                  </span>
                                )}
                              </span>
                              <ChevronRight
                                className="size-3 shrink-0 text-muted-foreground/60"
                                aria-hidden
                              />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* This one is about the map, not about the input, so it stays at
                the bottom of the column. */}
            <div className="mt-2 shrink-0">
              <p className="text-[11px] leading-tight text-muted-foreground empty:hidden">
                {missing}
              </p>
            </div>
              </>
            )}
          </div>
        </div>

        {/* The same closing move the filter sheet has: the count answers "what
            did my picking do" before the dialog goes away. Sticky below md so
            it survives the scrolling dialog; the fixed-height desktop layout
            keeps it in view by itself. */}
        <div className="sticky bottom-0 -mx-5 -mb-5 mt-1 flex shrink-0 items-center justify-end border-t bg-popover px-5 py-3 md:static md:mx-0 md:mb-0 md:mt-0 md:px-0 md:pb-0">
          <DialogClose asChild>
            <Button className="flex-1 md:flex-none md:min-w-44">
              {messages.show}
              <ResultCount
                count={resultCount}
                species={species}
                locale={locale}
                announce={false}
                variant="inline"
                className="justify-start text-current"
              />
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
