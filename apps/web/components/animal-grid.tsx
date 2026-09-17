"use client";

import { AnimalCard } from "@/components/animal-card";
import {
  AnimalFilters,
  TOOLBAR_BAND,
  TOOLBAR_ROW_HEIGHT,
} from "@/components/filters/animal-filters";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { useI18n } from "@/components/i18n-provider";
import { GridLoadMore } from "@/components/grid-load-more";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimalDialogHost } from "@/hooks/use-animal-dialog-host";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import { useNearbyOrigin } from "@/hooks/use-nearby-origin";
import type { ClientAnimal } from "@/lib/animal";
import { prefetchAnimalDescriptions } from "@/lib/animal-descriptions";
import {
  CARD_GRID,
  CARD_PHOTO_ASPECT,
  CARD_PHOTO_RADIUS,
  RESULTS_COLUMNS,
} from "@/lib/card-grid";
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
import { sheltersIndexPath } from "@/lib/shelter-path";
import { SKIP_LINK } from "@/lib/skip-link";
import { effectiveSort, sortAnimals } from "@/lib/sort";
import { cn } from "@/lib/utils";
import { PawPrint } from "lucide-react";
import dynamic from "next/dynamic";
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

// The dialog and everything under it: the photo fan, the lightbox, the share
// sheet, the shelter block and the dialog's own motion, which is the largest
// single thing this page used to load before anyone had asked for an animal.
// The grid, the filters and the cards need none of it to draw. Measured with
// scripts/measure-chunks.mjs: the home document asked for 397.3 KB of script
// gzipped with it imported and 373.7 KB with it fetched.
//
// ssr: false because there is nothing here to prerender. Which animal is open
// is an address, the export has no server to read one with
// (getServerLocationSnapshot in lib/location-search.ts returns "" and has to),
// and the component returns null until an animal is selected, so the server
// pass would emit the chunk's preload for markup that is empty either way.
//
// loading is null for the same reason the empty state has no skeletons: until
// an animal is chosen there is no surface here, and a placeholder over the
// grid would be a promise of a dialog nobody opened. What a visitor who did
// open one waits on is warmAnimalDialog below, not a fallback.
const AnimalDialog = dynamic(
  () =>
    import("@/components/animal-dialog/animal-dialog").then(
      (module) => module.AnimalDialog,
    ),
  { ssr: false, loading: () => null },
);

// Fetches the dialog's chunk on the first sign that a card is about to be
// opened, rather than on the click itself. It is the same import() the lazy
// component resolves from, so the module cache is already filled by the time
// the press lands and the dialog opens without a gap. Called on any pointer or
// focus reaching the grid, which is as early as intent can be read, and
// repeated calls cost nothing: a module is fetched once.
function warmAnimalDialog() {
  void import("@/components/animal-dialog/animal-dialog");
}

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

/** The touch line the empty state's buttons keep on a coarse pointer.
 *
 *  They are `size="sm"`, which is a mouse's height, and on a phone this state
 *  holds the only controls on screen. Grown rather than overlaid, and padded
 *  to match, for the reason globals.css states at the tap-target utility. The
 *  gate asks the pointer rather than the width, which is what the rest of the
 *  filter bar now does: a 1180px tablet is a thumb and a 1024px window is a
 *  mouse.
 */
const EMPTY_STATE_ACTION = COARSE_ACTION;

