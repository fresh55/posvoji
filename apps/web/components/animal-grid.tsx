"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PawPrint } from "lucide-react";
import { AnimalCard } from "@/components/animal-card";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { AnimalFilters } from "@/components/filters/animal-filters";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import type { CardGroup } from "@/components/filters/filter-groups";
import { FilterChips, type Chip } from "@/components/filters/filter-chips";
import { Button } from "@/components/ui/button";
import { useAnimalDialogHost } from "@/hooks/use-animal-dialog-host";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import { useNearbyOrigin } from "@/hooks/use-nearby-origin";
import type { ClientAnimal } from "@/lib/animal";
import { CARD_GRID } from "@/lib/card-grid";
import {
  applyFilters,
  bySpecies,
  careCounts,
  careOptions,
  chipGains,
  chipKey,
  facetCounts,
  goodWithCounts,
  goodWithOptions,
  GROUPS,
  groupOptions,
  homeCounts,
  homeOptions,
  optionLabel,
  speciesCounts,
  speciesFacetCounts,
  toggleCounts,
  toggleLabel,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  visibleHome,
  visibleToggles,
  type FilterOption,
  type Filters,
  type SpeciesFilter,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import {
  careLabel,
  goodWithChipLabel,
  homeLabel,
  shelterChipLabel,
} from "@/lib/labels";
import {
  PREHYDRATION_DATASET_KEY,
  RESULTS_SLOT,
} from "@/lib/prehydration-script";
import { summarizeShelters } from "@/lib/shelter-summary";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { DEFAULT_ANIMAL_SORT, sortAnimals } from "@/lib/sort";
import { cn } from "@/lib/utils";
import type { ShelterLogos } from "@/lib/shelter-logos";

// How long a cleared filter state can still be taken back. Long enough to
// read the row and reach for it, short enough that the offer is gone before
// it becomes part of the furniture.
export const UNDO_WINDOW_MS = 7000;

// How many cards play the entrance animation. Roughly the first three rows at
// the widest layout, which is everything a visitor can see when the grid
// changes; the rest are below the fold and arrive settled.
const STAGGERED_CARDS = 12;

// How many cards the first render draws, and how many each step after it adds.
// The grid is not paginated, so Vse used to mount all 503 matches at once:
// about fourteen thousand nodes, a thousand tab stops and a 66,000px page, all
// of it in the prerendered HTML as well. Sixty is several screens on the
// tallest phone and more than a desktop first paint can show, and the steps
// after it are asked for well before anyone reaches the bottom.
//
// Rendering only. Every count on the page, the facet numbers and the dialog's
// sibling list all still read the whole filtered set.
export const INITIAL_CARDS = 60;
export const CARDS_PER_STEP = 60;

// How far below the last drawn card the next step is asked for, so the grid is
// already longer by the time the visitor gets there.
const STEP_MARGIN = "1200px 0px";

// How many of those steps happen on their own before the grid starts asking.
// Unbounded, the sentinel re-armed 1200px ahead of the reader every time, so
// the document grew faster than anyone could descend it and the footer -
// which is the only way to any other page - could not be scrolled to at all.
// Once the budget is spent the sentinel gives way to a button, and the footer
// stands one press below whatever is drawn.
//
// Two budgets, because the page is not the same length twice. A phone draws
// two columns, so 120 cards is sixty rows; a desktop draws three or four, so
// 180 is forty-five to sixty. Measured as scroll distance the two come out
// within a screen of each other, which is the number that actually matters:
// how far the footer can run from someone who wants it.
export const AUTO_STEPS_PHONE = 1;
export const AUTO_STEPS_DESKTOP = 2;

// A press is a stronger signal than a scroll, so it buys more. At 120 a full
// unfiltered dataset is three or four presses end to end, without the grid
// ever mounting hundreds of cards nobody asked to see.
export const CARDS_PER_CLICK = 120;

// Read at step time rather than held in state: the cap only matters inside
// the observer callback, and matchMedia there is always current, where a
// value captured at mount would go stale across a rotation or a resize.
function autoDrawLimit(): number {
  const steps = window.matchMedia("(min-width: 1024px)").matches
    ? AUTO_STEPS_DESKTOP
    : AUTO_STEPS_PHONE;
  return INITIAL_CARDS + steps * CARDS_PER_STEP;
}

// Which species-absence message key fills the {species} slot of
// noResultsShelterSingular/Plural. Keyed by the species tab rather than
// spelled out inline, so a new species fails to compile here instead of
// silently falling back to the wrong noun form.
const SPECIES_ABSENCE_KEY: Record<SpeciesFilter, TranslationKey> = {
  all: "speciesAbsenceAll",
  dog: "speciesAbsenceDogs",
  cat: "speciesAbsenceCats",
  other: "speciesAbsenceOther",
};

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

  // How much of that list is on the page. The count is held together with the
  // list it was counted against, so it answers for that list and no other: any
  // filter, sort or species move hands down a different array, the count stops
  // applying, and the grid is read from its top again. No effect has to notice
  // and no render of the new list is ever made against the old one's count.
  // `settled` is the auto-step budget being spent: from then on the grid only
  // grows by the button below, and a new list starts the budget over.
  const [chunk, setChunk] = useState<{
    of: ClientAnimal[];
    drawn: number;
    settled: boolean;
  }>({
    of: sorted,
    drawn: INITIAL_CARDS,
    settled: false,
  });
  const drawn = chunk.of === sorted ? chunk.drawn : INITIAL_CARDS;
  const settled = chunk.of === sorted && chunk.settled;
  // slice clamps, so the whole list and a prefix of it are the same call.
  const page = useMemo(() => sorted.slice(0, drawn), [sorted, drawn]);
  const hasMore = drawn < sorted.length;

  // The sentinel's own ref is the observer's lifetime, and that lifetime is now
  // one sorted list rather than one step: the callback closes over the list
  // alone, so a step no longer takes the observer down and puts a new one up.
  // What delivers the next entry is the sentinel leaving the watched band and
  // coming back, which a step of sixty cards guarantees, being far more than
  // the 1200px margin below. The step is a functional update for the same
  // reason: it reads the count off the state it is updating rather than off a
  // closure that would have to be rebuilt to stay current.
  const watchSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      // jsdom, and anything else with no observer, gets the whole list rather
      // than a grid with no way to grow.
      if (typeof IntersectionObserver === "undefined") {
        setChunk({ of: sorted, drawn: sorted.length, settled: true });
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            // The same guard the render reads the count through: a count
            // counted against another list starts again from the top.
            setChunk((previous) => {
              const drawn =
                (previous.of === sorted ? previous.drawn : INITIAL_CARDS) +
                CARDS_PER_STEP;
              return { of: sorted, drawn, settled: drawn >= autoDrawLimit() };
            });
          }
        },
        { rootMargin: STEP_MARGIN },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [sorted],
  );

  // The button's step, once the automatic budget above is spent. Focus moves
  // to the first card the press added: the reading position a screen reader
  // or a keyboard should resume from, and the button itself can unmount when
  // the list runs out, which would otherwise drop focus on <body>.
  const gridRef = useRef<HTMLDivElement>(null);
  // A ref rather than state: nothing renders from this, it only says which
  // card the next paint should hand focus to. The effect below runs off the
  // count the press changed, so it lands after those cards exist.
  const focusOrdinal = useRef<number | null>(null);
  const showMore = useCallback(() => {
    focusOrdinal.current = drawn;
    setChunk((previous) => ({
      of: sorted,
      drawn:
        (previous.of === sorted ? previous.drawn : INITIAL_CARDS) +
        CARDS_PER_CLICK,
      settled: true,
    }));
  }, [drawn, sorted]);
  useEffect(() => {
    const ordinal = focusOrdinal.current;
    if (ordinal === null) return;
    focusOrdinal.current = null;
    const card = gridRef.current?.querySelectorAll("article")[ordinal];
    card?.querySelector("a")?.focus();
  }, [drawn]);

  // A static export has no server to read the query with, so the prerendered
  // HTML every filtered link lands on is the unfiltered grid, and it stands
  // there until hydration replaces it. The layout's inline script marks such a
  // link on <html> before any of it paints; this is the other half, and it runs
  // after the first client render, which is the first one that answers the
  // address it was opened at.
  useEffect(() => {
    delete document.documentElement.dataset[PREHYDRATION_DATASET_KEY];
  }, []);

  // What the dialog steps through is what the visitor is looking at: the list
  // as filtered and sorted on screen, in that order.
  const { selected, origin, shownIds, handleOpen, handleNavigate, close } =
    useAnimalDialogHost({
      animals,
      shown: sorted,
      basePath: locale === "sl" ? "/" : "/en",
    });

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

  // Two numbers, deliberately. `speciesRoster` decides which tabs exist and
  // ignores the filters; `speciesTally` is what each tab draws and obeys all
  // of them except species. See speciesFacetCounts in lib/filters.ts for why
  // the tab counts stopped being the raw dataset, and species-tabs.tsx for
  // why the roster could not follow them.
  const speciesRoster = useMemo(() => speciesCounts(animals), [animals]);
  const speciesTally = useMemo(
    () => speciesFacetCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  // What the location picker's card says about a shelter beyond its filtered
  // count: which species live there and who has waited longest. Built from the
  // whole dataset and not from `visible`, so the card answers "who is this
  // shelter" rather than "what matches my filter" — the count pill next to the
  // shelter's name already carries the filtered number. Measured from
  // `reference`, the same way the age buckets above are.
  //
  // summarizeShelters only ever sees animals, so the logo is folded in here:
  // `logos` is keyed by the same shelter id (see shelter-block.tsx for the
  // same lookup against an animal's own shelter), and a shelter the fetch
  // never found a logo for is simply left for ShelterAvatar's initial-letter
  // fallback to answer.
  const shelterSummaries = useMemo(() => {
    const summaries = summarizeShelters(animals, locale, reference);
    for (const [id, summary] of summaries) {
      const logo = logos[id];
      if (logo) summary.logo = logo;
    }
    return summaries;
  }, [animals, locale, logos, reference]);
  const counts = useMemo(
    () => facetCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  // The panel follows the species tab: measured against the whole dataset it
  // would offer groups the animals on screen don't vary on.
  const pool = useMemo(
    () => bySpecies(animals, filters.species),
    [animals, filters.species],
  );
  // Zavetisce is split off from the rest. The others are short runs of options
  // you weigh against each other and belong in a column of small controls;
  // where you adopt from is a map, and it goes next to the species tabs as the
  // other question people arrive with.
  // filters and not just filters.species: a group the visitor has answered stays
  // on the panel even where the pool has nothing left to narrow, or the
  // selection goes on working from the URL with no control to switch it off
  // (visibleGroups in lib/filters.ts). Every visible* call below is passed its
  // own selection for the same reason.
  const shown = useMemo(
    () => visibleGroups(pool, filters, reference),
    [pool, filters, reference],
  );
  const groups = useMemo(
    () =>
      GROUPS.filter(
        (group): group is CardGroup => group !== "shelter" && shown[group],
      ).map((group) => ({ group, options: groupOptions(group, pool, locale) })),
    [locale, pool, shown],
  );
  // Not gated on shown.shelter, unlike every group above. visibleGroups drops a
  // group with fewer than two distinct values, which is right for a facet: one
  // value narrows nothing. The shelter picker is not that facet. It is a map of
  // where every shelter in the country is, the way back out of a narrow result,
  // and on a phone the mobile dock is built around it. Gating it on two
  // distinct shelters took the whole dock off the page at /?vrsta=zajcek, where
  // one rabbit sits at one shelter: the single state where a visitor most needs
  // to widen the search was the one state with nothing left to press. Absent
  // only when the dataset has no shelter to show at all.
  //
  // Measured against `animals` and not `pool`, which is the same reason. This
  // is the picker's roster, not a facet of the current query: together with the
  // off-site registry shelters the page hands down beside it, it is every
  // shelter that exists, and the species tab may not take one off it. Measured
  // against the species-filtered pool it did: the trigger read "Vseh 11
  // zavetišč" over a list of seventeen rows, and at
  // /?zavetisce=macja-hisa,macji-dol&vrsta=zajcek it read "2 od 1 zavetišč",
  // because the selection came from the URL and the total came from the facet.
  // What the species tab moves is each shelter's own number, which is
  // `counts.shelter` below and is measured with every active filter applied.
  const shelters = useMemo(() => {
    const options = groupOptions("shelter", animals, locale);
    return options.length > 0 ? options : undefined;
  }, [animals, locale]);
  // Their names, by id. The chips row used to ask optionLabel for each one,
  // and optionLabel rebuilds the whole roster from every animal to answer,
  // so a row of shelter chips walked the dataset once per pill on every
  // render. The roster above is that same walk, already done.
  const shelterLabels = useMemo(
    () => new Map((shelters ?? []).map(({ value, label }) => [value, label])),
    [shelters],
  );
  const toggles = useMemo(
    () =>
      visibleToggles(pool, filters.species, filters.toggles).map((toggle) => ({
        ...toggle,
        label: toggleLabel(toggle.key, locale),
      })),
    [locale, pool, filters.species, filters.toggles],
  );
  const toggleTally = useMemo(
    () => toggleCounts(animals, filters, reference),
    [animals, filters, reference],
  );
  // The section carries its own options, tally and actions, and is left out
  // entirely while no facet has enough answers to narrow anything.
  const goodWith = useMemo(() => {
    const keys = visibleGoodWith(pool, filters.goodWith);
    if (keys.length === 0) return undefined;
    return {
      options: goodWithOptions(locale).filter(({ key }) => keys.includes(key)),
      counts: goodWithCounts(animals, filters, reference),
      resultCount: visible.length,
      total: pool.length,
      onToggle: toggleGoodWith,
      onToggleMany: toggleManyGoodWith,
    };
  }, [
    animals,
    filters,
    locale,
    reference,
    pool,
    visible.length,
    toggleGoodWith,
    toggleManyGoodWith,
  ]);

  // Same rule as the household section: absent until the shelters have
  // answered for some animals and not for all of them.
  const home = useMemo(() => {
    const keys = visibleHome(pool, filters.home);
    if (keys.length === 0) return undefined;
    return {
      options: homeOptions(locale).filter(({ key }) => keys.includes(key)),
      counts: homeCounts(animals, filters, reference),
      resultCount: visible.length,
      total: pool.length,
      onToggle: toggleHome,
      onToggleMany: toggleManyHome,
    };
  }, [
    animals,
    filters,
    locale,
    reference,
    pool,
    visible.length,
    toggleHome,
    toggleManyHome,
  ]);

  const care = useMemo(() => {
    const keys = visibleCare(pool, filters.care);
    if (keys.length === 0) return undefined;
    return {
      options: careOptions(locale).filter(({ key }) => keys.includes(key)),
      counts: careCounts(animals, filters, reference),
      resultCount: visible.length,
      total: pool.length,
      onToggle: toggleCare,
      onToggleMany: toggleManyCare,
    };
  }, [
    animals,
    filters,
    locale,
    reference,
    pool,
    visible.length,
    toggleCare,
    toggleManyCare,
  ]);

  // What each active value is costing: how many more animals show if it comes
  // off, everything else left alone. The row spends it two ways: a tooltip on
  // hover, and, when nothing matches at all, a mark on the single chip that is
  // the cheapest way out.
  //
  // This used to be a full applyFilters pass per chip, on the reasoning that
  // no one-pass shortcut could answer it: counting the animals that fail
  // exactly one filter is a different question, and gets every multi-value
  // facet backwards. True as far as it went. The answer was to stop counting
  // failures and count the two things that actually move, which chipGains does
  // in one walk (lib/filters.ts), so a row of chips now costs what one chip
  // used to.
  const chipGain = useMemo(
    () => chipGains(animals, filters, reference),
    [animals, filters, reference],
  );

  // The pressed species tab already shows itself, so chips cover only the
  // sidebar/sheet groups and the shelter picker. The rule is not "everything
  // that is on": it is "everything with no other one-click way off". A
  // species goes back to Vse in one press of its own tab; a shelter takes a
  // dialog, which is why it is here and the species is not.
  //
  // Each chip carries the facet that set it, because the row groups by facet
  // and draws one icon per facet: flat, they were nine questions' answers
  // wearing the same pill.
  const chips: Chip[] = [
    ...GROUPS.flatMap((group) =>
      filters[group].map((value) => ({
        key: chipKey(group, value),
        facet: group,
        value,
        label:
          group === "shelter"
            ? shelterChipLabel(shelterLabels.get(value) ?? value)
            : optionLabel(group, value, animals, locale),
        gain: chipGain.get(chipKey(group, value)),
        onRemove: () => toggle(group, value),
      })),
    ),
    ...filters.toggles.map((key) => ({
      key: chipKey("toggles", key),
      facet: "toggles" as const,
      value: key,
      label: toggleLabel(key, locale),
      gain: chipGain.get(chipKey("toggles", key)),
      onRemove: () => toggleProperty(key),
    })),
    // Not the card label: on a row of chips "Psi" would read as the species
    // tab, so these name the household instead.
    ...filters.goodWith.map((key) => ({
      key: chipKey("goodWith", key),
      facet: "goodWith" as const,
      value: key,
      label: goodWithChipLabel(key, locale),
      gain: chipGain.get(chipKey("goodWith", key)),
      onRemove: () => toggleGoodWith(key),
    })),
    // Both of these read as whole phrases on the card already, so a chip says
    // the same words rather than a second wording of them.
    ...filters.home.map((key) => ({
      key: chipKey("home", key),
      facet: "home" as const,
      value: key,
      label: homeLabel(key, locale),
      gain: chipGain.get(chipKey("home", key)),
      onRemove: () => toggleHome(key),
    })),
    ...filters.care.map((key) => ({
      key: chipKey("care", key),
      facet: "care" as const,
      value: key,
      label: careLabel(key, locale),
      gain: chipGain.get(chipKey("care", key)),
      onRemove: () => toggleCare(key),
    })),
  ];

  const hasSidebar =
    groups.length > 0 ||
    toggles.length > 0 ||
    goodWith !== undefined ||
    home !== undefined ||
    care !== undefined;

  return (
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
        className="sr-only rounded-ui bg-background px-3 py-2 text-sm underline underline-offset-4 focus:not-sr-only focus:absolute focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
      >
        {messages.skipResults}
      </a>
      {hasSidebar && (
        <FilterSidebar
          // lg:bg-background is load-bearing, not decoration. lg:sticky
          // puts the sidebar on its own compositing layer, and Chrome
          // keeps subpixel text antialiasing on such a layer only while
          // it has a fully opaque background colour. Transparent, every
          // label in here renders greyscale while the rest of the page
          // does not, which reads as blur at the same size.
          className="hidden lg:sticky lg:top-[var(--sticky-top)] lg:block lg:max-h-[calc(100dvh-var(--sticky-top)*2)] lg:overflow-x-hidden lg:overflow-y-auto lg:bg-background"
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
          onClearAll={handleClearAll}
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
                  ? t(
                      filters.shelter.length === 1
                        ? "noResultsShelterSingular"
                        : "noResultsShelterPlural",
                      { species: t(SPECIES_ABSENCE_KEY[filters.species]) },
                    )
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
            <Button
              variant={shelterOnlyEmpty ? "ghost" : "outline"}
              size="sm"
              onClick={handleClearAll}
            >
              {messages.clearFilters}
            </Button>
          </EmptyState>
        ) : (
          <div ref={gridRef} className={CARD_GRID}>
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
        // The default sort already leads with the longest waits, so the
        // callout's link only exists while some other order is on.
        onSeeLongestWaiting={
          sort === DEFAULT_ANIMAL_SORT
            ? undefined
            : () => {
                setSort(DEFAULT_ANIMAL_SORT);
                close();
              }
        }
      />
    </section>
  );
}
