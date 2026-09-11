"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import { Input } from "@/components/ui/input";
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
import type { LookupEntry } from "@/lib/municipality-coverage";
import {
  municipalitiesForInput,
  municipalitiesNear,
  type MunicipalityGuess,
} from "@/lib/municipality-lookup";
import { cn } from "@/lib/utils";

// The authority that keeps the register of shelters. It used to point at
// gov.si/teme/zascita-zivali/, which returns 404 and has no snapshot in the
// Wayback Machine, so it is unlikely to have ever resolved: the one piece of
// help offered to the 50 občine with no verified coverage was a dead link.
//
// gov.si no longer publishes the register itself at a findable address. The
// PDF it used to sit in (assets/.../REG-zavetisc-*.pdf) is gone too, and the
// site search finds no replacement, so this points at UVHVVR's own page, which
// resolves and is the office to ask. Checked 2026-09-01.
const REGISTER_URL =
  "https://www.gov.si/drzavni-organi/organi-v-sestavi/uprava-za-varno-hrano-veterinarstvo-in-varstvo-rastlin/";
const LAW_URL =
  "https://www.uradni-list.si/glasilo-uradni-list-rs/vsebina/2025-01-2342/zakon-o-spremembah-in-dopolnitvah-zakona-o-zasciti-zivali-zzziv-g";
// Enough to disambiguate any prefix without becoming a directory. The page
// this replaced listed all 212 občine; the finder answers one question.
const MAX_MATCHES = 8;

/** The question as asked: what is in the box, and which občina is settled.
 *  picked is null while several still match, or while nothing does. */
type Ask = { query: string; picked: string | null };

const NOT_ASKED: Ask = { query: "", picked: null };

