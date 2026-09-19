"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ExternalLink,
  LoaderCircle,
  Navigation,
  Phone,
  Search,
  X,
} from "lucide-react";
import { fold } from "@/components/filters/location-picker/model";
import { useI18n } from "@/components/i18n-provider";
import { telHref } from "@/lib/contact-links";
import { CoverageCard } from "@/components/municipality-coverage-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNearby } from "@/hooks/use-nearby";
import { FOUND_ANIMAL_PLACE_PARAMS } from "@/lib/found-animal";
import {
  commitSearch,
  getSearchSnapshot,
  getServerSearchSnapshot,
  mergeOwnedParams,
  subscribeToLocation,
} from "@/lib/location-search";
import { looksLikePostcode } from "@/lib/postal-lookup";
import type { LookupEntry, NearbyShelter } from "@/lib/municipality-coverage";
import {
  municipalitiesForInput,
  municipalitiesNear,
  type MunicipalityGuess,
} from "@/lib/municipality-lookup";
import { cn } from "@/lib/utils";
import { COARSE_ACTION, MUTED_LINK, SOURCE_LINK } from "@/lib/link-styles";
import { sheltersIndexPath } from "@/lib/shelter-path";

const LAW_URL =
  "https://www.uradni-list.si/glasilo-uradni-list-rs/vsebina/2025-01-2342/zakon-o-spremembah-in-dopolnitvah-zakona-o-zasciti-zivali-zzziv-g";
const MAX_MATCHES = 8;
const MAX_QUERY_LENGTH = 120;

// The placeholder and labelled location button need 18.55rem together.
// Container queries also adapt when enlarged text reduces the available width.
const FIELD_LABEL_HIDDEN = "@max-[19rem]/finder-field:hidden";
const FIELD_LABELLED_PADDING = "@min-[19rem]/finder-field:max-lg:pr-36";

// Stack before the call button crowds the shelter's name, town and distance.
const ROW_STACKED =
  "@max-[19rem]/shortlist:flex-col @max-[19rem]/shortlist:items-start";

/** Search text and an explicitly chosen municipality, if any. */
type Ask = { query: string; picked: string | null };

const NOT_ASKED: Ask = { query: "", picked: null };

function NearestRow({
  shelter,
  note,
  children,
}: {
  shelter: NearbyShelter;
  note?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-2.5 last:pb-0",
        ROW_STACKED,
      )}
    >
      <span className="min-w-0 text-sm">
        <a
          href={shelter.detailHref}
          className={SOURCE_LINK}
        >
          {shelter.shelterName}
        </a>
        <span className="block text-muted-foreground">
          {shelter.city} ·&nbsp;{t("muniDistance", { km: shelter.km })}
        </span>
        {note && <span className="block text-muted-foreground">{note}</span>}
      </span>
      {children}
    </li>
  );
}

/** A resolved municipality and the shelters to show on the map. */
export type FinderAnswer = {
  municipality: string;
  /** Recorded responsible shelters, or the nearest shortlist if none exist. */
  shelters: string[];
  /** Responsible shelters, or the nearest shelter with a phone number. */
  spotlight: string[];
  /** Whether the municipality has a coverage record. */
  verified: boolean;
  /** All coverage sources are confirmed; true when there are no records.
   * Check `verified` separately before claiming responsibility. */
  confirmed: boolean;
};

