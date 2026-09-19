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
import { SOURCE_LINK } from "@/lib/link-styles";
import { sheltersIndexPath } from "@/lib/shelter-path";
import { MUTED_LINK } from "@/lib/link-styles";

const LAW_URL =
  "https://www.uradni-list.si/glasilo-uradni-list-rs/vsebina/2025-01-2342/zakon-o-spremembah-in-dopolnitvah-zakona-o-zasciti-zivali-zzziv-g";
// Enough to disambiguate any prefix without becoming a directory. The page
// this replaced listed all 212 občine; the finder answers one question.
const MAX_MATCHES = 8;

/**
 * How wide the search field has to be before the location button can draw its
 * name beside the arrow.
 *
 * Measured off the built page. The field spends 2.25rem on the leading glyph,
 * 0.25rem on the trailing inset and 8.46rem on the labelled button, and the
 * Slovenian placeholder "Občina ali pošta" wants 7.59rem, so the field needs
 * 18.55rem before the two stop fighting. Under it the placeholder was cut
 * mid-word: at 320px it read "Občina ali poš".
 *
 * A container query and not a width breakpoint, because the field runs out of
 * room two ways. At 320px the window is narrow; at 375px with the browser's
 * text at 125% the window is fine and the button has grown, and a media query
 * cannot see the second one at all: its rem resolves against the initial font
 * size, where a container query's follows the root. Measured both, which is
 * what the 19rem is: 320px gives the field 18rem, 360px gives it 20.5rem, and
 * 375px at 125% text gives it 16.75rem.
 *
 * Written out whole, the way map-marker.tsx writes PLATE_TOO_SMALL: Tailwind
 * scans source text for complete class names, so a variant assembled from
 * pieces at runtime compiles to nothing at all.
 */
const FIELD_LABEL_HIDDEN = "@max-[19rem]/finder-field:hidden";
const FIELD_LABELLED_PADDING = "@min-[19rem]/finder-field:max-lg:pr-36";

/**
 * How wide the answer card has to be before a shortlist row can hold a name
 * and a number button side by side.
 *
 * Same measurement, same reason. At 375px the card gives a row 19.31rem and
 * the name sits on one line with the town and the distance under it; at 360px
 * (18.38rem) the town wraps, at 320px (15.88rem) the name wraps too, and at
 * 375px with 125% text (15.05rem) the distance was left alone on a third line
 * behind its separator. Under the threshold the row stacks instead.
 */
const ROW_STACKED =
  "@max-[19rem]/shortlist:flex-col @max-[19rem]/shortlist:items-start";

/** The question as asked: what is in the box, and which občina is settled.
 *  picked is null while several still match, or while nothing does. */
type Ask = { query: string; picked: string | null };

const NOT_ASKED: Ask = { query: "", picked: null };

/** One shelter on the shortlist under the first call: who it is, where it is
 *  and how far, and then whatever can be done with it. The trailing control
 *  comes from the caller, because half of these rows have a number to press;
 *  the other half have to say that there is none, and say it under the town
 *  as a third line, where a note reads as a fact about the shelter. Drawn on
 *  the right in the button's place it read as a control that failed, and at
 *  375px it squeezed the name into two lines beside it.
 *
 *  Side by side only while the card is wide enough to hold both. Under
 *  ROW_STACKED's threshold the row stacks: the shelter, then the button under
 *  it. The column left beside the button at 320px was 116px, which broke
 *  "Zavetišče Mala hiša" over two lines and then pushed "· 29 km" onto a line
 *  of its own behind its separator. */
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
/** What the finder settled on, for the map to draw. Null while no občina is
 *  picked. */
