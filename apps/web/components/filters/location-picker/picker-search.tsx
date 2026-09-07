import { Input } from "@/components/ui/input";
import { readTypedLocation } from "@/lib/origin";
import { cn } from "@/lib/utils";
import { LoaderCircle, MapPin, Navigation, Search, X } from "lucide-react";
import type { LocationPickerController } from "./controller";
import { pickerText } from "./model";

export function PickerSearch({
  selected,
  onToggle,
  onToggleMany,
  locale,
  messages,
  query,
  setQuery,
  searchRef,
  placeMode,
  searching,
  statusId,
  state,
  toggleNearby,
  dismissError,
  turnOffNearby,
  resolved,
  rowRefs,
  visibleRows,
  visibleOffRows,
  nearbyOn,
  status,
}: Pick<
  LocationPickerController,
  | "selected"
  | "onToggle"
  | "onToggleMany"
  | "locale"
  | "messages"
  | "query"
  | "setQuery"
  | "searchRef"
  | "placeMode"
  | "searching"
  | "statusId"
  | "state"
  | "toggleNearby"
  | "dismissError"
  | "turnOffNearby"
  | "resolved"
  | "rowRefs"
  | "visibleRows"
  | "visibleOffRows"
  | "nearbyOn"
  | "status"
>) {
  return (
    <>
      <div className="relative shrink-0">
        {/* The mark tells the visitor which of the two the box
                      has just become, which nothing else on screen does
                      before the list moves under it. Two glyphs and not one
                      tinted glyph, because this is a change of subject, not
                      a change of state: the pin is the place the list is
                      sorting from, the magnifier is the text it is
                      filtering by. */}
        {placeMode ? (
          <MapPin
            data-picker-field-mode="place"
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground"
            aria-hidden
          />
        ) : (
          <Search
            data-picker-field-mode="name"
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        )}
        <Input
          ref={searchRef}
          // Not type="search". WebKit draws that type its own
          // clear button, and this field already carries one that
          // puts the focus back where the visitor left it; two
          // crosses in one box is one too many.
          type="text"
          // Both halves of what this takes are words, so the
          // plain keyboard is right even though half the answers
          // are four digits: a numeric pad cannot spell Maribor.
          // And no autofill, because the browser has nothing
          // stored that fits a box holding either a postcode or a
          // shelter's name; postal-code, which the place field
          // used to claim, would offer the visitor's own address
          // to a field that is as likely to want "Mala hiša".
          inputMode="text"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
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
            // The top row a key may act on: the first match that has
            // something to toggle. Both branches below mean the same
            // row, so it is found once.
            const first = visibleRows[0];
            if (event.key === "Enter") {
              event.preventDefault();
              // Only a unique name match can be committed from the
              // field. Ambiguous matches hand focus to the list.
              // A place already sorted the rows as it was typed.
              if (searching) {
                if (first && visibleRows.length + visibleOffRows.length === 1)
                  onToggle(first.value);
                else if (first) rowRefs.current.get(first.value)?.focus();
              } else {
                event.currentTarget.blur();
              }
              return;
            }
            // ArrowDown walks into the list, whichever mode put
            // the rows there.
            if (event.key === "ArrowDown" && first) {
              rowRefs.current.get(first.value)?.focus();
              event.preventDefault();
            }
            // Escape is the dialog's to hear first, so what it does in
            // this field is decided on DialogContent above.
          }}
          // The box holds one answer at a time, so coming back to it
          // means replacing, not appending. Selecting on focus makes
          // typing a new postcode over an old one just work.
          onFocus={(event) => event.currentTarget.select()}
          enterKeyHint="done"
          placeholder={messages.placeOrShelter}
          aria-label={messages.placeOrShelter}
          aria-describedby={state.status === "error" ? undefined : statusId}
          // 44px tall below lg, the same touch-target rule the rest of
          // this dialog's mobile chrome keeps; lg and up gets the
          // denser h-8 back. text-base below lg because iOS Safari
          // zooms the page whenever a focused input sets type under
          // 16px, and this dialog is a map: a zoom leaves it unaimable.
          className="h-11 pl-8 pr-8 text-base md:text-base lg:h-8 lg:text-sm"
        />
        {query !== "" && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            aria-label={messages.clearField}
            // The icon stays size-6, but below lg the button's own box
            // grows to the 44px touch target and re-centers on the same
            // spot the smaller icon sits at, so the field does not have
            // to widen for it.
            className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:text-foreground lg:size-6"
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
        className="mt-1 shrink-0 text-2xs leading-tight text-muted-foreground empty:hidden"
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
            aria-describedby={state.status === "error" ? statusId : undefined}
            className={cn(
              // max-lg:min-h-9 rather than the full 44px: this row sits
              // beside the Clear button and a full min-h-11 on both
              // would force the row itself taller than the layout
              // wants. 36px still clears the WCAG 2.5.8 minimum and
              // is a real improvement on the old py-0.5 (about 22px).
              "inline-flex w-fit items-center gap-1.5 rounded-ui py-0.5 text-xs transition-colors max-lg:min-h-9",
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

        {/* The way back to no shelter at all, and the only reset in the
                  dialog. Named for what it clears rather than with the bare
                  "Počisti" every other sheet in the site uses: this one sits
                  beside a search box and a place box that both have a clear of
                  their own, and the word alone did not say which of the three
                  it meant. Ghost weight, because live filtering means the
                  primary act is picking, not undoing it. */}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleMany(selected)}
            // Same max-lg:min-h-9 as the nearest-me toggle beside it.
            // px-2 and a hover surface give the press a body to land on,
            // so it reads as a button rather than a stray line of text.
            className="ml-auto inline-flex items-center rounded-ui px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:min-h-9"
          >
            {pickerText[locale].clearSelection} ({selected.length})
          </button>
        )}
      </div>
    </>
  );
}
