"use client";

import { AnimalCard } from "@/components/animal-card";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { AnimalFilters } from "@/components/filters/animal-filters";
import { FilterChips } from "@/components/filters/filter-chips";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimalDialogHost } from "@/hooks/use-animal-dialog-host";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import { useNearbyOrigin } from "@/hooks/use-nearby-origin";
import type { ClientAnimal } from "@/lib/animal";
import { prefetchAnimalDescriptions } from "@/lib/animal-descriptions";
import { CARD_GRID } from "@/lib/card-grid";
import {
  applyFilters,
  type FilterOption,
  type Filters,
  type SpeciesFilter,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import type { LookupEntry } from "@/lib/municipality-coverage";
import {
  PREHYDRATION_DATASET_KEY,
  RESULTS_PENDING_SLOT,
  RESULTS_SLOT,
} from "@/lib/prehydration-script";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { SKIP_LINK } from "@/lib/skip-link";
import { sortAnimals } from "@/lib/sort";
import { cn } from "@/lib/utils";
import { PawPrint } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CARDS_PER_CLICK } from "./grid-rendering";
import { useAnimalFilterModel } from "./use-animal-filter-model";
import { useIncrementalGrid } from "./use-incremental-grid";

// How long a cleared filter state can still be taken back. Long enough to
// read the row and reach for it, short enough that the offer is gone before
// it becomes part of the furniture.
export const UNDO_WINDOW_MS = 7000;

// When a browser with no requestIdleCallback fetches the shelter descriptions
// instead. Behind hydration and the first cards' photos, and well ahead of the
// time it takes anyone to pick a card and open it.
const DESCRIPTIONS_IDLE_MS = 2000;

// How many cards play the entrance animation. Roughly the first three rows at
// the widest layout, which is everything a visitor can see when the grid
// changes; the rest are below the fold and arrive settled.
const STAGGERED_CARDS = 12;

// Two columns is the narrowest the grid ever draws (CARD_GRID), so it is what
// an unmeasurable grid is charged for: a miss makes the step short rather than
// drawing rows nobody asked for.

// Which species-absence message key fills the {species} slot of the
// shelter-absence sentences below. Keyed by the species tab rather than
// spelled out inline, so a new species fails to compile here instead of
// silently falling back to the wrong noun form.
const SPECIES_ABSENCE_KEY: Record<SpeciesFilter, TranslationKey> = {
  all: "speciesAbsenceAll",
  dog: "speciesAbsenceDogs",
  cat: "speciesAbsenceCats",
  other: "speciesAbsenceOther",
};

// Which of the three shelter-absence sentences a selection takes. The verb
// agrees with how many shelters are selected and Slovenian counts a dual, so
// it is nima for one, nimata for two and nimajo from three up. Picked here
// rather than interpolated into one form that would be wrong for two of the
// three cases, the same way the region coverage line picks its own
// (coveredByLine in filters/shelter-map-region.tsx).
function shelterAbsenceKey(count: number): TranslationKey {
  if (count === 1) return "noResultsShelterSingular";
  if (count === 2) return "noResultsShelterDual";
  return "noResultsShelterPlural";
}

// The two states that say there is nothing here: no dataset at all, and no
// match for the current filter. They are one shape deliberately, because they
// are one message. Four pulsing skeletons used to stand under the first of
// them, and a skeleton is a promise that something is on its way, so on the one
// page where nothing is loading they pulsed forever under copy that already
// said as much.
function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <PawPrint
        className="size-8 text-muted-foreground/50"
        strokeWidth={1.5}
        aria-hidden
      />
      {children}
    </div>
  );
}

// Three rows on a phone's two columns and one and a half at the widest layout
// (CARD_GRID): enough of the grid's shape to read as the grid, and short of a
// screenful at any width, which is all a stand-in owes.
const PENDING_CARDS = [0, 1, 2, 3, 4, 5];