export type FinderAnswer = {
  /** Where the question was asked from, by the register's name. */
  municipality: string;
  /** The shelters the map keeps bright: the responsible ones, or, where none
   *  is on record, the nearest shortlist. */
  shelters: string[];
  /** The ones to ring and name: the responsible ones, or the nearest with a
   *  number, which is the one the card tells the reader to call. */
  spotlight: string[];
  /** Whether shelters are on record for the občina. Decides what the ring's
   *  callout calls them. */
  verified: boolean;
  /** Whether every source behind that record is confirmed. Bled's coverage
   *  comes from an unconfirmed 2023 list, and the map used to name its
   *  shelter as responsible in the same words as Ptuj's, which is checked.
   *  Vacuously true where there is no coverage at all: what is unverified
   *  there is the responsibility, which `verified` already says. */
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
    // A pick is the end of the typing, and where the typing was done with a
    // software keyboard that keyboard is standing over the answer the pick
    // just produced. So the field gives the focus up there instead of taking
    // it back. With a pointer there is nothing in the way and the field is
    // where the visitor was: the list they were arrowing through has gone,
    // and focus goes with it if nothing catches it. matchMedia is optional
    // because this runs in the click handler of a component that is rendered
    // under jsdom as well as in a browser.
    if (window.matchMedia?.("(pointer: coarse)").matches) {
      searchRef.current?.blur();
    } else {
      searchRef.current?.focus();
    }
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
    if (state.status === "on") return municipalitiesNear(state.at, state.accuracy);
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
    (matches.length === 1 && !guess?.requiresConfirmation ? matches[0] : undefined);

  const suggestions = matches.slice(0, MAX_MATCHES);
  const showSuggestions = !dismissed && !active && matches.length > 0;
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
        ? messages.muniPostcodeNotFound
        : `${messages.muniNoMatch} »${query.trim()}«`
      : state.status === "on" && !guess
        ? messages.muniLocationUnmatched
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

  // Where no shelter is on record, the nearest one with a number: the card's
  // one primary call, and the shelter the map rings. Two of the register's
  // seventeen shelters have no phone, so the nearest is not always it, and
  // a hero without a button would be a heading that says "call" over
  // nothing to press.
  const hero = useMemo(
    () =>
      active && active.coverage.length === 0
        ? active.nearest.find(
            (shelter): shelter is NearbyShelter & { phone: string } =>
              Boolean(shelter.phone),
          )
        : undefined,
    [active],
  );
  const others = active
    ? active.nearest.filter((shelter) => shelter.shelterId !== hero?.shelterId)
    : [];
  // The rest of the shortlist, in two groups. "Če se ne oglasijo" is an
  // instruction, and an instruction has to be followable: only the shelters
  // with a number belong under it. The others are still worth naming, because
  // a shelter 21 km away is the one an občina is likeliest to be under
  // contract with, but what they offer is a page and not a call.
  // A row offers the main number, or the dežurna one where the register holds
  // only that. No shelter in the register is in the second case today, but a
  // row that has a number to dial and draws no button would be the bug this
  // whole card was rebuilt to remove.
  const callable = others.flatMap((shelter) => {
    const number = shelter.phone ?? shelter.onCallPhone;
    return number ? [{ shelter, number, onCall: !shelter.phone }] : [];
  });
  const unlisted = others.filter(
    (shelter) => !shelter.phone && !shelter.onCallPhone,
  );

  // Whether the record behind the answer is confirmed, for the line under the
  // box and for the map's callout. One unconfirmed row is enough: the card
  // cites its sources one by one, but the line over it speaks for all of
  // them at once and cannot claim more than the weakest.
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

  // Both trailing controls start a new question; they differ by where they
  // send it next.
  const clearQuery = () => askFor("");

  // Whether the location button draws its name beside the arrow. Only below
  // lg, and only while there is nothing in the box: once something is typed
  // the clear X is beside it and the two of them together would leave the
  // field no room to show what was typed. It also stands down once the fix is
  // the answer, because the placeholder then says "Moja lokacija" in the
  // field itself and the button would be the same two words again.
  const labelledLocation = query === "" && state.status !== "on";

  return (
    <div>
      <div>
        {/* No label over the box: the page's h1 has asked the question, and
            the placeholder says what the box takes. The field keeps its name
            for screen readers from aria-label below. */}
        {/* A size container, so the button inside can ask how much of the
            field is left rather than how wide the window is. */}
        <div className="relative @container/finder-field">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            type="search"
            // What the phone keyboard opens as and what its return key says,
            // the same two the picker's twin field sets (picker-search.tsx).
            // The box takes an obcina name or a postcode, so the keyboard is
            // the text one and not the number pad.
            inputMode="text"
            enterKeyHint="search"
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
            // Otherwise the short hint, because the full name of the field
            // does not fit inside it on a phone; the name itself is spoken
            // from aria-label below, where there is no width to run out of.
            placeholder={
              state.status === "on"
                ? messages.muniHereActive
                : messages.muniSearchPlaceholder
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
            // second X under ours. While the location button carries its
            // name below lg it is wider than the two icons together, and the
            // hint has to stop before it rather than run under it.
            //
            // Only while the name is actually drawn. Under the threshold the
            // button is back to a square and the base pr-24 is the room it
            // needs; the wider padding there was what cut the placeholder
            // short of its own field.
            className={cn(
              // The narrower padding belongs to the fine pointer alone, rather
              // than to lg with the coarse case restoring the base value: the
              // two trailing buttons are 44px on a touch tablet where the
              // desktop row gives them 32, and 80px of padding does not hold
              // both, so the placeholder ran under them at 1180 with a coarse
              // pointer. Stated once, the base cannot drift from its exception.
              "h-11 pl-9 pr-24 text-base md:text-base lg:h-10 lg:text-sm lg:pointer-fine:pr-20 [&::-webkit-search-cancel-button]:appearance-none",
              labelledLocation && FIELD_LABELLED_PADDING,
            )}
          />
          <p id={keyboardHintId} className="sr-only">
            {messages.muniKeyboard}
          </p>
          {/* The field's trailing controls, in the order they are worth
              reaching for: clear what was typed, then ask the device instead.
              The location button lives in the field because it is another way
              of filling it and not a separate step; as a text link under the
              box it read as a footnote. Named for screen readers and in a
              tooltip, and below lg in the button itself while the box is
              empty: a tooltip opens on hover and on focus, and a thumb does
              neither, so on the device this page is most often opened on the
              arrow was a control with no name at all. The pressed state and
              the placeholder say when it is the answer. Below lg each is its
              own 44px target. */}
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
                className="text-muted-foreground pointer-coarse:size-11"
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
                    // The name follows the label while the label is drawn:
                    // a control whose visible text is not in its accessible
                    // name fails the reader who says what they see. Icon
                    // alone, it keeps the fuller name.
                    aria-label={
                      state.status === "locating"
                        ? messages.locating
                        : labelledLocation
                          ? messages.muniHereActive
                          : messages.muniHere
                    }
                    // min-w-11 is what makes the collapse under the
                    // threshold land on a square: with the name hidden
                    // the button is down to its padding and its arrow, which
                    // is 40px, and the one control a thumb reaches for on
                    // this page cannot be under 44.
                    className={cn(
                      // The shape is the label's business and stays on the
                      // width that draws it; the 44 is the finger's and asks
                      // the pointer. min-w-11 keeps the icon-only collapse on
                      // a square rather than the 40px its padding and arrow
                      // come to.
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
                    {/* The name, drawn where a tooltip cannot be reached.
                        It stays the same two words while the fix is being
                        found, so the control does not change width under
                        the thumb that has just pressed it.

                        And only where the field can spare the width for it:
                        under the threshold the placeholder and the name were
                        sharing 288px and the placeholder lost. The
                        accessible name is the short one either way, which is
                        the rule kept rather than broken: what the button says
                        out loud never contradicts what it shows, and with
                        nothing shown there is nothing to contradict. */}
                    {labelledLocation && (
                      <span className={cn("lg:hidden", FIELD_LABEL_HIDDEN)}>
                        {messages.muniHereActive}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {state.status === "locating"
                    ? messages.locating
                    : labelledLocation
                      ? messages.muniHereActive
                      : messages.muniHere}
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
                {/* What the noun before it rests on, where that is an
                    unconfirmed list. Only the card's 12px source line said
                    so, under the shelter's address and website. */}
                {!confirmed && <> · {messages.muniDatedShort}</>}
              </span>
            </>
          ) : noMatch || showSuggestions ? (
            <span className="text-muted-foreground">
              {noMatch || (showSuggestions ? t("muniMatches", { count: matches.length }) : "")}
            </span>
          ) : null}
        </p>

        {noMatch && (
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
                {guess.requiresConfirmation ? messages.muniLocationConfirm : messages.muniWhichOne}
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
            // No verified shelter: the answer is a card all the same, on the
            // coverage card's surface, so both states of the one question
            // look like the same thing. It used to be a dashed box of muted
            // advice with the nearest shelters loose under it, and on a phone
            // nothing in it outranked anything else.
            //
            // The nearest shelters lead, because a number to dial is what
            // somebody standing over an animal can act on, and a shelter
            // knows whose contract an občina is under. The registry's rule,
            // that none of them is offered as responsible, is kept by the
            // line over the card, which says the responsibility is not
            // verified, and by the note under the heading, which asks the
            // shelter who collects the animal rather than telling the reader
            // it is them. The občina is the last resort, under the list.
            //
            // The block used to open with a link to UVHVVR, the office that
            // keeps the register of shelters. gov.si publishes no list at any
            // address (checked 2026-09-01), so the link led to an office's
            // homepage: the one thing on the answer nobody could act on.
            <Card className="space-y-3 p-4">
              {active.nearest.length > 0 && (
                <>
                  <div className="space-y-1">
                    {/* The heading is the action, and the shelter under it
                        is the one to take it with, so it only says "call"
                        when there is a number to call. */}
                    <p className="font-medium">
                      {hero ? messages.muniNearestCall : messages.muniNearestTitle}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {messages.muniNearestNote}
                    </p>
                  </div>

                  {/* One primary call, in the coverage card's own shape, so
                      the answer looks the same whether or not a shelter is
                      on record: the name, where it is and how far, and the
                      button. The rest of the shortlist is the fallback and
                      is drawn as one, under a label that says when to use
                      it. Three equal rows with three equal buttons had no
                      first call in them. */}
                  {hero && (
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
                      {/* 44px tall below lg, like the pills under it: the
                          one call on the card cannot be its smallest
                          target. The coverage card keeps the same height,
                          and the same second button for the hours the first
                          number is not answered. */}
                      <div className="space-y-2">
                        <Button asChild className="w-full pointer-coarse:h-11">
                          <a href={telHref(hero.phone)}>
                            <Phone className="size-4 shrink-0" aria-hidden />
                            {t("muniCall", { phone: hero.phone })}
                          </a>
                        </Button>
                        {hero.onCallPhone && (
                          <Button
                            asChild
                            variant="outline"
                            className="w-full pointer-coarse:h-11"
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
                            {/* The number is the control here too, and its
                                label is the number itself: a phone borrowed
                                to make the call needs it read out. A dežurna
                                number says which kind it is, because it is
                                not the one to try first. 44px tall below
                                lg. */}
                            <Button
                              asChild
                              variant="outline"
                              className="pointer-coarse:h-11"
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

                  {/* After the group that can be rung, because nothing here
                      answers "če se ne oglasijo". The row stays a row: the
                      name links to the shelter's page, which carries whatever
                      else the register holds, and a line under the town says
                      why there is no button. */}
                  {unlisted.length > 0 && (
                    <ul className="@container/shortlist divide-y">
                      {unlisted.map((shelter) => (
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
              {/* What kind of kilometres the rows above show, once, in the
                  coverage card's source-line weight. */}
              {active.nearest.length > 0 && (
                <p className="text-xs leading-snug text-muted-foreground">
                  {messages.muniDistanceNote}
                </p>
              )}
            </Card>
          ))}

        {/* The guidance, under whatever the search has answered, its
            sentences in the muted weight: the card above it is the answer,
            this is what goes with it. Three sentences under a heading that
            says when they apply: what not to do, what to say, who pays.
            Call and safety guidance follows Zavetišče Ljubljana's procedure
            (zavetisce-ljubljana.si/najdene-zivali/kaj-storiti-ce-najdemo-
            zapusceno-zival). The list used to end with the emergency numbers
            112 and 113; a found animal is a call to the shelter, not to
            either, so they are gone. */}
        <div className="space-y-2 border-t pt-4 text-sm leading-relaxed">
          {/* The set's name. Under the answer card these three sat as three
              more muted lines with nothing over them, so on a phone they read
              as small print the card had trailed off into. A p and not an h2:
              the answer above is headed by a p as well, and a page whose one
              h2 is the advice under the answer describes an outline the page
              does not have. */}
          <p className="font-medium">{messages.muniGuidanceTitle}</p>
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
                {/* The mark is drawn for everyone who can see it; the
                    sentence is for everyone who cannot. The card above says
                    it the same way, so this flow announces its outbound links
                    one way rather than three. */}
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
