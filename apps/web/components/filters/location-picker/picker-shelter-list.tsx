import { ShelterRows } from "@/components/filters/shelter-rows";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { filteredAnimalCount } from "@/lib/labels";
import { ChevronRight } from "lucide-react";
import type { LocationPickerController } from "./controller";

export function PickerShelterList({
  counts,
  selected,
  onToggle,
  summaries,
  locale,
  messages,
  t,
  query,
  setQuery,
  expandedShelter,
  offGroupOpen,
  setOffGroupOpen,
  listRef,
  searchRef,
  offGroupId,
  rowRefs,
  setHoveredRowValue,
  hoveredMarkerValues,
  hoverScrollTo,
  toggleExpandedShelter,
  visibleRows,
  visibleOffRows,
  detailBase,
  offGroupHeading,
}: Pick<
  LocationPickerController,
  | "counts"
  | "selected"
  | "onToggle"
  | "summaries"
  | "locale"
  | "messages"
  | "t"
  | "query"
  | "setQuery"
  | "expandedShelter"
  | "offGroupOpen"
  | "setOffGroupOpen"
  | "listRef"
  | "searchRef"
  | "offGroupId"
  | "rowRefs"
  | "setHoveredRowValue"
  | "hoveredMarkerValues"
  | "hoverScrollTo"
  | "toggleExpandedShelter"
  | "visibleRows"
  | "visibleOffRows"
  | "detailBase"
  | "offGroupHeading"
>) {
  const offGroupList = (
    <ShelterRows
      rows={visibleOffRows.map((row) => ({
        value: row.value,
        label: row.label,
        city: row.city,
        km: row.km,
        href: `${detailBase}/${row.value}`,
      }))}
      highlighted={hoveredMarkerValues ?? undefined}
      scrollTo={hoverScrollTo}
      onHoverRow={setHoveredRowValue}
      lessThanOneKm={messages.lessThanOneKm}
      labelledBy={offGroupId}
      className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
    />
  );
  return (
    <div
      ref={listRef}
      // fade-scroll rather than a scrollbar. The group of
      // shelters with nothing listed sits below the fold at
      // every height this panel takes, so the list always has
      // more under it than it shows, and a bare overflow-y-auto
      // left that to a scrollbar the platform may draw as
      // nothing at all until it is scrolled. The mask says it
      // without taking a gutter, which is also why pr-1 goes:
      // it was insetting the rows off a scrollbar that is no
      // longer drawn.
      className="fade-scroll mt-2 min-h-0 flex-1 overflow-y-auto max-lg:min-h-20"
    >
      {visibleRows.length === 0 && visibleOffRows.length === 0 ? (
        // The one state in this panel that had a bare
        // underline for a control. Centred in the space the
        // list is not using, with the reset as a real button:
        // an empty list is the one moment the panel has room
        // to spare, and the way out of it should look like
        // something to press.
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {messages.noSheltersFound} »{query.trim()}«
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            // size-sm draws 32px, and this is the only way out
            // of a list with nothing in it: the one control on
            // screen at that moment is the one that can least
            // afford to be missed by a thumb. The dialog's own
            // lg gate, as everywhere else here.
            className="max-lg:min-h-11"
          >
            {messages.clearSearch}
          </Button>
        </div>
      ) : (
        <>
          <ShelterRows
            rows={visibleRows}
            counts={counts}
            selected={selected}
            // The parent's own toggle, unwrapped: a row click is a
            // selection and nothing more, exactly like a marker click.
            onToggle={onToggle}
            // What a shelter is, for the one shelter being asked
            // about. Only the live list needs them: an off-site row
            // leads to that shelter's own page, which is where its
            // details already are.
            summaries={summaries}
            // Asking about a shelter without touching what is picked.
            // The row itself cannot carry this: it reports
            // aria-pressed, so its click has to toggle, and a picked
            // shelter could never be asked about from its own row. The
            // two verbs stay apart in both directions, so this handler
            // goes nowhere near onToggle and onToggle goes nowhere
            // near this.
            //
            // One shelter at a time, decided here because the rows see
            // one row each and this sees the list.
            expanded={expandedShelter}
            onToggleExpanded={toggleExpandedShelter}
            // The words, from here, because the rows take every word
            // they show as a prop. Two names for one control, one per
            // state, and each tooltip's string sits inside the
            // accessible name that adds the shelter to it (WCAG 2.5.3).
            infoLabel={(rowLabel) =>
              t("showShelterDetails", { label: rowLabel })
            }
            hideInfoLabel={(rowLabel) =>
              t("hideShelterDetailsFor", { label: rowLabel })
            }
            infoText={messages.showShelterDetailsShort}
            hideInfoText={messages.hideShelterDetails}
            refs={rowRefs}
            highlighted={hoveredMarkerValues ?? undefined}
            scrollTo={hoverScrollTo}
            onHoverRow={setHoveredRowValue}
            onExitTop={() => searchRef.current?.focus()}
            lessThanOneKm={messages.lessThanOneKm}
            // What the count pill is counting, said only to a
            // screen reader: the digits are the row's own mark
            // and the noun beside "· 113 km" is what stopped
            // two numbers in one row from reading alike.
            countLabel={(count) => filteredAnimalCount(count, locale)}
            waitLabel={(duration) =>
              locale === "sl"
                ? `Najdlje čaka: ${duration}`
                : `Longest wait: ${duration}`
            }
            // Two columns from sm up to lg, one column from lg: the
            // single column is the narrow panel's shape, and the panel
            // only exists from lg now. In the sheet the list has the
            // width of the screen and two columns is what fits it.
            className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
          />

          {/* Registry shelters without animals, under their own
                  heading so the zeroes read as "not here yet" rather
                  than as empty search results. There is nothing to
                  filter by, but there is a page for each of them, so
                  the rows are links out rather than dead toggles:
                  ShelterRows renders a row with an href as an <a>
                  instead of a toggle button, so the two lists share
                  their layout, their columns and their map-hover
                  scroll echo instead of one copying the other by hand. */}
          {visibleOffRows.length > 0 &&
            (visibleRows.length === 0 ? (
              // Nothing live left for the query, so this group
              // is not a group, it is the answer. No trigger: a
              // control that cannot be closed without hiding
              // the only rows on screen is a dead control, and
              // a fold over the sole match reads as "not
              // found" on a list that found it.
              //
              // Swapping the trigger for a paragraph unmounts a
              // focusable element, which would drop focus to
              // the body if it held it. It cannot here: the
              // only thing that moves visibleRows is the query,
              // and the query only moves while focus is in the
              // search box.
              <div className="mt-3">
                <p
                  id={offGroupId}
                  className="px-2 pb-1 text-2xs font-medium text-muted-foreground"
                >
                  {offGroupHeading}
                </p>
                {offGroupList}
              </div>
            ) : (
              <Collapsible
                open={offGroupOpen}
                onOpenChange={setOffGroupOpen}
                className="mt-3"
              >
                {/* The chevron turns off the trigger's own
                        data-state, which Radix writes and the repo's
                        data-open variant matches, so the open state has one
                        home rather than a copy handed down as a prop. */}
                <CollapsibleTrigger
                  id={offGroupId}
                  className="group flex w-full items-center gap-1 rounded-ui px-2 py-1 text-left text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] max-lg:min-h-9"
                >
                  <ChevronRight
                    className="size-3 shrink-0 transition-transform group-data-open:rotate-90 motion-reduce:transition-none"
                    aria-hidden
                  />
                  {offGroupHeading}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1">
                  {offGroupList}
                </CollapsibleContent>
              </Collapsible>
            ))}
        </>
      )}
    </div>
  );
}
