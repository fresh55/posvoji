import { cn } from "@/lib/utils";
import { pickerText } from "./model";
import { PickerSearch } from "./picker-search";
import { PickerShelterList } from "./picker-shelter-list";
import type { LocationPickerController } from "./controller";

export function PickerDock({ controller }: { controller: LocationPickerController }) {
  const { sheetOpen, filterSummary, locale, missing } = controller;
  return (
          <div
            data-picker-sheet={sheetOpen ? "open" : "collapsed"}
            className={cn(
              "absolute inset-x-0 top-0 bottom-(--picker-footer-h) z-20 flex flex-col overflow-hidden bg-background",
              !sheetOpen && "picker-stacked:hidden",
              // Beside the map on a desktop and on a phone held sideways
              // (picker-split in globals.css). --picker-list-w: see view.tsx,
              // where the stage beside it reads the same value.
              "picker-split:inset-x-auto picker-split:right-0 picker-split:w-(--picker-list-w) picker-split:border-l",
            )}
          >
              <div
                data-picker-panel-content
                // short:py-2 keeps the whole column inside its box on a
                // landscape phone. Without it the surplus fell to this
                // scroller, and a finger on the search field dragged the panel
                // instead of the list, sliding the field under the header.
                className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 short:py-2"
              >
                {/* Only while a filter narrows the counts. With none, every
                    count is the whole shelter and there is nothing to explain;
                    the line used to say so anyway, in grey, on every visit. */}
                {filterSummary && (
                  <p data-picker-filter-context className="mb-3 shrink-0 text-xs leading-snug text-muted-foreground short:mb-1">
                    {pickerText[locale].countsMatch}: {filterSummary}
                  </p>
                )}
                <PickerSearch controller={controller} />
                <PickerShelterList controller={controller} />
                <p className="mt-3 shrink-0 text-xs leading-snug text-muted-foreground empty:hidden">
                  {missing}
                </p>
              </div>
          </div>
  );
}
