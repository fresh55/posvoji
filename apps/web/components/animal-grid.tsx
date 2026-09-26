"use client";

import { AnimalCard } from "@/components/animal-card";
import {
  AnimalFilters,
  TOOLBAR_BAND,
  TOOLBAR_ROW_HEIGHT,
} from "@/components/filters/animal-filters";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { useI18n } from "@/components/i18n-context";
import { GridLoadMore } from "@/components/grid-load-more";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimalDialogHost } from "@/hooks/use-animal-dialog-host";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import { useAnimalSearch } from "@/hooks/use-animal-search";
import { useNewListingCount, useVisitRead } from "@/hooks/use-last-visit";
import { useNearbyOrigin } from "@/hooks/use-nearby-origin";
import { NewListingsNotice } from "@/components/new-listings-notice";
import { NEW_LISTINGS_DATASET_KEY, NEW_LISTINGS_SLOT } from "@/lib/last-visit";
import type { ClientAnimal } from "@/lib/animal";
import { prefetchAnimalDescriptions } from "@/lib/animal-descriptions";
import {
  CARD_GRID,
  CARD_PHOTO_ASPECT,
  CARD_PHOTO_RADIUS,
  RESULTS_COLUMNS,
  RESULTS_GRID_TRACK,
  RESULTS_RAIL_TRACK,
} from "@/lib/card-grid";
import {
  applyFilters,
  thinnestAnswer,
  type Coverage,
  type FilterOption,
  type Filters,
  type GoodWithKey,
  type MultiGroup,
  type SpeciesFilter,
  type ToggleKey,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import { COARSE_ACTION, SOURCE_LINK } from "@/lib/link-styles";
import { getSearchSnapshot } from "@/lib/location-search";
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
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BandDivider,
  BandOffer,
  BandShowButton,
  withBandDivider,
} from "./unanswered-band";
import { useAnimalFilterModel } from "./use-animal-filter-model";
import { useIncrementalGrid } from "./use-incremental-grid";
import { useUnansweredBand } from "./use-unanswered-band";

// Load the dialog separately from the grid. The static export has no open
// animal, so skip SSR and render no placeholder. The idle mount below prepares
// the dialog before a click to avoid the Suspense fallback delay.
const AnimalDialog = dynamic(
  () =>
    import("@/components/animal-dialog/animal-dialog").then(
      (module) => module.AnimalDialog,
    ),
  { ssr: false, loading: () => null },
);

// Time available to undo clearing filters.
export const UNDO_WINDOW_MS = 7000;

// When a browser with no requestIdleCallback does the idle work below
// instead. Behind hydration and the first cards' photos, and well ahead of
// the time it takes anyone to pick a card and open it.
const IDLE_FALLBACK_MS = 2000;

// How many cards play an entrance animation at all. Roughly the first three
// rows at the widest layout, which is everything a visitor can see when the
// grid changes; the rest are below the fold and arrive settled.
const STAGGERED_CARDS = 12;

// Their delays, written once. As an object built in the render, each of the
// twelve was a new prop on every render of this grid, which is a card that
// cannot be skipped however little has changed about it: the card is memoised
// (animal-card.tsx) and this is the one prop that would defeat it, on the
// twelve cards at the top of the page. Only CARD_ENTRANCE reads this; a
// widening gives every one of the twelve the same instant, see CARD_SETTLE.
const STAGGER_STYLE = Array.from({ length: STAGGERED_CARDS }, (_, ordinal) => ({
  animationDelay: `${ordinal * 30}ms`,
}));

// The ordinary arrival: a fade from nothing, risen from below and staggered by
// STAGGER_STYLE, so a filter narrowing to a smaller list reads as the grid
// answering one card after another. Also what plays on the very first paint
// of a page that already carries a filter: the grid coming alive on load is
// meant.
const CARD_ENTRANCE =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-300 motion-reduce:animate-none";

// The widening arrival: unpick, clear or "Pokaži vse vrste" all put a card
// back that was on screen a moment ago and got filtered out, not a card
// arriving for the first time. CARD_ENTRANCE held such a card at opacity 0
// for its stagger delay plus its own fade, up to about 530ms at worst, next
// to the survivors it never touched, and a phone read that patchwork as an
// almost blank grid at 82ms. No card may sit invisible
// after a widening, so this drops the fade and the per-card wait entirely:
// every card lands at once, opaque throughout, and only a small rise says the
// grid just settled rather than stood still.
const CARD_SETTLE =
  "animate-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none";