// The two states that say there is nothing here: no dataset at all, and no
// match for the current filter. They are one shape deliberately, because they
// are one message. Four pulsing skeletons used to stand under the first of
// them, and a skeleton is a promise that something is on its way, so on the one
// page where nothing is loading they pulsed forever under copy that already
// said as much.
function EmptyState({ children }: { children: ReactNode }) {
  return (
    // The floor is about the filter dock, not about the drawing. Below lg the
    // dock is on screen (animal-filters.tsx, lg:hidden) and it floats over the
    // page end; a filter that matches nothing leaves a block short enough that
    // the footer's nav row lands inside the dock's band, and a tap where
    // "Zavetišča" is drawn opens the filter sheet instead. Three fifths of the
    // viewport put the whole footer under the fold at scroll 0 on every phone
    // size measured, landscape included, so the band has nothing of it to
    // cover; half was not enough, it left the footer starting at 808 against a
    // band that ends at 828. Reaching the footer then means scrolling to the
    // page end, which is the case the footer's own docked padding is for, and
    // nothing here adds a second clearance.
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center max-lg:min-h-[60dvh]">
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
// (CARD_GRID): enough of the grid's shape to read as the grid. The block that
// holds them keeps a screenful of height whether or not the cards fill it,
// which is what the footer needs; the cards themselves only have to read as
// the grid.
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
function ResultsPending({ hasSidebar }: { hasSidebar: boolean }) {
  return (
    // A viewport of height, because the stand-in stands in for the document as
    // much as for the cards. Six cards are 613px of a 1321px document on a
    // phone, so the footer is on screen while the bundle lands and is then
    // pushed 714px down by a 9667px grid: one shift, 0.036, on every shared
    // filtered link. Holding a screenful keeps the footer below the fold until
    // the real results decide where it goes.
    <div
      data-slot={RESULTS_PENDING_SLOT}
      aria-hidden
      // The same two columns the block it stands in for draws, so the cards
      // arrive where the stand-in put them. It used to be a single full-width
      // column: at 1440 the six tiles were laid out across the whole 1216px
      // frame and hydration then moved the grid 256px to the right and
      // narrowed it to 960 to make room for the filter rail, which is a jump
      // of the entire page sideways on exactly the links people share.
      className={cn("min-h-[100dvh]", hasSidebar && RESULTS_COLUMNS)}
    >
      {/* The cards go in the second track and the rail's is left empty: what is
          promised here is where the animals will be, and an empty 224px is a
          truer promise than a grey panel about to become a list of controls.
          col-start rather than an empty element to hold the column open. */}
      <div className={cn("flex flex-col gap-4", hasSidebar && "lg:col-start-2")}>
        {/* The toolbar the hidden block also covers: the species tabs, the
            result count and the sort control are as unanswered as the cards.
            In the band the real bar draws, rule and all, and at the height its
            row states, both from animal-filters.tsx: that height is what
            decides where the first row of cards starts, and a bare 36px
            skeleton put them 21px above where they land. */}
        <div className={TOOLBAR_BAND}>
          <Skeleton className={cn("w-48", TOOLBAR_ROW_HEIGHT)} />
        </div>
        <div className={CARD_GRID}>
          {PENDING_CARDS.map((n) => (
            // The card's photo box, which at this size is most of the card,
            // with the same corners and the same shape, so the stand-in and
            // the cards that replace it claim the same height. Both come from
            // the constants the card itself uses rather than copies of them:
            // the corner was a copy until it was not, and the two literals sat
            // one step apart for a release with nothing to catch it.
            <Skeleton
              key={n}
              className={cn(CARD_PHOTO_ASPECT, CARD_PHOTO_RADIUS)}
            />
          ))}
        </div>
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
  // The order the cards are in, which is what the long-stay mark below asks
  // about. sortAnimals resolves the same thing for itself, so this reads it
  // from the one function that decides it rather than restating the fallback.
  const order = effectiveSort(sort, nearby?.at);

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

  // Whether the dialog is on the page at all. False until the first animal
  // opens, which is what keeps its chunk off the visit of anyone who only
  // reads the grid, and true from then on: the closing animation is drawn by
  // the dialog itself out of the animal it last held (lastAnimal in
  // animal-dialog.tsx), and a dialog taken off the page as the selection
  // clears would have nothing left to close with. Adjusted during render
  // rather than in an effect so a link that arrives with an animal already
  // named mounts it in the same pass it is read in, the way the dialog itself
  // tracks that animal.
  const [dialogMounted, setDialogMounted] = useState(false);
  if (selected && !dialogMounted) setDialogMounted(true);

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
    // The species is not part of what clears (use-animal-filters.ts), so it
    // is not part of what decides whether there is anything to take back.
    if (activeCount > 0) {
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

  // The species is put back as it is now, not as it was: the clear never
  // took it (use-animal-filters.ts), so a species pressed on the strip during
  // the window is a choice this undo has no business reverting.
  const handleUndo = useCallback(() => {
    if (!cleared) return;
    restore({ ...cleared, species: filters.species });
    setCleared(null);
  }, [cleared, filters.species, restore]);

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
      {!isEmpty && <ResultsPending hasSidebar={hasSidebar} />}
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
        // The rail and the grid beside it, from lib/card-grid.ts, which owns
        // the 14rem the photo bands are derived from and the minmax(0,...)
        // floor that keeps the column shrinkable. The stand-in above wears the
        // same string; what happens when the two disagree is written there.
        className={cn(hasSidebar && RESULTS_COLUMNS)}
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
            onSpeciesChange={setSpecies}
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
              {shelterOnlyEmpty && (
                <Button
                  variant="outline"
                  size="sm"
                  className={EMPTY_STATE_ACTION}
                  onClick={() => toggleMany("shelter", filters.shelter)}
                >
                  {messages.showFromAllShelters}
                </Button>
              )}
              {/* The one way out of this screen, drawn once. With pills above
                  it, it stands under the row and takes the clear that row
                  would otherwise have ended in. It is lg:hidden with them: the
                  pills are, because the sticky toolbar draws its own row there
                  with its own clear at the end of it, and this button goes
                  with them or a desktop would show two.

                  Without pills the state is a species tab with nothing in it,
                  which a deep link to a species the roster does not hold can
                  reach, and the only thing left to undo is the species. A
                  clear leaves the species standing (use-animal-filters.ts),
                  so what this offers there is the species' own way back,
                  worded as what it does. Nothing else on any width offers the
                  press, so it stays at every width. */}
              {chips.length === 0 && filters.species !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  className={EMPTY_STATE_ACTION}
                  onClick={() => setSpecies("all")}
                >
                  {messages.showAllSpecies}
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
              // Where the dialog's chunk is asked for. Capture rather than
              // bubble so it runs before the card's own handlers, and both a
              // pointer and a focus because the two ways into a card are a
              // press and a Tab. Neither opens anything on its own.
              onPointerDownCapture={warmAnimalDialog}
              onFocusCapture={warmAnimalDialog}
              className={CARD_GRID}
            >
              {page.map((animal, ordinal) => (
                <AnimalCard
                  key={animal.id}
                  animal={animal}
                  reference={reference}
                  // The order this list is actually in, which the card
                  // reads to decide whether the long-stay mark would be
                  // repeating it. The order the list is in and not the one
                  // picked: nearest with no origin is sorted as the default
                  // (effectiveSort).
                  order={order}
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
              {/* The sentinel the step watches, then the button that replaces
                  it once the budget is spent: grid-load-more.tsx, which the
                  shelter grid draws too. */}
              <GridLoadMore
                hasMore={hasMore}
                settled={settled}
                watchSentinel={watchSentinel}
                showMore={showMore}
                drawn={drawn}
                total={sorted.length}
              />
            </div>
          )}
          {/* The grid grows by an IntersectionObserver and a button, and both
              of them are this component's, so a browser that is not running
              our scripts gets the sixty cards the export wrote and no sign
              that the list goes on: the tab above says 486 and the page stops
              at 60. The register is the way through. A shelter's own page is a
              list of that shelter's animals, and for every shelter but the
              largest the whole of it is in the prerendered HTML.

              Drawn only where the export left something behind, which is what
              hasMore says on the server render: sixty cards drawn against the
              whole list. The browser does the rest, showing this to nobody who
              has scripting on. */}
          {hasMore && (
            <noscript>
              <p className="pt-4 text-center text-xs text-muted-foreground">
                {messages.needsScriptForFullList}
              </p>
              {/* The way there, on its own line rather than spliced into the
                  end of the sentence above: a link is a destination here, not
                  a word, and the sentences in this file are whole and
                  translated rather than assembled around one. */}
              <p className="pb-4 pt-1 text-center text-xs">
                <a href={sheltersIndexPath(locale)} className={SOURCE_LINK}>
                  {messages.shelters}
                </a>
              </p>
            </noscript>
          )}
          {/* Where the skip link lands: the end of the grid, whatever the grid
              currently holds. tabIndex so focus actually moves here rather than
              only scrolling the page. */}
          <div id="za-rezultati" tabIndex={-1} />
        </div>

        {dialogMounted && (
          <AnimalDialog
            animal={selected}
            logos={logos}
            origin={origin}
            siblingIds={shownIds}
            reference={reference}
            onNavigate={handleNavigate}
            onClose={close}
          />
        )}
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
import { COARSE_ACTION, SOURCE_LINK } from "@/lib/link-styles";
