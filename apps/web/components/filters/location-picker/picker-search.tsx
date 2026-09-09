import { MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LocationPickerController } from "./controller";
import { pickerText } from "./model";

export function PickerSearch({ controller }: { controller: LocationPickerController }) {
  const {
    query, setQuery, typed, placeMode, choosePlace, clearOrigin,
    placeSuggestionRef, searchRef, rowRefs, visibleRows, counts, selected,
    dismissError, statusId, status, resolved, locale, messages,
  } = controller;
  const copy = pickerText[locale];
  const canChoosePlace = typed.status === "matched" && !placeMode;
  const firstRow = visibleRows.find(
    (row) => (counts.get(row.value) ?? 0) > 0 || selected.includes(row.value),
  );
  const focusResult = () => {
    if (canChoosePlace) placeSuggestionRef.current?.focus();
    else if (firstRow) rowRefs.current.get(firstRow.value)?.focus();
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
              event.preventDefault();
              // Enter never toggles an unseen first match. Move to the named
              // result so a second deliberate activation makes the choice.
              focusResult();
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          enterKeyHint="search"
          placeholder={messages.placeOrShelter}
          aria-label={messages.placeOrShelter}
          aria-describedby={statusId}
          className="h-11 bg-background pl-9 pr-11 text-base shadow-none lg:text-sm"
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
            aria-label={copy.removeOrigin}
            onClick={clearOrigin}
            className="h-11 max-w-full justify-start gap-2 bg-muted/30 px-3 text-left text-sm shadow-none"
          >
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{resolved.label ?? messages.nearestFirst}</span>
            <X className="size-3.5 shrink-0" aria-hidden />
          </Button>
          <p className="text-xs leading-snug text-muted-foreground">{copy.distance}</p>
        </div>
      )}
      <p id={statusId} aria-live="polite" className={cn("text-xs leading-snug text-muted-foreground", !status && "hidden")}>
        {status}
      </p>
      {query.trim() && !placeMode && (
        <p className="text-xs font-medium text-muted-foreground">{copy.shelters}</p>
      )}
    </div>
  );
}