/** A card's place in the entrance stagger: its place in the list, or in the
 *  band for a card of the band, which arrives at a press of its own and plays
 *  the same entrance from its own first card. */
function arrivalOrdinal(ordinal: number, bandStart: number | undefined): number {
  return bandStart !== undefined && ordinal >= bandStart
    ? ordinal - bandStart
    : ordinal;
}

// Two columns is the narrowest the grid draws at normal text size (CARD_GRID),
// so it is what an unmeasurable grid is charged for: a miss makes the step
// short rather than drawing rows nobody asked for. At 200% text a phone draws
// one column, and there the same miss draws twice the rows.

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

// The question the empty state names when a thin answer is the likeliest
// reason nothing matched (thinnestAnswer in lib/filters). Keyed by facet so
// a new one fails to compile here rather than going unexplained. Only the
// toggles the panel still offers can be answered, so only they have words.
const GROUP_TOPIC_KEY: Record<Exclude<MultiGroup, "shelter">, TranslationKey> = {
  sex: "knownTopicSex",
  age: "knownTopicAge",
  size: "knownTopicSize",
  energy: "knownTopicEnergy",
  coatColor: "knownTopicCoatColor",
  coatLength: "knownTopicCoatLength",
  waiting: "knownTopicWaiting",
};

const GOOD_WITH_TOPIC_KEY: Record<GoodWithKey, TranslationKey> = {
  kids: "knownTopicKids",
  dogs: "knownTopicDogs",
  cats: "knownTopicCats",
};

const TOGGLE_TOPIC_KEY: Partial<Record<ToggleKey, TranslationKey>> = {
  "brez-fiv": "knownTopicFiv",
  "brez-felv": "knownTopicFelv",
};

