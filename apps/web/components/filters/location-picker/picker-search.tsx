import {
  LoaderCircle,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { LocationPickerController } from "./controller";
import { pickerText } from "./model";

export function PickerSearch({ controller }: { controller: LocationPickerController }) {
  const {
    query, setQuery, typed, placeMode, choosePlace, clearOrigin,
    placeSuggestionRef, searchRef, rowRefs, visibleRows, visibleOffRows, counts, selected,
    dismissError, statusId, status, resolved, locale, messages,
    toggleLocate, nearbyOn, state, radiusPicks, pickWithin, setAskedRadius,
  } = controller;
  const copy = pickerText[locale];
  const canLocate = resolved.source !== "typed";
  // Spelled out rather than taken from the controller's placeOffered, which is
  // the same test: this one narrows typed, so the row below can name the place.
  const canChoosePlace = typed.status === "matched" && !placeMode;
  // The off-site rows are the fallback, not an afterthought: a query that only
  // an off-site shelter matches draws that group as the whole answer, and
  // without this Enter and ArrowDown had nowhere to go. Both lists register
  // into the same rowRefs map, so one lookup reaches either kind of row.
  const firstRow =
    visibleRows.find(
      (row) => (counts.get(row.value) ?? 0) > 0 || selected.includes(row.value),
    ) ?? visibleOffRows[0];
  // Reports whether it moved, so the key is only swallowed when it did
  // something. With no place and no row, Tab has to keep working.
  const focusResult = () => {
    if (canChoosePlace) {
      placeSuggestionRef.current?.focus();
      return true;
    }
    if (firstRow) {
      // The ref and not the row: an off-site row is only in the map while its
      // group is mounted, and the group is folded whenever any live row
      // matched. Answering "yes" on a row whose ref is absent swallowed the
      // key and moved nothing, which is the failure this return exists to
      // prevent.
      const node = rowRefs.current.get(firstRow.value);
      node?.focus();
      return Boolean(node);
    }
    return false;
  };

  return (
    <div className="shrink-0 space-y-2">
      <div className="relative">
        <Search
          data-picker-field-mode={placeMode ? "place" : "name"}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={searchRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            dismissError();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "ArrowDown") {
              // Enter never toggles an unseen first match. Move to the named
              // result so a second deliberate activation makes the choice.
              // Swallow the key only when it moved; with nothing to move to,
              // the key belongs to the browser again.
              if (focusResult()) event.preventDefault();
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          enterKeyHint="search"
          placeholder={messages.placeOrShelter}
          aria-label={messages.placeOrShelter}
          aria-describedby={statusId}
          className={cn(
            "h-11 bg-background pl-9 text-base shadow-none",
            // Room for the controls drawn over the field's right end: the
            // locate button always, the clear button while there is text.
            canLocate && query !== "" ? "pr-22" : "pr-11",
            // md:text-base beats ui/input.tsx's own md:text-sm, which otherwise
            // drops this field to 14px from 768 up and makes iOS zoom the page
            // on focus across every touch tablet and landscape phone.
            // lg:text-sm is where the 14px was meant to start.
            "md:text-base lg:text-sm",
          )}
        />
        {query !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            aria-label={messages.clearField}
            className={cn("absolute top-0 size-11 text-muted-foreground", canLocate ? "right-11" : "right-0")}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
        {/* The other way to say where: the visitor's own position. Inside the
            field that takes a place, so both answers to "where" sit in one
            control, and the list re-sorts by distance under it either way, as
            does a grid nobody has put in an order of their own (originPressed
            in controller.ts). It used to be a row of its own under the field.
            Not offered while a typed place is the origin: that place's chip
            below is the origin then, and removing it is how to go back. */}
        {canLocate && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleLocate}
            aria-pressed={nearbyOn}
            aria-label={state.status === "locating" ? messages.locating : messages.nearestFirst}
            title={messages.nearestFirst}
            data-picker-locate
            className={cn(
              "absolute right-0 top-0 size-11",
              nearbyOn ? "text-brand-strong" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {state.status === "locating" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Navigation className={cn("size-4", nearbyOn && "fill-current")} aria-hidden />
            )}
          </Button>
        )}
      </div>
      {canChoosePlace && (
        <div role="group" aria-label={copy.places} className="space-y-1 border-b pb-2">
          <p className="px-2 text-xs font-medium text-muted-foreground">{copy.places}</p>
          <Button
            ref={placeSuggestionRef}
            type="button"
            variant="ghost"
            onClick={choosePlace}
            className="h-auto min-h-11 w-full justify-start gap-2 px-2 py-2 text-left whitespace-normal"
          >
            <MapPin className="size-4 shrink-0" aria-hidden />
            {copy.near} {typed.label}
          </Button>
        </div>
      )}
      {resolved.at && (
          // The origin and the distances from it, on one line where they fit:
          // stacked, they were four rows above the first shelter, and a phone
          // held sideways was left one row of list. The distances wrap to the
          // next line together, never one chip at a time.
          //
          // Two more rows stood here once. A toggle ordered the grid by
          // distance, which the place now does by itself (originPressed in
          // controller.ts), and a line said the distances are straight lines
          // between towns, which every row's kilometres and the ring on the
          // map already carry. On a phone the pair cost four rows of list.
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              aria-label={`${copy.removeOrigin}: ${resolved.label ?? messages.myLocation}`}
              onClick={clearOrigin}
              className="h-11 max-w-full justify-start gap-2 bg-muted/30 px-3 text-left text-sm shadow-none"
            >
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {/* A geolocated origin has no label of its own. It used to borrow
                  the "Najbližje prvo" toggle's words, which left two controls
                  80px apart reading the same thing and doing opposite things. */}
              <span className="truncate">{resolved.label ?? messages.myLocation}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </Button>
            {/* How far, as a pick: people choose by how far they will drive,
                not by the names of shelters they have not heard of. Each chip
                picks every shelter within its reach that has animals under the
                current filters, and the map draws the reach as a ring while a
                chip is pointed at or standing. */}
            {radiusPicks.length > 0 && (
              <div role="group" aria-label={copy.pickWithin} className="flex gap-2">
                {radiusPicks.map(({ km, values, pressed }) => (
                  <Toggle
                    key={km}
                    variant="outline"
                    pressed={pressed}
                    onPressedChange={() => pickWithin(km)}
                    disabled={values.length === 0}
                    data-picker-radius={km}
                    onPointerEnter={() => setAskedRadius(km)}
                    onPointerLeave={() => setAskedRadius(null)}
                    onFocus={() => setAskedRadius(km)}
                    onBlur={() => setAskedRadius(null)}
                    // The origin chip's height, type and 3:1 border, on every
                    // pointer. They were 36px and 12px beside it with a mouse,
                    // the one row of short controls in the dialog. The border
                    // gives way to the pressed accent, which outranks it on
                    // [aria-pressed].
                    className="h-11 border-control-border px-3 shadow-none"
                  >
                    {copy.upTo} {km} km
                  </Toggle>
                ))}
              </div>
            )}
          </div>
      )}
      <p id={statusId} aria-live="polite" className={cn("text-xs leading-snug text-muted-foreground", !status && "hidden")}>
        {status}
      </p>
      {/* The "Zavetišča" heading used to close this block, where it labelled
          whatever came next rather than the list it names: the confirmed
          origin button and the live status line sit between here and the
          first shelter row, so on a query that had
          resolved to a place the heading stood over "Najbližje prvo". It is
          drawn in picker-shelter-list.tsx now, directly above the first row
          and tied to the rows it heads. */}
    </div>
  );
}