export function MunicipalityFinder({
  entries,
  onAnswer,
}: {
  entries: LookupEntry[];
  onAnswer: (answer: FinderAnswer | null) => void;
}) {
  const { locale, messages, t } = useI18n();
  // Null uses the URL's initial query; user input takes precedence after that.
  const [asked, setAsked] = useState<Ask | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const statusId = useId();
  const keyboardHintId = useId();
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { state, toggle: locate, turnOff } = useNearby();

  useEffect(() => {
    const restoreLocation = () => {
      setAsked(null);
      setHighlighted(null);
      setDismissed(false);
      turnOff();
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [turnOff]);

  const byName = useMemo(
    () => new Map(entries.map((entry) => [entry.name, entry])),
    [entries],
  );

  // Normalize names once per dataset, rather than on every keystroke.
  const folded = useMemo(
    () => entries.map((entry) => ({ entry, key: fold(entry.name) })),
    [entries],
  );

  // The empty server snapshot keeps static HTML hydration consistent.
  // The client snapshot also updates on browser back/forward navigation.
  const linked = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const seed = useMemo<Ask>(() => {
    const params = new URLSearchParams(linked);
    const municipality = params.get(FOUND_ANIMAL_PLACE_PARAMS[0])?.trim();
    const place = (municipality || params.get(FOUND_ANIMAL_PLACE_PARAMS[1])?.trim())
      ?.slice(0, MAX_QUERY_LENGTH);
    if (!place) return NOT_ASKED;
    const needle = fold(place);
    const exact = folded.find(({ key }) => key === needle);
    // Only kraj confirms a municipality; posta can still be ambiguous.
    return { query: place, picked: municipality && exact ? exact.entry.name : null };
  }, [folded, linked]);

  const { query, picked } = asked ?? seed;
  const trimmedQuery = query.trim();
  const postcodeQuery = looksLikePostcode(trimmedQuery) || /^\d+$/.test(trimmedQuery);

  const askFor = (next: string) => {
    setAsked({ query: next.slice(0, MAX_QUERY_LENGTH), picked: null });
    setHighlighted(null);
    setDismissed(false);
    turnOff();
  };
  const pick = (name: string) => {
    setAsked({ query: name, picked: name });
    setHighlighted(null);
    setDismissed(false);
    turnOff();
    // Dismiss the touch keyboard to reveal the answer; otherwise return focus
    // to the input when the selected suggestion disappears.
    if (window.matchMedia?.("(pointer: coarse)").matches) {
      searchRef.current?.blur();
    } else {
      searchRef.current?.focus();
    }
  };

  // Typed input overrides GPS even when the postal lookup finds no match.
  const guess: MunicipalityGuess | undefined = useMemo(() => {
    if (trimmedQuery) return municipalitiesForInput(trimmedQuery);
    if (state.status === "on") return municipalitiesNear(state.at, state.accuracy);
    return undefined;
  }, [trimmedQuery, state]);

  const nameMatches = useMemo(() => {
    if (!trimmedQuery) return [];
    const needle = fold(trimmedQuery);
    return folded
      .filter(({ key }) => key.includes(needle))
      .map(({ entry }) => entry);
  }, [folded, trimmedQuery]);

  // An exact municipality name comes first, followed by postal matches.
  // Keep both: Križevci municipality and postal district are different places.
  const matches = useMemo(() => {
    if (!guess) return nameMatches;
    const typed = fold(trimmedQuery);
    const exact = nameMatches.find((entry) => fold(entry.name) === typed);
    const guessed = guess.municipalities.flatMap(
      (name) => byName.get(name) ?? [],
    );
    return exact
      ? [exact, ...guessed.filter((entry) => entry.name !== exact.name)]
      : guessed;
  }, [byName, guess, nameMatches, trimmedQuery]);

  // Postal centroids do not establish municipal boundaries, and the device
  // may be somewhere other than where the animal was found. Even a single
  // GPS suggestion needs the reader's confirmation before naming a shelter.
  const fromDevice = !trimmedQuery && state.status === "on";
  const active =
    (picked ? byName.get(picked) : undefined) ??
    (!fromDevice && matches.length === 1 && !guess?.requiresConfirmation
      ? matches[0]
      : undefined);

  const suggestions = matches.slice(0, MAX_MATCHES);
  const showDeviceSuggestions = fromDevice && !active && matches.length > 0;
  const showSuggestions = !fromDevice && !dismissed && !active && matches.length > 0;
  const showChoices = showSuggestions || showDeviceSuggestions;
  const highlightedIndex = suggestions.findIndex(
    (entry) => entry.name === highlighted,
  );

  useEffect(() => {
    if (!showSuggestions || highlightedIndex < 0) return;
    // aria-activedescendant keeps focus in the input; scroll its option
    // into view explicitly when the phone keyboard leaves little room.
    const option = listRef.current?.children[highlightedIndex]?.firstElementChild;
    option?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [highlightedIndex, showSuggestions]);
  const noMatch =
    trimmedQuery && !guess && nameMatches.length === 0
      ? postcodeQuery
        ? messages.muniPostcodeNotFound
        : `${messages.muniNoMatch} »${trimmedQuery}«`
      : "";

  // The current answer travels with reloads, copied links and language
  // changes. Replace both legacy place keys, preserving unrelated params.
  // A chosen municipality is saved by name, even when a partial query or
  // device position produced it. Do not rewrite an untouched incoming link.
  useEffect(() => {
    if (asked === null) return;
    const place = active?.name ?? trimmedQuery;
    const own = new URLSearchParams();
    // An ambiguous search is not a confirmed municipality. Saving it as
    // kraj would silently pick an exact name on reload (e.g. Križevci).
    if (place) own.set(FOUND_ANIMAL_PLACE_PARAMS[active ? 0 : 1], place);
    const merged = mergeOwnedParams(
      linked,
      FOUND_ANIMAL_PLACE_PARAMS,
      own.toString(),
    );
    if (merged !== linked.replace(/^\?/, "")) commitSearch(merged, "replace");
  }, [active, asked, linked, trimmedQuery]);

  // Without recorded coverage, lead with the nearest shelter that can be called.
  const hero =
    active?.coverage.length === 0
      ? active.nearest.find((shelter) => shelter.phone || shelter.onCallPhone)
      : undefined;
  const heroPhone = hero?.phone || hero?.onCallPhone;
  const others = active
    ? active.nearest.filter((shelter) => shelter.shelterId !== hero?.shelterId)
    : [];
  // Only shelters with a number belong under the "try another call" heading.
  const callable = others.flatMap((shelter) => {
    const number = shelter.phone || shelter.onCallPhone;
    return number ? [{ shelter, number, onCall: !shelter.phone }] : [];
  });
  const withoutPhone = others.filter(
    (shelter) => !shelter.phone && !shelter.onCallPhone,
  );

  // The heading and map must reflect any unconfirmed coverage source.
  const confirmed = active
    ? active.coverage.every((coverage) => coverage.confirmed)
    : true;

  useEffect(() => {
    if (!active) {
      onAnswer(null);
      return;
    }
    const verified = active.coverage.length > 0;
    const shelters = verified
      ? active.coverage.map((coverage) => coverage.shelterId)
      : active.nearest.map((shelter) => shelter.shelterId);
    onAnswer({
      municipality: active.name,
      shelters,
      spotlight: verified ? shelters : hero ? [hero.shelterId] : [],
      verified,
      confirmed,
    });
  }, [active, confirmed, hero, onAnswer]);

  // Hide the location label when the field needs room for input or the GPS hint.
  const labelledLocation = query === "" && state.status !== "on";
  const locationLabel = labelledLocation
    ? messages.muniHereActive
    : messages.muniHere;

  return (
    <div>
      <div>
        <Label htmlFor={searchId} className="mb-2 block leading-normal">
          {messages.muniSearchLabel}
        </Label>
        <div className="relative @container/finder-field">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            ref={searchRef}
            type="search"
            inputMode="text"
            enterKeyHint="search"
            role="combobox"
            autoComplete="off"
            maxLength={MAX_QUERY_LENGTH}
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? listId : undefined}
            aria-activedescendant={
              showSuggestions && highlightedIndex >= 0
                ? `${listId}-${highlightedIndex}`
                : undefined
            }
            aria-describedby={`${statusId} ${keyboardHintId}`}
            value={query}
            onChange={(event) => askFor(event.target.value)}
            onFocus={() => setDismissed(false)}
            onBlur={() => {
              setDismissed(true);
              setHighlighted(null);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (
                showDeviceSuggestions &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                // GPS choices are ordinary buttons, so move focus to the
                // named confirmation instead of setting a listbox selection.
                const index = event.key === "ArrowDown" ? 0 : suggestions.length - 1;
                const choice = listRef.current?.children[index]?.firstElementChild;
                if (choice instanceof HTMLButtonElement) choice.focus();
                event.preventDefault();
                return;
              }
              if (
                !active &&
                !fromDevice &&
                suggestions.length > 0 &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                const direction = event.key === "ArrowDown" ? 1 : -1;
                const index =
                  !showSuggestions || highlightedIndex < 0
                    ? direction === 1 ? 0 : suggestions.length - 1
                    : (highlightedIndex + direction + suggestions.length) % suggestions.length;
                setHighlighted(suggestions[index].name);
                setDismissed(false);
                event.preventDefault();
                return;
              }
              if (event.key === "Escape") {
                setDismissed(true);
                setHighlighted(null);
                // Prevent the native search input from clearing the query.
                event.preventDefault();
                return;
              }
              // An ambiguous query never chooses a shelter without an
              // explicit arrow-key selection or a complete municipality name.
              if (event.key !== "Enter" || fromDevice) return;
              const typed = fold(trimmedQuery);
              const answer =
                showSuggestions && highlightedIndex >= 0
                  ? suggestions[highlightedIndex]
                  : matches.length === 1
                    ? matches[0]
                    : matches.find((entry) => fold(entry.name) === typed);
              if (!answer) return;
              pick(answer.name);
              event.preventDefault();
            }}
            placeholder={
              state.status === "on"
                ? messages.muniHereActive
                : messages.muniSearchPlaceholder
            }
            // Keep mobile text at 16px to avoid iOS focus zoom. Hide the native
            // clear button and reserve room for our clear and location controls.
            className={cn(
              // Large touch screens still need room for two 44px targets.
              "h-11 pl-9 pr-24 text-base md:text-base lg:h-10 lg:text-sm lg:pointer-fine:pr-20 [&::-webkit-search-cancel-button]:appearance-none",
              labelledLocation && FIELD_LABELLED_PADDING,
            )}
          />
          <p id={keyboardHintId} className="sr-only">
            {messages.muniKeyboard}
          </p>
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
            {query !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  askFor("");
                  searchRef.current?.focus();
                }}
                aria-label={messages.clearSearch}
                className="text-muted-foreground pointer-coarse:size-11"
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      // Let the location toggle cancel an active or pending fix;
                      // typing's turnOff would reset it before toggle reads it.
                      setAsked(NOT_ASKED);
                      setHighlighted(null);
                      setDismissed(false);
                      locate();
                    }}
                    aria-pressed={state.status === "on"}
                    // Match the visible label; announce progress only in the live region.
                    aria-label={locationLabel}
                    className={cn(
                      // Keep a 44px target even when the text label is hidden.
                      "pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                      labelledLocation && "max-lg:w-auto max-lg:gap-1.5 max-lg:px-3",
                      state.status === "on"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {state.status === "locating" ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Navigation className="size-4" aria-hidden />
                    )}
                    {labelledLocation && (
                      <span className={cn("lg:hidden", FIELD_LABEL_HIDDEN)}>
                        {messages.muniHereActive}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{locationLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {/* Keep both live regions mounted so they announce their first updates. */}
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground empty:hidden"
        >
          {state.status === "error"
            ? state.message
            : state.status === "locating"
              ? messages.locating
              : fromDevice && !guess
                ? messages.muniLocationNoMatch
                : ""}
        </p>

        <p
          id={statusId}
          aria-live="polite"
          aria-atomic="true"
          className="break-words text-sm empty:hidden"
        >
          {active ? (
            <>
              <span className="font-medium">{active.name}</span>
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {active.coverage.length === 1
                  ? messages.muniResponsible
                  : active.coverage.length > 1
                    ? messages.muniResponsiblePlural
                    : messages.muniUnverified}
                {!confirmed && <> · {messages.muniDatedShort}</>}
              </span>
            </>
          ) : fromDevice && guess ? (
            <span className="text-muted-foreground">{messages.muniLocationConfirm}</span>
          ) : noMatch || showSuggestions ? (
            <span className="text-muted-foreground">
              {noMatch || t("muniMatches", { count: matches.length })}
            </span>
          ) : null}
        </p>

        {noMatch && !postcodeQuery && (
          <p className="text-sm text-muted-foreground">{messages.muniNoMatchAdvice}</p>
        )}

        {(noMatch || (fromDevice && !guess)) && (
          <a
            href={sheltersIndexPath(locale)}
            className={cn(MUTED_LINK, "self-start underline")}
          >
            {messages.viewShelters}
          </a>
        )}

        {state.status === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {messages.muniPostcodeInstead}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={locate}
              className="h-11 lg:h-9"
            >
              <Navigation className="size-4" aria-hidden />
              {messages.retryLocation}
            </Button>
          </div>
        )}

        {guess && !active && (
          <p className="text-sm text-muted-foreground">
            {t("muniFromPostcode", { code: guess.code, name: guess.label })}
          </p>
        )}

        {showChoices && (
          <div className="space-y-1.5">
            {guess && !fromDevice && (
              <p className="text-sm text-muted-foreground">
                {guess.requiresConfirmation ? messages.muniLocationConfirm : messages.muniWhichOne}
              </p>
            )}
            <ul
              ref={listRef}
              id={listId}
              role={fromDevice ? undefined : "listbox"}
              aria-label={messages.muniSuggestions}
              className={fromDevice ? "space-y-2" : "space-y-0.5"}
            >
              {suggestions.map((entry, index) => (
                <li key={entry.name} role={fromDevice ? undefined : "presentation"}>
                  {fromDevice ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="wrap"
                      onClick={() => pick(entry.name)}
                      className={cn("w-full justify-start text-left", COARSE_ACTION)}
                    >
                      {entry.name}
                    </Button>
                  ) : (
                    <button
                      id={`${listId}-${index}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={highlightedIndex === index}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(entry.name)}
                      className={cn(
                        "flex w-full items-baseline justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 pointer-coarse:min-h-11 pointer-coarse:items-center",
                        highlightedIndex === index && "bg-muted",
                      )}
                    >
                      <span className="font-medium">{entry.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.coverage.length > 0
                          ? [
                              ...new Set(
                                entry.coverage.map((c) => c.shelterName),
                              ),
                            ].join(" · ")
                          : messages.muniUnverified}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {matches.length > MAX_MATCHES && (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                {messages.muniMoreMatches}
              </p>
            )}
          </div>
        )}

        {active &&
          (active.coverage.length > 0 ? (
            active.coverage.map((coverage) => (
              <CoverageCard
                key={`${coverage.shelterId}-${coverage.species ?? "all"}`}
                coverage={coverage}
              />
            ))
          ) : (
            // Nearby shelters are contacts for help, not verified responsible shelters.
            <Card className="space-y-3 p-4">
              {active.nearest.length > 0 && (
                <>
                  <div className="space-y-1">
                    <p className="font-medium">
                      {hero ? messages.muniNearestCall : messages.muniNearestTitle}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {messages.muniNearestNote}
                    </p>
                  </div>

                  {hero && heroPhone && (
                    <div className="space-y-3">
                      <p className="text-sm">
                        <a
                          href={hero.detailHref}
                          className={SOURCE_LINK}
                        >
                          {hero.shelterName}
                        </a>
                        <span className="block text-muted-foreground">
                          {hero.city} ·&nbsp;{t("muniDistance", { km: hero.km })}
                        </span>
                      </p>
                      <div className="space-y-2">
                        <Button asChild size="wrap" className="w-full">
                          <a href={telHref(heroPhone)}>
                            <Phone className="size-4 shrink-0" aria-hidden />
                            {t(hero.phone ? "muniCall" : "muniCallOnCall", { phone: heroPhone })}
                          </a>
                        </Button>
                        {hero.phone && hero.onCallPhone && hero.onCallPhone !== hero.phone && (
                          <Button
                            asChild
                            variant="outline"
                            size="wrap"
                            className="w-full"
                          >
                            <a href={telHref(hero.onCallPhone)}>
                              <Phone className="size-4 shrink-0" aria-hidden />
                              {t("muniCallOnCall", { phone: hero.onCallPhone })}
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {callable.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {messages.muniNearestOthers}
                      </p>
                      <ul className="@container/shortlist divide-y">
                        {callable.map(({ shelter, number, onCall }) => (
                          <NearestRow
                            key={shelter.shelterId}
                            shelter={shelter}
                          >
                            <Button
                              asChild
                              variant="outline"
                              size="wrap"
                              className="max-w-full"
                            >
                              <a href={telHref(number)}>
                                <Phone aria-hidden />
                                {onCall
                                  ? t("muniCallOnCall", { phone: number })
                                  : number}
                              </a>
                            </Button>
                          </NearestRow>
                        ))}
                      </ul>
                    </div>
                  )}

                  {withoutPhone.length > 0 && (
                    <ul className="@container/shortlist divide-y">
                      {withoutPhone.map((shelter) => (
                        <NearestRow
                          key={shelter.shelterId}
                          shelter={shelter}
                          note={messages.muniNoNumber}
                        />
                      ))}
                    </ul>
                  )}
                </>
              )}
              <p className="text-sm text-muted-foreground">
                {active.nearest.length > 0
                  ? messages.muniUnverifiedAlso
                  : messages.muniUnverifiedAdvice}
              </p>
              {active.nearest.length > 0 && (
                <p className="text-xs leading-snug text-muted-foreground">
                  {messages.muniDistanceNote}
                </p>
              )}
            </Card>
          ))}

        {/* Call and safety guidance follows Zavetišče Ljubljana's procedure:
            zavetisce-ljubljana.si/najdene-zivali/kaj-storiti-ce-najdemo-zapusceno-zival */}
        <div className="space-y-2 border-t pt-4 text-sm leading-relaxed">
          {/* Keep practical advice reachable by heading navigation even
              before a search produces a shelter. */}
          <h2 className="font-medium">{messages.muniGuidanceTitle}</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li>{messages.muniInjured}</li>
            <li>{messages.muniCallAdvice}</li>
            <li>
              {messages.muniCost}{" "}
              <a
                href={LAW_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground pointer-coarse:tap-target"
              >
                {messages.muniCostSource}
                <span className="sr-only"> {messages.newWindow}</span>
                <ExternalLink data-external className="size-3" aria-hidden />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