// What stands in the results block's place while a filtered link is still on
// the prerendered, unfiltered HTML. The rule in globals.css hides one of the
// two by the mark on <html>, so exactly one is ever in flow: the block while
// the page can answer the address, this while it cannot. Without it the whole
// of a shared /?vrsta=pes is blank until hydration lands, and blank for good if
// the bundle never does; the block covers the tabs, the count and the sort
// control as well as the cards.
//
// The empty state above dropped its skeletons because a skeleton is a promise
// that something is on its way, and there nothing is. Here something is: the
// bundle that will answer this address is already in flight, and the promise
// is kept within a second on an ordinary connection and by the timeout in
// prehydration-script.ts at worst. That is why this is the exception to that
// reasoning rather than a reversal of it.
//
// No words in it. It is aria-hidden because a screen reader is waiting on the
// same hydration and has nothing to read either way, and copy for a state that
// lasts a few hundred milliseconds would be a string in two locales that
// almost nobody is shown.
function ResultsPending() {
  return (
    <div
      data-slot={RESULTS_PENDING_SLOT}
      aria-hidden
      className="flex flex-col gap-4"
    >
      {/* The toolbar the hidden block also covers: the species tabs, the
          result count and the sort control are as unanswered as the cards. */}
      <Skeleton className="h-9 w-48" />
      <div className={CARD_GRID}>
        {PENDING_CARDS.map((n) => (
          // The card's photo box, which at this size is most of the card
          // (PHOTO_FRAME in animal-card.tsx), with the same corners.
          <Skeleton key={n} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function AnimalGrid({
  animals,
  logos,
  referenceDate,
  municipalities,
  offSiteShelters,
}: {
  animals: ClientAnimal[];
  logos: ShelterLogos;
  /** When the dataset was built. Ages are measured from it rather than from
      the clock, so the prerendered HTML and the hydrated page agree. */
  referenceDate: string;
  /** Municipality → responsible-shelter entries for the shelter dialog's
   *  "found an animal" mode. Built on the server from data/. */
  municipalities?: LookupEntry[];
  /** Registry shelters with no animals on the site, drawn inert in the
   *  location picker's map and list. */
  offSiteShelters?: FilterOption[];
}) {
  const { locale, messages, t } = useI18n();
  // The filter state a clear took away, while the row still offers it back.
  const [cleared, setCleared] = useState<Filters | null>(null);
  const {
    filters,
    sort,
    setSpecies,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    toggleGoodWith,
    toggleManyGoodWith,
    toggleHome,
    toggleManyHome,
    toggleCare,
    toggleManyCare,
    setSort,
    clearAll,
    restore,
    activeCount,
  } = useAnimalFilters();

  // The one clock on this page, and deliberately not the visitor's. Everything
  // below measures the dataset against it: which age bucket an animal falls in,
  // how the youngest and oldest orders come out, and how long the longest wait
  // at a shelter has been. The clock was used for the first three and the
  // dataset's own date for what the card and the dialog then printed, so the
  // filter and the words under the photo were answering from two different
  // days. Prerendering makes it worse than a rounding error: the HTML is built
  // with the build machine's clock and hydrated with the visitor's, so the two
  // renders could bucket an animal differently. Ages here are a property of
  // the export, so they are read off the export.
  const reference = useMemo(() => new Date(referenceDate), [referenceDate]);
  const visible = useMemo(
    () => applyFilters(animals, filters, reference),
    [animals, filters, reference],
  );
  // Where Najbližje measures from, granted by the location picker's nearby
  // control and by nothing else. Null on the server and on the first client
  // render, which is what makes the option's absence in the sort picker and the
  // fallback here agree without either having to ask the other: with no origin
  // sortAnimals puts the list in the default order (effectiveSort), including
  // for a shared link that arrived carrying ?razvrsti=najblizje.
  const nearby = useNearbyOrigin();
  const sorted = useMemo(
    () => sortAnimals(visible, sort, locale, reference, nearby?.at),
    [visible, sort, locale, reference, nearby],
  );

  // What the dialog steps through is what the visitor is looking at: the list
  // as filtered and sorted on screen, in that order. Read here, above the
  // chunking, because the step below is one of the things that asks whether a
  // dialog is open.
  const { selected, origin, shownIds, handleOpen, handleNavigate, close } =
    useAnimalDialogHost({
      animals,
      shown: sorted,
      basePath: locale === "sl" ? "/" : "/en",
    });

  const { page, drawn, hasMore, settled, gridRef, watchSentinel, showMore } =
    useIncrementalGrid(sorted, selected !== undefined);

  // A static export has no server to read the query with, so the prerendered
  // HTML every filtered link lands on is the unfiltered grid, and it stands
  // there until hydration replaces it. The layout's inline script marks such a
  // link on <html> before any of it paints; this is the other half, and it runs
  // after the first client render, which is the first one that answers the
  // address it was opened at.
  useEffect(() => {
    delete document.documentElement.dataset[PREHYDRATION_DATASET_KEY];
  }, []);

  // The shelter descriptions no longer travel with the animals (see
  // animalsForClient in lib/dataset.ts and lib/animal-descriptions.ts), so the
  // first dialog that wants one would open and wait. Idle time once the grid
  // is on screen costs nothing, and the file usually lands long before anyone
  // opens a card. It waits for idle rather than going in the document head
  // because the visitor who opens no card at all is who the saving is for.
  useEffect(() => {
    if (animals.length === 0) return;
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => {
        void prefetchAnimalDescriptions();
      });
      return () => window.cancelIdleCallback(handle);
    }
    // Safari has no requestIdleCallback. A plain timer, set late enough to be
    // behind hydration and the first cards' photos.
    const timer = window.setTimeout(() => {
      void prefetchAnimalDescriptions();
    }, DESCRIPTIONS_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [animals.length]);

  const isEmpty = animals.length === 0;

  // Reachable zero state: every other facet is pre-guarded by isDeadOption
  // disabling, so a filtered-to-zero result in practice means a shelter
  // selection with none of the active species. Only worth a second full
  // applyFilters pass (with the shelter group dropped, the same way the rest
  // of the file measures facets) when the list is actually empty and a
  // shelter is actually selected — otherwise this short-circuits and the
  // normal case (a shelter picked, some animals showing) never pays for it.
  const shelterOnlyEmpty = useMemo(
    () =>
      visible.length === 0 &&
      filters.shelter.length > 0 &&
      applyFilters(animals, { ...filters, shelter: [] }, reference).length > 0,
    [animals, filters, reference, visible.length],
  );

  const handleClearAll = useCallback(() => {
    if (activeCount > 0 || filters.species !== "all") {
      // Held for as long as the row offers the way back, and only that long.
      // A snapshot with no offer beside it is a trap: nothing on screen would
      // say it existed.
      setCleared(filters);
    }
    clearAll();
  }, [activeCount, clearAll, filters]);

  // Every other filter action undoes itself by being repeated. This one
  // cannot, so the row keeps a way back for a few seconds, and then drops it.
  //
  // Time is the only thing that ends the offer. Picking a filter during the
  // window hides it without cancelling it, because the row shows the offer
  // only where the chips would be and chips win that space (filter-chips.tsx).
  // Undoing after that still restores the state that was cleared, which is
  // what the words promise, so there is nothing to guard against.
  useEffect(() => {
    if (!cleared) return;
    const timer = window.setTimeout(() => setCleared(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [cleared]);

  const handleUndo = useCallback(() => {
    if (!cleared) return;
    restore(cleared);
    setCleared(null);
  }, [cleared, restore]);

  const {
    speciesRoster,
    speciesTally,
    shelterSummaries,
    counts,
    groups,
    shelters,
    toggles,
    toggleTally,
    goodWith,
    home,
    care,
    chips,
    hasSidebar,
  } = useAnimalFilterModel({
    animals,
    logos,
    reference,
    locale,
    resultCount: visible.length,
    actions: {
      filters,
      toggle,
      toggleProperty,
      toggleGoodWith,
      toggleManyGoodWith,
      toggleHome,
      toggleManyHome,
      toggleCare,
      toggleManyCare,
    },
  });

  return (
    <>
      {/* A sibling of the block it stands in for and not a child of it: the
          rule hides that whole block, so anything inside it goes down with it.
          Not drawn on an empty dataset, where the six cards would be a promise
          of animals that are not coming (EmptyState above). */}
      {!isEmpty && <ResultsPending />}
      <section
        aria-labelledby="rezultati"
        // What the pre-hydration rule in globals.css hides while a filtered link
        // is still showing the prerendered, unfiltered page. The whole block and
        // not the grid alone: the toolbar above the cards carries the result
        // count and the tab tallies, and those are as unfiltered as the cards are.
        data-slot={RESULTS_SLOT}
        // No bottom clearance of its own. The section used to carry
        // pb-[calc(6.5rem+env(safe-area-inset-bottom))] below lg so the mobile
        // filter dock could not sit on the last row of cards, from the days
        // when the grid was what ended the document. The footer ends it now and
        // clears the dock itself (its docked prop, site-footer.tsx), and the
        // footer block is taller than the dock's band, so the grid's clearance
        // only stacked a second, empty one on top - a hole between the
        // load-more count and the footer the height of both.
        className={cn(
          hasSidebar &&
            "lg:grid lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-column-gap",
        )}
      >
        {/* The page went from its h1 straight to one h3 per card, so there was
            nothing between the top of the document and the results to navigate
            by and nothing for a skip link to aim at. Every animal on the page
            sits below this, and the whole grid is one tab stop per card, so
            without a way past it a keyboard cannot reach the footer at all. */}
        <h2 id="rezultati" className="sr-only">
          {messages.resultsHeading}
        </h2>
        <a
          href="#za-rezultati"
          className={SKIP_LINK}
        >
          {messages.skipResults}
        </a>
        {hasSidebar && (
          <FilterSidebar
            onClearAll={handleClearAll}
            // lg:bg-background is load-bearing, not decoration. lg:sticky
            // puts the sidebar on its own compositing layer, and Chrome
            // keeps subpixel text antialiasing on such a layer only while
            // it has a fully opaque background colour. Transparent, every
            // label in here renders greyscale while the rest of the page
            // does not, which reads as blur at the same size.
            //
            // lg:top-0 with a padding of its own and not an inset: the toolbar
            // across the gutter pins at top-0 and holds its species tabs down
            // inside its own padding (animal-filters.tsx). Pinning the aside to
            // the same edge and carrying the same amount inside it is what puts
            // the panel head on the tabs' line in both states. An inset moved
            // the head 12px below the tabs once the two stuck. The padding is
            // inside the scroll box, so it scrolls away with the head and the
            // fade mask still starts at the aside's own top edge.
            //
            // Both read --rail-pad, which is where that amount is written and
            // why the two cannot drift apart again (globals.css). The height
            // spends it twice, so the rail leaves the same gap at the bottom of
            // the viewport that it takes at the top.
            className="hidden lg:sticky lg:top-0 lg:block lg:max-h-[calc(100dvh-var(--rail-pad)*2)] lg:overflow-x-hidden lg:overflow-y-auto lg:bg-background lg:pt-rail-pad"
            filters={filters}
            groups={groups}
            counts={counts}
            toggles={toggles}
            toggleTally={toggleTally}
            goodWith={goodWith}
            home={home}
            care={care}
            scope={
              shelters && {
                options: shelters,
                counts: counts.shelter,
                municipalities,
                offSite: offSiteShelters,
                summaries: shelterSummaries,
                resultCount: visible.length,
              }
            }
            onToggle={toggle}
            onToggleMany={toggleMany}
            onToggleProperty={toggleProperty}
            onToggleManyProperties={toggleManyProperties}
          />
        )}

        <div className="flex flex-col gap-4">
          <AnimalFilters
            isEmpty={isEmpty}
            hasSidebar={hasSidebar}
            filters={filters}
            speciesTally={speciesTally}
            speciesRoster={speciesRoster}
            groups={groups}
            counts={counts}
            toggles={toggles}
            toggleTally={toggleTally}
            goodWith={goodWith}
            home={home}
            care={care}
            shelters={shelters}
            shelterTally={counts.shelter}
            municipalities={municipalities}
            offSiteShelters={offSiteShelters}
            shelterSummaries={shelterSummaries}
            chips={chips}
            undo={cleared ? handleUndo : undefined}
            resultCount={visible.length}
            sort={sort}
            onSpeciesChange={setSpecies}
            onToggle={toggle}
            onToggleMany={toggleMany}
            onToggleProperty={toggleProperty}
            onToggleManyProperties={toggleManyProperties}
            onClearAll={handleClearAll}
            onSortChange={setSort}
          />

          {isEmpty ? (
            <EmptyState>
              <p className="text-sm text-muted-foreground">
                {messages.animalsComingSoon}
              </p>
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {shelterOnlyEmpty
                    ? t(shelterAbsenceKey(filters.shelter.length), {
                        species: t(SPECIES_ABSENCE_KEY[filters.species]),
                      })
                    : messages.noResults}
                </p>
                {!shelterOnlyEmpty && (
                  <p className="text-sm text-muted-foreground">
                    {messages.tryFewerFilters}
                  </p>
                )}
              </div>
              {/* Below lg only, where the sticky bar no longer carries a chips
                  row. This is the one state that row was genuinely needed for:
                  with nothing matching, "try fewer filters" is advice and not a
                  way out, and a visitor facing five active filters has no means
                  of telling which of them is the one to drop. The row's stuck
                  mode names it (filter-chips.tsx). Here it costs nothing that
                  matters, because there is no grid underneath for it to push
                  down and nothing to scroll it past. */}
              {chips.length > 0 && (
                <FilterChips
                  chips={chips}
                  onClearAll={handleClearAll}
                  stuck
                  className="max-w-full justify-center lg:hidden"
                />
              )}
              {shelterOnlyEmpty && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleMany("shelter", filters.shelter)}
                >
                  {messages.showFromAllShelters}
                </Button>
              )}
              {/* Only when no chips row can carry the clear. Every chips row
                  already ends in "Počisti vse", the row above renders below lg
                  whenever there are chips, and at lg the sticky toolbar's own
                  row does (animal-filters.tsx), with the sidebar header carrying
                  a third copy. That put two clear-all controls under each other
                  on a phone and three on one desktop screen, all calling this.
                  Chips are only absent when the state is a species tab with
                  nothing in it, and then this button is the only way out.

                  Which also settles how it is drawn. It used to go quiet beside
                  the shelter button above, and the two can no longer share a
                  screen: a picked shelter is a chip, and a chip takes this
                  button off the page. */}
              {chips.length === 0 && (
                <Button variant="outline" size="sm" onClick={handleClearAll}>
                  {messages.clearFilters}
                </Button>
              )}
            </EmptyState>
          ) : (
            <div
              ref={gridRef}
              // The same rule the sentinel below is marked by: what the step
              // measures its columns off is this element, and a test that found
              // it by its classes would be reading layout as contract. Appending
              // one class to CARD_GRID would have quietly cost the tests their
              // column count and left them charging the two-column fallback.
              data-card-grid
              className={CARD_GRID}
            >
              {page.map((animal, ordinal) => (
                <AnimalCard
                  key={animal.id}
                  animal={animal}
                  reference={reference}
                  // The entrance: a short fade and rise, staggered across the
                  // first dozen cards so a filter change reads as the grid
                  // answering rather than the page blinking. Keyed by id, so a
                  // card that survives the filter keeps its DOM node and does
                  // not re-run this; only arriving cards do. fill-mode-backwards
                  // holds a delayed card invisible until its turn.
                  //
                  // The first dozen and no further. Vse used to render all 503
                  // matches at once, so animating every one of them started 503
                  // compositor animations inside a 330ms window, during
                  // hydration, while 500 images were decoding. The cap outlives
                  // the chunking above: ordinal counts within the whole sorted
                  // list, so a card arriving with a later step is past it by
                  // definition and arrives settled, which is what a card nobody
                  // asked to see should do.
                  //
                  // card-paint is the other half of the same problem: what is
                  // drawn is now bounded, and this bounds what is painted, so a
                  // card scrolled past costs nothing until it comes back.
                  className={cn(
                    "card-paint",
                    ordinal < STAGGERED_CARDS &&
                      "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-300 motion-reduce:animate-none",
                  )}
                  style={
                    ordinal < STAGGERED_CARDS
                      ? { animationDelay: `${ordinal * 30}ms` }
                      : undefined
                  }
                  // The tab already named the species, so the card's one fact
                  // line does not have to spend itself saying it again.
                  species={filters.species}
                  // The first row, which is the largest image on the screen and
                  // was queueing behind the bundle like the other 499.
                  eager={ordinal < 4}
                  onOpen={handleOpen}
                  // A shelter's own page renders these same cards and leaves
                  // this off, because there the line would be the page linking
                  // to itself under every animal on it.
                  showShelter
                />
              ))}
              {/* Nothing to read and nothing to press: it exists so the observer
                  has something to watch, and it says so rather than adding a
                  nameless row to the grid a screen reader has to walk past. */}
              {hasMore && !settled && (
                <div
                  ref={watchSentinel}
                  aria-hidden
                  // The e2e suite's own hook, alongside every other data-*
                  // selector in this app: nothing here to find by role or
                  // text, so a class name would otherwise be the only handle,
                  // and this element's classes are layout and not contract.
                  data-grid-sentinel
                  className="col-span-full h-px"
                />
              )}
              {/* What replaces the sentinel once the budget is spent. The count
                  under the button is the transparency the sentinel never owed
                  anyone: how much of the list is on the page, and how much a
                  press still stands between the reader and the footer. */}
              {hasMore && settled && (
                <div className="col-span-full flex flex-col items-center gap-2 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={showMore}
                    // Real height below lg, not a tap-target overlay: this is
                    // the one control at the bottom of the list, and h-8 is
                    // short of what a thumb needs.
                    className="max-lg:min-h-11 max-lg:px-4"
                  >
                    {t("showMoreAnimals", {
                      n: Math.min(CARDS_PER_CLICK, sorted.length - drawn),
                    })}
                  </Button>
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {t("shownOfTotal", {
                      shown: page.length,
                      total: sorted.length,
                    })}
                  </p>
                </div>
              )}
            </div>
          )}
          {/* Where the skip link lands: the end of the grid, whatever the grid
              currently holds. tabIndex so focus actually moves here rather than
              only scrolling the page. */}
          <div id="za-rezultati" tabIndex={-1} />
        </div>

        <AnimalDialog
          animal={selected}
          logos={logos}
          origin={origin}
          siblingIds={shownIds}
          reference={reference}
          onNavigate={handleNavigate}
          onClose={close}
        />
      </section>
    </>
  );
}
export {
  CARDS_PER_CLICK,
  INITIAL_CARDS,
  ROWS_PER_STEP,
  ROWS_PER_STEP_BEHIND_DIALOG,
  TARGET_ROWS,
} from "./grid-rendering";