// The found-animal lookup: say where the animal was found and get the shelter
// responsible for it and what to do next. The občina
// can be typed, but a postcode or the device's own position is usually faster
// and is what someone standing in the street actually has.
//
// It used to be a tab of the homepage's shelter picker and carried a "select
// this shelter as a filter" button on every answer, which only meant anything
// inside that dialog. The lookup has a page of its own now
// (found-animal-atlas.tsx) and the dialog does not host it, so the finder
// takes no selection and offers none: the coverage card links to the shelter's
// own page, which is where its animals already are.
//
// Practical guidance stays available before a location is known.
export function MunicipalityFinder({
  entries,
  onActiveShelters,
  onActiveMunicipality,
}: {
  entries: LookupEntry[];
  /** Shelter ids of the picked municipality, for the map to light up.
   *  Null when no municipality is picked. */
  onActiveShelters: (values: string[] | null) => void;
  /** Name of the picked municipality, which is the only thing that knows
   *  where the question was asked from. Null when none is picked. */
  onActiveMunicipality?: (name: string | null) => void;
}) {
  const { messages, t } = useI18n();
  // What the box holds and which občina is settled, as one value: they change
  // together every time. Typing is a new question and drops the pick, and a
  // pick keeps the text that produced it, so two useStates only ever risked
  // being written apart.
  //
  // Null means the visitor has not asked yet, and the link decides; anything
  // else is theirs and outranks it. That is what lets the seed below be
  // derived rather than assigned from an effect.
  const [asked, setAsked] = useState<Ask | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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

  // Every občina name folded once, rather than all 212 of them folded again
  // on every keystroke. entries arrives from the server and never changes
  // identity, so this is a constant the search was recomputing per character.
  const folded = useMemo(
    () => entries.map((entry) => ({ entry, key: fold(entry.name) })),
    [entries],
  );

  // What a link asked for, if anything: /najdena-zival?kraj=Ptuj or
  // ?posta=2250, so an občina's website or a post in a group can point at an
  // answer rather than an empty box.
  //
  // Read through lib/location-search, which is this app's answer to reading
  // the query under output: export. useSyncExternalStore is what makes it a
  // derived value rather than an effect that writes state on mount: the
  // prerendered HTML carries no query, the server snapshot is "", and the
  // client snapshot arrives at hydration without a mismatch. Deriving it also
  // means a link reached with back or forward is read again.
  //
  // A name spelled in full is a pick, which is what a link from that občina
  // is; anything else is left to the ordinary lookup below, so a postcode
  // covering several občine still asks which one.
  const linked = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const seed = useMemo<Ask>(() => {
    const params = new URLSearchParams(linked);
    const municipality = params.get(FOUND_ANIMAL_PLACE_PARAMS[0])?.trim();
    const place = municipality || params.get(FOUND_ANIMAL_PLACE_PARAMS[1])?.trim();
    if (!place) return NOT_ASKED;
    const needle = fold(place);
    const exact = folded.find(({ key }) => key === needle);
    return { query: place, picked: municipality && exact ? exact.entry.name : null };
  }, [folded, linked]);

  // The visitor's own question once there is one, the link's until then.
  const { query, picked } = asked ?? seed;

  // Typing, clearing and asking the device are all the same move: a new
  // question, with nothing settled yet.
  const askFor = (next: string) => {
    setAsked({ query: next, picked: null });
    setHighlighted(null);
    setDismissed(false);
    turnOff();
  };
  const pick = (name: string) => {
    setAsked({ query: name, picked: name });
    setHighlighted(null);
    setDismissed(false);
    turnOff();
    searchRef.current?.focus();
  };

  // A postcode or town in the box, and the device's position, both answer
  // "which občina" through the same postal table. What was typed wins: it is
  // the newer statement of where the animal was found.
  //
  // It wins even when the postal table cannot place it. Falling through to the
  // fix in that case is how someone who had pressed "use my location" in
  // Ljubljana and then typed "Kungota" was shown Ljubljana's shelter: no
  // postal district is named Kungota, so the typed lookup came back empty and
  // the device answered a question it had not been asked. Twenty-six občine
  // have no postal district of their own name, and every one of them was
  // answered with wherever the reader happened to be standing.
  const guess: MunicipalityGuess | undefined = useMemo(() => {
    if (query.trim()) return municipalitiesForInput(query);
    if (state.status === "on") return municipalitiesNear(state.at);
    return undefined;
  }, [query, state]);

  // Names typed directly, for people who do know their občina.
  const nameMatches = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const needle = fold(trimmed);
    return folded
      .filter(({ key }) => key.includes(needle))
      .map(({ entry }) => entry);
  }, [folded, query]);

  // With no guess the name search decides on its own. With one, the občine the
  // guess resolved to are offered together with the občina whose name was
  // typed out in full, deduped by name.
  //
  // Both halves are needed because a postal district and an občina can carry
  // the same name in different corners of the country. "Križevci" is postal
  // district 9206 in Goričko, whose občine are Gornji Petrovci, Šalovci and
  // Moravske Toplice, and it is also Občina Križevci near Ljutomer, 30 km
  // south. Taking the guess alone asked the reader "which of these three" and
  // left the one they had spelled out off the list entirely.
  //
  // The exact name comes first: spelling an občina in full is the most
  // deliberate thing the box takes. Where the guess and the name agree, which
  // is the ordinary case, the dedupe leaves a single entry and the answer
  // still resolves without a pick.
  const matches = useMemo(() => {
    if (!guess) return nameMatches;
    const typed = fold(query.trim());
    // Names are unique, so an exact match is one entry or none, and that is
    // the whole of the dedupe: drop it from the guess and put it in front.
    const exact = nameMatches.find((entry) => fold(entry.name) === typed);
    const guessed = guess.municipalities.flatMap(
      (name) => byName.get(name) ?? [],
    );
    return exact
      ? [exact, ...guessed.filter((entry) => entry.name !== exact.name)]
      : guessed;
  }, [byName, guess, nameMatches, query]);

  const active =
    (picked ? byName.get(picked) : undefined) ??
    (matches.length === 1 ? matches[0] : undefined);

  const suggestions = matches.slice(0, MAX_MATCHES);
  const showSuggestions = !dismissed && !active && matches.length > 1;
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
    query.trim() && !guess && nameMatches.length === 0
      ? looksLikePostcode(query) || /^\d+$/.test(query.trim())
        ? messages.postcodeNotFound
        : `${messages.muniNoMatch} »${query.trim()}«`
      : "";

  // The current answer travels with reloads, copied links and language
  // changes. Replace both legacy place keys, preserving unrelated params.
  // A chosen municipality is saved by name, even when a partial query or
  // device position produced it. Do not rewrite an untouched incoming link.
  useEffect(() => {
    if (asked === null) return;
    const place = active?.name ?? query.trim();
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
  }, [active, asked, linked, query]);

  useEffect(() => {
    onActiveShelters(
      active ? active.coverage.map((coverage) => coverage.shelterId) : null,
    );
    onActiveMunicipality?.(active ? active.name : null);
  }, [active, onActiveMunicipality, onActiveShelters]);

  // Both trailing controls start a new question; they differ by where they
  // send it next.
  const clearQuery = () => askFor("");

  return (
    <div>
      <div>
        {/* No label over the box: the page's h1 has asked the question, and
            the placeholder says what the box takes. The field keeps its name
            for screen readers from aria-label below. */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            type="search"
            role="combobox"
            autoComplete="off"
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
            // A new search is a new question, so askFor drops the old pick:
            // it would otherwise sit on top of its answer.
            onChange={(event) => askFor(event.target.value)}
            onFocus={() => setDismissed(false)}
            onBlur={() => {
              setDismissed(true);
              setHighlighted(null);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (
                !active &&
                suggestions.length > 1 &&
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
              if (event.key !== "Enter") return;
              const typed = fold(query.trim());
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
            // While the device's position is the answer the empty field says
            // so, in the placeholder's weight: a state, not something typed.
            placeholder={
              state.status === "on" ? messages.muniHereActive : messages.muniSearch
            }
            aria-label={messages.muniSearch}
            // 44px tall below lg, the touch target the shelter picker's own
            // fields keep. text-base and not text-sm at that size: iOS Safari
            // zooms the whole page when a focused input sets type under 16px,
            // and the map is beside this field, so a zoom is a map nobody can
            // aim at. At lg it is a full-size field and not the dialog's
            // compact h-8: this is the one control on the page.
            //
            // Room on the right for the two trailing controls, and Chrome's
            // own clear button on a search field switched off: it drew a
            // second X under ours.
            className="h-11 pl-9 pr-24 text-base md:text-base lg:h-10 lg:pr-20 lg:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          <p id={keyboardHintId} className="sr-only">
            {messages.muniKeyboard}
          </p>
          {/* The field's trailing controls, in the order they are worth
              reaching for: clear what was typed, then ask the device instead.
              The location button lives in the field because it is another way
              of filling it and not a separate step; as a text link under the
              box it read as a footnote. Icon only, named for screen readers
              and in a tooltip: the arrow is the glyph every map app uses for
              the same thing, and the pressed state plus the placeholder say
              when it is the answer. Below lg each is its own 44px target. */}
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
            {query !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  clearQuery();
                  searchRef.current?.focus();
                }}
                aria-label={messages.clearSearch}
                className="text-muted-foreground max-lg:size-11"
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
            {/* The name was drawn on hover by a title, which a keyboard never
                reaches. The tooltip opens on focus too, and says whatever the
                accessible name says, so the two can never disagree. */}
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
                    aria-label={
                      state.status === "locating" ? messages.locating : messages.muniHere
                    }
                    className={cn(
                      "max-lg:size-11",
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
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {state.status === "locating" ? messages.locating : messages.muniHere}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {/* A denied or timed-out fix used to be a dead end: one sentence and
            nothing to press. Both ways out are here now, in the order they are
            worth trying: ask again, or stop asking and type the postcode,
            which is the answer somebody standing in the street already has. */}
        {/* The sentence itself, said out loud as well as drawn. A denied or
            timed-out fix is the answer to a button somebody pressed, and it
            arrives in a panel they are not necessarily looking at; the shelter
            tab announces its own geolocation errors for the same reason (see
            the status line under the place field in location-picker.tsx).

            Mounted whether or not there is anything to say, which is what
            makes it announce at all: a live region inserted together with its
            first message is a region nothing was watching when the message
            arrived. empty:hidden takes the paragraph's own box away in the
            ordinary case, so an empty region costs the panel no room. The two
            ways out below stay conditional, because they are furniture rather
            than news. */}
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground empty:hidden"
        >
          {state.status === "error" ? state.message : ""}
        </p>

        {/* The answer's heading, and the finder's one announcement: the
            občina in the foreground weight, what the card under it is in the
            muted one. Mounted whether or not there is an answer, for the same
            reason as the status line above: a live region that appears
            together with its first message is one nothing was listening to.
            Sighted readers see the card appear; without this line a screen
            reader typing a postcode heard nothing happen. */}
        <p
          id={statusId}
          aria-live="polite"
          aria-atomic="true"
          className="text-sm empty:hidden"
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
              </span>
            </>
          ) : noMatch || showSuggestions ? (
            <span className="text-muted-foreground">
              {noMatch || (showSuggestions ? t("muniMatches", { count: matches.length }) : "")}
            </span>
          ) : null}
        </p>

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

        {/* Shows its work while there is still a choice to make: which postal
            district the občine on the list came from. Once one of them is the
            answer, its name at the head of the answer says it. */}
        {guess && !active && (
          <p className="text-sm text-muted-foreground">
            {t("muniFromPostcode", { code: guess.code, name: guess.label })}
          </p>
        )}

        {showSuggestions && (
          <div className="space-y-1.5">
            {guess && (
              <p className="text-sm text-muted-foreground">
                {messages.muniWhichOne}
              </p>
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={messages.muniSuggestions}
              className="space-y-0.5"
            >
              {suggestions.map((entry, index) => (
                <li key={entry.name} role="presentation">
                  <button
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={highlightedIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(entry.name)}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 max-lg:min-h-11 max-lg:items-center",
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
            <div className="space-y-3">
                <div className="space-y-1.5 rounded-ui border border-dashed p-4 text-sm text-muted-foreground">
                  <p>{messages.muniUnverifiedAdvice}</p>
                  <a
                    href={REGISTER_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-foreground"
                  >
                    {messages.muniRegister}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>

                {/* Not an answer, but better than none: somewhere to call. */}
                {active.nearest.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">
                      {messages.muniNearestTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {messages.muniNearestNote}
                    </p>
                    <ul className="space-y-0.5 pt-0.5">
                      {active.nearest.map((shelter) => (
                        <li
                          key={shelter.shelterId}
                          className="flex items-center justify-between gap-2 rounded-ui px-2 py-1.5 text-sm"
                        >
                          <span className="min-w-0">
                            <a
                              href={shelter.detailHref}
                              className="block truncate underline-offset-4 hover:underline"
                            >
                              {shelter.shelterName}
                            </a>
                            <span className="block truncate text-xs text-muted-foreground">
                              {shelter.city} · {shelter.km} km
                            </span>
                          </span>
                          {shelter.phone && (
                            <a
                              href={telHref(shelter.phone)}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-ui border px-2.5 py-1 text-sm transition-colors hover:bg-muted max-lg:min-h-11 max-lg:px-3"
                            >
                              <Phone className="size-3.5" aria-hidden />
                              {shelter.phone}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ))}

        {/* The guidance, under whatever the search has answered, in the
            muted weight: the card above it is the answer, this is what goes
            with it. Three sentences: what not to do, what to say, who pays.
            Call and safety guidance follows Zavetišče Ljubljana's procedure
            (zavetisce-ljubljana.si/najdene-zivali/kaj-storiti-ce-najdemo-
            zapusceno-zival). The list used to end with the emergency numbers
            112 and 113; a found animal is a call to the shelter, not to
            either, so they are gone. */}
        <ul className="space-y-2 border-t pt-4 text-sm leading-relaxed text-muted-foreground">
          <li>{messages.muniInjured}</li>
          <li>{messages.muniCallAdvice}</li>
          <li>
            {messages.muniCost}{" "}
            <a
              href={LAW_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
            >
              {messages.muniCostSource}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
