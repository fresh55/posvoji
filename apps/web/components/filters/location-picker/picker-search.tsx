import { MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LocationPickerController } from "./controller";
import { pickerText } from "./model";

export function PickerSearch({ controller }: { controller: LocationPickerController }) {
  const {
    query, setQuery, typed, placeMode, choosePlace, clearOrigin,
    placeSuggestionRef, searchRef, rowRefs, visibleRows, visibleOffRows, counts, selected,
    dismissError, statusId, status, resolved, locale, messages,
  } = controller;
  const copy = pickerText[locale];
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
      rowRefs.current.get(firstRow.value)?.focus();
      return true;
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
            "h-11 bg-background pl-9 pr-11 text-base shadow-none",
            // md:text-base beats ui/input.tsx's own md:text-sm, which otherwise
            // drops this field to 14px from 768 up and makes iOS zoom the page
            // on focus across every touch tablet and landscape phone.
            // lg:text-sm is where the 14px was meant to start.
            "md:text-base lg:text-sm",
            // The frame is the whole of this control: one field in a dialog
            // with no label beside it and nothing else drawn around it.
            // ui/input.tsx ships border-input, which measures 1.26:1 on the
            // page, against the 3.66:1 --control-border carries. Spelled here
            // rather than on the primitive, which every portal form shares. No
            // dark: half, because ui/input.tsx spells no dark border of its
            // own (see CONTROL_FRAME in lib/link-styles.ts).
            "border-control-border",
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
            className="absolute right-0 top-0 size-11 text-muted-foreground"
          >
            <X className="size-4" aria-hidden />
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
        <div className="space-y-1">
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
          <p className="text-xs leading-snug text-muted-foreground">{copy.distance}</p>
        </div>
      )}
      <p id={statusId} aria-live="polite" className={cn("text-xs leading-snug text-muted-foreground", !status && "hidden")}>
        {status}
      </p>
      {/* The "Zavetišča" heading used to close this block, where it labelled
          whatever came next rather than the list it names: the confirmed
          origin button, its distance note and the live status line all sit
          between here and the first shelter row, so on a query that had
          resolved to a place the heading stood over "Najbližje prvo". It is
          drawn in picker-shelter-list.tsx now, directly above the first row
          and tied to the rows it heads. */}
    </div>
  );
}