function topicKey(coverage: Coverage): TranslationKey | undefined {
  switch (coverage.facet) {
    case "goodWith":
      return GOOD_WITH_TOPIC_KEY[coverage.key];
    case "toggles":
      return TOGGLE_TOPIC_KEY[coverage.key];
    default:
      return GROUP_TOPIC_KEY[coverage.facet];
  }
}

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
    // The floor and both of the insets below lg are about the filter dock,
    // not about the drawing. The dock is on screen there (animal-filters.tsx,
    // lg:hidden) and it floats over the page end, and this is the shortest
    // page the site draws, so everything in it comes to rest in the dock's
    // band unless it is told not to.
    //
    // The floor is the footer's half of that. A filter matching nothing left a
    // block short enough that the footer's nav row was drawn inside the band,
    // and a tap where "Zavetisca" is drawn opened the filter sheet instead.
    // Three fifths of the viewport put the whole footer under the fold at
    // scroll 0 on every phone size measured, landscape included, so the band
    // has nothing of it to cover; half was not enough, it left the footer
    // starting at 808 against a band that ends at 828. Reaching the footer
    // then means scrolling to the page end, which is the case the footer's own
    // docked padding is for, and nothing here adds a second clearance.
    //
    // The floor is height and not spacing, though, and two separate
    // measurements asked for the same answer to that. Centring in it put the
    // message in the middle of the height: at 375px with two lines of pills
    // above the grid, "Ni zadetkov" started 260px under the row that names the
    // filter to drop (animal-filters.tsx), and the advice under it 284px, when
    // advice reads against the thing it is advice about. Centring also put the
    // block's buttons at the bottom of a screenful, where the dock is: at
    // 375x667 "Pocisti filtre" sat 44px under it, entirely hidden, at 320x568
    // the primary button was fully covered, and at 844x390 all three actions
    // were below the fold.
    //
    // So below lg the block starts at the top of its floor and keeps the
    // dock's own clearance free at the bottom. That distance is
    // --back-to-top-bottom, the same token the button in the corner and the
    // footer's run-off are measured with, because it is the same dock being
    // cleared and a literal here would be a third copy of it (globals.css).
    // From lg the floor lifts with the dock and the box is its content again,
    // so the centring left standing there has no spare height to spend.
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center max-lg:min-h-[60dvh] max-lg:justify-start max-lg:pt-6 max-lg:pb-(--back-to-top-bottom)">
      {/* Decoration, and the first thing to go where the room is needed: it
          is aria-hidden, it says nothing the sentence under it does not, and
          the 32px plus the gap it takes is what put the actions inside the
          dock's band at 320 and 360. Drawn from lg, where the state has a
          screen to itself and the dock is gone. */}
      <PawPrint
        className="size-8 text-muted-foreground/50 max-lg:hidden"
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
          promised here is where the animals will be, and an empty rail is a
          truer promise than a grey panel about to become a list of controls.
          The track rather than an empty element to hold the column open, and
          the same constant the block itself wears (lib/card-grid.ts). */}
      <div
        className={cn("flex flex-col gap-4", hasSidebar && RESULTS_GRID_TRACK)}
      >
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
  // The whole dataset. What the page counts and draws is what the search
  // finds in it (`animals` below); the dialog and the rosters read this.
  animals: dataset,
  logos,
  referenceDate,
  municipalities,
  municipalitiesUrl,
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
  municipalitiesUrl?: string;
  /** Registry shelters with no animals on the site, drawn inert in the
   *  location picker's map and list. */
  offSiteShelters?: FilterOption[];
}) {
  const { locale, messages, t } = useI18n();
  // The filter state a clear took away, while the row still offers it back.
  const [cleared, setCleared] = useState<Filters | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const {
    search,
    filters,
    sort,
    setSpecies,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    toggleGoodWith,
    toggleManyGoodWith,
    toggleCare,
    toggleManyCare,
    setQuery,
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
  // The results follow the filters a render behind, at a priority React can
  // interrupt. The panel answers a press at once from `filters`; the grid
  // behind it is the expensive half, and drawn in the same render it held the
  // press's first frame for 150-225ms at 4x CPU, which is exactly where every
  // section's pick gesture plays. Measured on the built site, colour picks
  // on Vse and Psi.
  const shownFilters = useDeferredValue(filters);
  // Before every other filter, so the tabs, the counts, the chips and the
  // empty state all describe what the search found. The dataset itself when
  // nothing is searched for.
  const {
    animals,
    rank,
    pending: searchPending,
  } = useAnimalSearch(dataset, shownFilters.query);
  const visible = useMemo(
    () => applyFilters(animals, shownFilters, reference),
    [animals, shownFilters, reference],
  );
  // Whether this render is answering a widening: unpick, clear and "Pokaži
  // vse vrste" all raise this count, and that is the direction CARD_SETTLE
  // exists for. Adjusted during render and not from an effect, on the same
  // reasoning as useFilterSections' own arrival flag: a re-render an effect
  // triggers would draw the old, invisible-card arrangement first and correct
  // it a frame later, which is the bug. Seeded from the first render's own
  // count, so the page's very first paint, the one arrival CARD_ENTRANCE is
  // for, is never mistaken for a widening.
  const [arrival, setArrival] = useState(() => ({
    count: visible.length,
    widening: false,
  }));
  if (visible.length !== arrival.count) {
    setArrival({
      count: visible.length,
      widening: visible.length > arrival.count,
    });
  }
  const { widening } = arrival;
  // Where Najbližje measures from, granted by the location picker's nearby
  // control and by nothing else. Null on the server and on the first client
  // render, which is what makes the option's absence in the sort picker and the
  // fallback here agree without either having to ask the other: with no origin
  // sortAnimals puts the list in the default order (effectiveSort), including
  // for a shared link that arrived carrying ?razvrsti=najblizje.
  const nearby = useNearbyOrigin();
  // A search puts what it found by name first, then by breed, then by
  // description, each in the chosen order (rankBySearch in
  // lib/filters/search.ts).
  const sorted = useMemo(
    () => rank(sortAnimals(visible, sort, locale, reference, nearby?.at)),
    [visible, sort, locale, reference, nearby, rank],
  );
  // The order the cards are in, which is what the long-stay mark below asks
  // about. sortAnimals resolves the same thing for itself, so this reads it
  // from the one function that decides it rather than restating the fallback.
  const order = effectiveSort(sort, nearby?.at);

  // How many of the matches were listed since this visitor's last visit, for
  // the notice above the cards, and the press that puts them first. Zero on a
  // first visit, on the server and through hydration.
  const newListings = useNewListingCount(visible, reference);
  const showNewFirst = useCallback(() => setSort("newly-listed"), [setSort]);
  // The blocking script before the grid held the notice's place from the
  // first paint (lib/last-visit.ts); the place goes back to the layout once
  // the visit has been read, which is the same commit that draws the notice
  // or finds nothing to draw. After it, so the notice is already standing in
  // the place it takes over.
  const visitRead = useVisitRead(reference);
  useEffect(() => {
    if (!visitRead) return;
    delete document.documentElement.dataset[NEW_LISTINGS_DATASET_KEY];
  }, [visitRead]);

  // The animals the filters hide only for want of an answer, offered under
  // the last match and drawn after the matches once asked for. band.list is
  // what the grid draws and the dialog steps through: the matches, and the
  // band after them while it is shown. Every count on the page stays the
  // matches' own.
  const band = useUnansweredBand({
    animals,
    filters: shownFilters,
    reference,
    sorted,
    sort,
    locale,
    origin: nearby?.at,
    rank,
  });

  // What the dialog steps through is what the visitor is looking at: the list
  // as filtered and sorted on screen, in that order. Read here, above the
  // chunking, because the step below is one of the things that asks whether a
  // dialog is open.
  //
  // Whether the dialog has arrived is the hook's too, and it is not the same
  // question as whether it is mounted: the component is lazy, so the render
  // that first asks for it draws nothing while the chunk is still in flight.
  // The cards carry the photograph into the dialog themselves, and only once
  // there is one to carry it into, which is what isDialogReady answers for
  // them and what the dialog reports through handleDialogReady.
  const {
    selected,
    origin,
    shownIds,
    handleOpen,
    isDialogReady,
    handleDialogReady,
    handleNavigate,
    close,
  } = useAnimalDialogHost({
    // The whole dataset: a link names an animal whatever the search finds.
    animals: dataset,
    shown: band.list,
    basePath: locale === "sl" ? "/" : "/en",
  });

  // Whether the dialog is on the page at all. False through the render that
  // first draws the grid, and set from idle below, which is why the chunk is
  // off the document itself. It is set here during render instead when the
  // address already names an animal, so a link that arrives with one mounts
  // the dialog in the same pass it is read in, the way the dialog itself
  // tracks that animal. Once true it stays true: the closing animation is
  // drawn by the dialog out of the animal it last held (lastAnimal in
  // animal-dialog.tsx), and a dialog taken off the page as the selection
  // clears would have nothing left to close with.
  const [dialogMounted, setDialogMounted] = useState(false);
  if (selected && !dialogMounted) setDialogMounted(true);

  // Counted against the matches alone, so the band arriving or going at a
  // press carries on from the cards already drawn.
  const {
    page,
    drawn,
    hasMore,
    settled,
    gridRef,
    watchSentinel,
    showMore,
    showFrom,
  } = useIncrementalGrid(band.list, selected !== undefined, sorted);

  // The band's press: shown, with its first card drawn and focused, since the
  // button that asked for it goes as it arrives.
  const { show: openBand } = band;
  const showBand = useCallback(() => {
    openBand();
    showFrom(sorted.length);
  }, [openBand, showFrom, sorted.length]);
  // Where the band's cards start among the drawn ones, while it is shown.
  const bandStart = band.shown ? sorted.length : undefined;

  // A static export has no server to read the query with, so the prerendered
  // HTML every filtered link lands on is the unfiltered grid, and it stands
  // there until hydration replaces it. The layout's inline script marks such a
  // link on <html> before any of it paints; this is the other half, and it
  // takes the mark off once the cards are the ones the address asks for.
  //
  // That is not the first client render. Hydration draws from the server's
  // empty query, the address is read in a render of its own straight after,
  // and the cards follow that render a render behind (shownFilters above).
  // Taken off after hydration, the mark let the unfiltered cards paint under
  // the already pressed species tab: on the built site for 250-390ms at 4x
  // CPU in Chromium and 490-600ms in WebKit. So two things have to hold. The
  // query this render read is the one in the address bar, which hydration's
  // is not, and the cards have caught up with the filters read from it.
  useEffect(() => {
    if (search !== getSearchSnapshot() || shownFilters !== filters) return;
    delete document.documentElement.dataset[PREHYDRATION_DATASET_KEY];
  }, [search, filters, shownFilters]);

  // Mount the empty dialog on idle to avoid a Suspense delay on first open.
  // Descriptions stay deferred until grid interaction.
  useEffect(() => {
    if (dataset.length === 0) return;
    const onIdle = () => {
      setDialogMounted(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(onIdle);
      return () => window.cancelIdleCallback(handle);
    }
    // Safari has no requestIdleCallback. A plain timer, set late enough to be
    // behind hydration and the first cards' photos.
    const timer = window.setTimeout(onIdle, IDLE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [dataset.length]);

  const isEmpty = dataset.length === 0;

  // Reachable zero state: every other facet is pre-guarded by isDeadOption
  // disabling, but for a row the sidebar keeps at 0 once its pick comes off
  // (KeptPicks), which says 0 before it is pressed. So a filtered-to-zero
  // result in practice means a shelter selection with none of the active
  // species. Only worth a second full applyFilters pass (with the shelter
  // group dropped, the same way the rest
  // of the file measures facets) when the list is actually empty and a
  // shelter is actually selected — otherwise this short-circuits and the
  // normal case (a shelter picked, some animals showing) never pays for it.
  const shelterOnlyEmpty = useMemo(
    () =>
      visible.length === 0 &&
      shownFilters.shelter.length > 0 &&
      applyFilters(animals, { ...shownFilters, shelter: [] }, reference).length > 0,
    [animals, shownFilters, reference, visible.length],
  );
  // The other reason an empty list can have, for the same list: the question
  // the visitor answered that the shelters answered least (thinnestAnswer).
  // Asked only while nothing matches, since there is nothing to explain
  // while anything does.
  const thinnest = useMemo(
    () =>
      visible.length === 0
        ? thinnestAnswer(animals, shownFilters, reference)
        : undefined,
    [animals, shownFilters, reference, visible.length],
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
  // The sheet keeps the offer until it closes, then starts a fresh seven
  // seconds on the page. Expiring its focused Undo button would disable the
  // same footer control under the visitor and drop focus into the drawer.
  // Picking a filter during the window hides it without cancelling it,
  // because the row shows the offer
  // only where the chips would be and chips win that space (filter-chips.tsx).
  // Undoing after that still restores the state that was cleared, which is
  // what the words promise, so there is nothing to guard against.
  useEffect(() => {
    if (!cleared || filterSheetOpen) return;
    const timer = window.setTimeout(() => setCleared(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [cleared, filterSheetOpen]);

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
    keptPicks,
    shelters,
    toggles,
    toggleTally,
    goodWith,
    care,
    chips,
    hasSidebar,
    unanswered,
  } = useAnimalFilterModel({
    animals,
    dataset,
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
      toggleCare,
      toggleManyCare,
    },
  });

  const emptyTopic = thinnest && topicKey(thinnest);
  const emptyReason =
    thinnest && emptyTopic
      ? t("knownFor", {
          topic: t(emptyTopic),
          answered: thinnest.answered,
          asked: thinnest.asked,
          // Who {asked} counts. Velikost on Vse is asked of the dogs and the
          // other animals alone (groupAsks), so "od 40 živali" would take in
          // cats nobody asked.
          species: t(
            thinnest.facet === "size" && shownFilters.species === "all"
              ? "sizeAskedOf"
              : SPECIES_ABSENCE_KEY[shownFilters.species],
          ),
        })
      : undefined;

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
        // the rail's track the photo bands are derived from and the minmax(0,...)
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
        {/* The results, ahead of the rail in the document and put back beside
            it by the tracks both of them name (lib/card-grid.ts). What is at
            stake is the order a keyboard and a screen reader meet this page
            in: the toolbar above the cards holds the species tabs and the sort
            control, and with the panel rendered first they were the 26th tab
            stop, behind 14 to 32 stops of filters, with the skip link aiming
            past the grid rather than at them. Below lg the rail is
            display:none and there is one column, so nothing there changes. */}
        <div className={cn("flex flex-col gap-4", hasSidebar && RESULTS_GRID_TRACK)}>
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
            care={care}
            shelters={shelters}
            shelterTally={counts.shelter}
            municipalities={municipalities}
            municipalitiesUrl={municipalitiesUrl}
            offSiteShelters={offSiteShelters}
            shelterSummaries={shelterSummaries}
            chips={chips}
            undo={cleared ? handleUndo : undefined}
            onSheetOpenChange={setFilterSheetOpen}
            resultCount={visible.length}
            sort={sort}
            onSpeciesChange={setSpecies}
            onToggle={toggle}
            onToggleMany={toggleMany}
            onToggleProperty={toggleProperty}
            onToggleManyProperties={toggleManyProperties}
            onClearAll={handleClearAll}
            onSortChange={setSort}
            unanswered={unanswered}
          />

          {/* Held open before the first paint while the script before the grid
              expects a notice (lib/last-visit.ts, the rule in app/globals.css),
              and out of the column's gap whenever it is empty. Under the Nove
              objave order the new listings are already first. */}
          <div data-slot={NEW_LISTINGS_SLOT}>
            {order !== "newly-listed" && (
              <NewListingsNotice count={newListings} onShowFirst={showNewFirst} />
            )}
          </div>

          {isEmpty ? (
            <EmptyState>
              <p className="text-sm text-muted-foreground">
                {messages.animalsComingSoon}
              </p>
            </EmptyState>
          ) : animals.length === 0 ? (
            // Not one animal answers the query, so no filter is the reason
            // and the lines about filters below would point the wrong way.
            // Until the descriptions are in, that is not known yet.
            <EmptyState>
              <p
                className={cn(
                  "text-sm",
                  searchPending ? "text-muted-foreground" : "font-medium",
                )}
              >
                {searchPending
                  ? messages.searchingDescriptions
                  : t("noSearchResults", { query: shownFilters.query })}
              </p>
              {!searchPending && (
                <Button
                  variant="outline"
                  size="sm"
                  className={COARSE_ACTION}
                  onClick={() => setQuery("")}
                >
                  {messages.clearSearch}
                </Button>
              )}
            </EmptyState>
          ) : visible.length === 0 && !band.shown ? (
            <EmptyState>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {shelterOnlyEmpty
                    ? t(shelterAbsenceKey(shownFilters.shelter.length), {
                        species: t(SPECIES_ABSENCE_KEY[shownFilters.species]),
                      })
                    : messages.noResults}
                </p>
                {/* Why, before what to do about it, when a thin answer is the
                    likeliest reason: "Ni zadetkov" under Psi, Otroke and
                    Mačko can read as no dog being fine with children, when 121
                    of the 124 had no answer. */}
                {!shelterOnlyEmpty && emptyReason && (
                  <p className="text-sm text-muted-foreground">{emptyReason}</p>
                )}
                {!shelterOnlyEmpty && (
                  <p className="text-sm text-muted-foreground">
                    {messages.tryFewerFilters}
                  </p>
                )}
              </div>
              {/* The one way out that keeps every filter as it is: the
                  animals nobody answered the picks for. */}
              {band.count > 0 && (
                <BandShowButton
                  count={band.count}
                  species={shownFilters.species}
                  onShow={showBand}
                  buttonRef={band.offerRef}
                />
              )}
              {shelterOnlyEmpty && (
                <Button
                  variant="outline"
                  size="sm"
                  className={COARSE_ACTION}
                  onClick={() => toggleMany("shelter", filters.shelter)}
                >
                  {messages.showFromAllShelters}
                </Button>
              )}
              {/* Filter clearing stays in the chip rows. This action widens
                  the species scope while keeping the remaining filters, and
                  is offered only when the existing facet count promises results. */}
              {shownFilters.species !== "all" && speciesTally.all > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className={COARSE_ACTION}
                  onClick={() => setSpecies("all")}
                >
                  {t("showAllSpeciesCount", { count: speciesTally.all })}
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
              onPointerEnter={() => { void prefetchAnimalDescriptions(); }}
              onFocusCapture={() => { void prefetchAnimalDescriptions(); }}
              onTouchStart={() => { void prefetchAnimalDescriptions(); }}
              className={CARD_GRID}
            >
              {withBandDivider(
                page.map((animal, ordinal) => (
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
                    // holds a delayed card invisible until its turn -- except on
                    // a widening, where that card is not arriving but coming
                    // back, and CARD_SETTLE takes over so it is never the one
                    // sitting invisible next to the survivors.
                    //
                    // The first dozen and no further. Vse used to render all 503
                    // matches at once, so animating every one of them started 503
                    // compositor animations inside a 330ms window, during
                    // hydration, while 500 images were decoding. The cap outlives
                    // the chunking above: ordinal counts within the whole sorted
                    // list, so a card arriving with a later step is past it by
                    // definition and arrives settled, which is what a card nobody
                    // asked to see should do. The band's first dozen count from
                    // the band's own start, since they arrive at a press of
                    // their own (arrivalOrdinal).
                    //
                    // card-paint is the other half of the same problem: what is
                    // drawn is now bounded, and this bounds what is painted, so a
                    // card scrolled past costs nothing until it comes back.
                    className={cn(
                      "card-paint",
                      arrivalOrdinal(ordinal, bandStart) < STAGGERED_CARDS &&
                        (widening ? CARD_SETTLE : CARD_ENTRANCE),
                    )}
                    // Past the twelfth there is no delay written, and the index
                    // is undefined there, which is what a settled card wants.
                    // None written for a widening either: every card in it lands
                    // on the same instant, so there is no per-card wait to spell.
                    style={
                      widening
                        ? undefined
                        : STAGGER_STYLE[arrivalOrdinal(ordinal, bandStart)]
                    }
                    // The tab already named the species, so the card's one fact
                    // line does not have to spend itself saying it again.
                    species={shownFilters.species}
                    // The first row, which is the largest image on the screen and
                    // was queueing behind the bundle like the other 499.
                    eager={ordinal < 4}
                    onOpen={handleOpen}
                    isDialogReady={isDialogReady}
                    // A shelter's own page renders these same cards and leaves
                    // this off, because there the line would be the page linking
                    // to itself under every animal on it.
                    showShelter
                  />
                )),
                bandStart,
                <BandDivider
                  key="band-divider"
                  missing={band.missing}
                  onHide={band.hide}
                />,
              )}
              {/* The sentinel the step watches, then the button that replaces
                  it once the budget is spent: grid-load-more.tsx, which the
                  shelter grid draws too. It counts the band with the matches
                  while the band is drawn under them. */}
              <GridLoadMore
                hasMore={hasMore}
                settled={settled}
                watchSentinel={watchSentinel}
                showMore={showMore}
                drawn={drawn}
                total={band.list.length}
              />
              {/* The offer, once every match is drawn and the list has run
                  out: never in the middle of the matches, and never on the
                  server, whose render has no filters to hide anything. */}
              {!band.shown && band.count > 0 && drawn >= sorted.length && (
                <BandOffer
                  count={band.count}
                  missing={band.missing}
                  species={shownFilters.species}
                  onShow={showBand}
                  buttonRef={band.offerRef}
                />
              )}
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
        </div>

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
            //
            // That pairing survives the panel being second in the document:
            // each of the two pins against the page's own scrolling and not
            // against the other, so which one the browser lays out first
            // decides nothing about where either comes to rest. The track is
            // what puts the panel back in the left column (lib/card-grid.ts).
            className={cn(
              RESULTS_RAIL_TRACK,
              "hidden lg:sticky lg:top-0 lg:block lg:max-h-[calc(100dvh-var(--rail-pad)*2)] lg:overflow-x-hidden lg:overflow-y-auto lg:bg-background lg:pt-rail-pad",
            )}
            filters={filters}
            groups={groups}
            counts={counts}
            toggles={toggles}
            toggleTally={toggleTally}
            goodWith={goodWith}
            care={care}
            // The sheet is not handed these: it draws every option as a tile.
            kept={keptPicks}
            scope={
              shelters && {
                options: shelters,
                counts: counts.shelter,
                municipalities,
                municipalitiesUrl,
                offSite: offSiteShelters,
                summaries: shelterSummaries,
                resultCount: visible.length,
              }
            }
            onToggle={toggle}
            onToggleMany={toggleMany}
            onToggleProperty={toggleProperty}
            onToggleManyProperties={toggleManyProperties}
            unanswered={unanswered}
            sort={sort}
            onSortChange={setSort}
          />
        )}

        {/* Where the skip link lands, and it has to be past the rail as well
            as past the cards. It used to be the last child of the grid column,
            which was the end of the document until the results moved ahead of
            the panel: from then on skipping the list left the visitor at the
            top of fourteen to thirty-two filter stops, which is further from
            the footer than the grid was. A row of its own under both columns,
            so it is last whichever track it is read from, and zero-height, so
            it costs the layout nothing. tabIndex so focus actually moves here
            rather than only scrolling the page. */}
        <div
          id="za-rezultati"
          tabIndex={-1}
          className={cn(hasSidebar && "lg:col-span-2 lg:row-start-2")}
        />

        {dialogMounted && (
          <AnimalDialog
            animal={selected}
            logos={logos}
            origin={origin}
            siblingIds={shownIds}
            reference={reference}
            onReady={handleDialogReady}
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
