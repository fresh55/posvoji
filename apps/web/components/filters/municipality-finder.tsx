"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Navigation, Search, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
  AnswerSteps,
  CostNote,
  CoverageLine,
  coverageCardText,
  coverageLabel,
  NoCoverageAnswer,
} from "@/components/municipality-answer";
import { CoverageCard } from "@/components/municipality-coverage-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNearby } from "@/hooks/use-nearby";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { municipalityPath } from "@/lib/municipality-path";
import {
  municipalitiesForInput,
  municipalitiesNear,
  type MunicipalityGuess,
} from "@/lib/municipality-lookup";
import { cn } from "@/lib/utils";

// Diacritic folding shared with the shelter search: "sencur" finds Šenčur.
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Enough to disambiguate any prefix without becoming a directory. The page
// this replaced listed all 212 občine; the dialog answers one question.
const MAX_MATCHES = 8;

// Tap-to-try examples for the empty state, so the box teaches its own input
// instead of leaving a blank field to guess at. One obvious capital, one from
// the northeast, one on the coast: three taps also say the lookup covers the
// whole country, not just Ljubljana. Names, not translations, since a
// municipality is called the same thing in both locales. Each one resolves to
// exactly one entry with real coverage; see municipality-finder.test.tsx.
const EXAMPLE_MUNICIPALITIES = ["Ljubljana", "Maribor", "Koper"];

// The municipality mode of the shelter picker: say where the animal was found
// and get the shelter responsible for it, what it costs (nothing), and what to
// do next. The občina can be typed, but a postcode or the device's own position
// is usually faster and is what someone standing in the street actually has.
export function MunicipalityFinder({
  entries,
  selectableIds,
  selected,
  onToggle,
  onActiveShelters,
  onActiveMunicipality,
  reflectUrl = false,
}: {
  entries: LookupEntry[];
  /** Shelter ids that exist as filter options, i.e. can be selected. */
  selectableIds: Set<string>;
  selected: string[];
  onToggle: (value: string) => void;
  /** Shelter ids of the picked municipality, for the map to light up.
   *  Null when no municipality is picked. */
  onActiveShelters: (values: string[] | null) => void;
  /** Name of the picked municipality, which is the only thing that knows
   *  where the question was asked from. Null when none is picked. */
  onActiveMunicipality?: (name: string | null) => void;
  /**
   * Write the resolved municipality into the address bar, as the path of the
   * static page that holds the same answer.
   *
   * Only the standalone found-animal page sets it, and only that page can:
   * this component is also the picker dialog's municipality tab, where the
   * address belongs to the homepage underneath and carries the filter state
   * that lib/location-search.ts owns. Overwriting it there would drop the
   * filters and leave the dialog's own /?najdena behind.
   */
  reflectUrl?: boolean;
}) {
  const { locale, messages, t } = useI18n();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const { state, toggle: locate, turnOff: stopLocating } = useNearby();

  const byName = useMemo(
    () => new Map(entries.map((entry) => [entry.name, entry])),
    [entries],
  );

  // A postcode or town in the box, and the device's position, both answer
  // "which občina" through the same postal table. What was typed wins: it is
  // the newer statement of where the animal was found.
  const guess: MunicipalityGuess | undefined = useMemo(() => {
    const typed = query.trim() ? municipalitiesForInput(query) : undefined;
    if (typed) return typed;
    if (state.status === "on") return municipalitiesNear(state.at);
    return undefined;
  }, [query, state]);

  // Names typed directly, for people who do know their občina.
  const nameMatches = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const needle = fold(trimmed);
    return entries.filter((entry) => fold(entry.name).includes(needle));
  }, [entries, query]);

  // A guess narrows to what it resolved; otherwise the name search decides.
  const matches = useMemo(() => {
    if (guess) {
      return guess.municipalities.flatMap((name) => {
        const entry = byName.get(name);
        return entry ? [entry] : [];
      });
    }
    return nameMatches;
  }, [byName, guess, nameMatches]);

  const active =
    (picked ? byName.get(picked) : undefined) ??
    (matches.length === 1 ? matches[0] : undefined);

  useEffect(() => {
    onActiveShelters(
      active ? active.coverage.map((coverage) => coverage.shelterId) : null,
    );
    onActiveMunicipality?.(active ? active.name : null);
  }, [active, onActiveMunicipality, onActiveShelters]);

  // The answer, once it exists, has an address of its own: the static page for
  // that občina, which server-renders this same shelter, the same cost
  // paragraph and the same steps. Reflecting it costs nothing at the time and
  // buys everything afterwards: a reload keeps the answer, a share sends the
  // answer rather than the empty box, and the back button leaves the page
  // instead of undoing a search nobody navigated through.
  //
  // replaceState and not a navigation. Typing must keep working exactly as it
  // does, and a router push here would tear down the input on every keystroke
  // that happens to resolve to one municipality. Next supports the native
  // history methods and keeps its own router state in step with them.
  //
  // Slovenian only, because the pages are. On the English page the address
  // stays what it was.
  useEffect(() => {
    if (!reflectUrl || locale !== "sl") return;
    const path = active
      ? municipalityPath(active.name)
      : FOUND_ANIMAL_PATHS.sl;
    // Static export serves /najdena-zival/ajdovscina and, on some hosts,
    // /najdena-zival/ajdovscina/. Both are this path; neither is a change.
    if (window.location.pathname.replace(/\/$/, "") === path) return;
    window.history.replaceState(null, "", `${path}${window.location.search}`);
  }, [active, locale, reflectUrl]);

  const cardText = coverageCardText(messages);

  const reset = () => {
    setQuery("");
    setPicked(null);
    stopLocating();
  };

  // The visible states below (resolved card, disambiguation list, "no
  // match") have no live region of their own: unlike the shelter tab beside
  // it, nothing here narrates itself to a screen reader as the query
  // changes. One sr-only status covers the three outcomes typing can reach,
  // in the same order the visible UI checks them.
  const status = active
    ? `${active.name} · ${coverageLabel(active, messages)}`
    : matches.length > 1
      ? t("muniMatchesStatus", { count: matches.length })
      : query.trim() && !guess && nameMatches.length === 0
        ? `${messages.muniNoMatch} »${query.trim()}«`
        : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // A new search is a new question; the old pick would otherwise
              // sit on top of its answer.
              setPicked(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches.length > 0) {
                setPicked(matches[0].name);
                event.preventDefault();
              }
            }}
            placeholder={messages.muniSearch}
            aria-label={messages.muniSearch}
            aria-describedby={statusId}
            // 44px tall below lg, the touch target the shelter tab's own
            // fields keep. text-base and not text-sm at that size: iOS Safari
            // zooms the whole page when a focused input sets type under 16px,
            // and this dialog is the map, so a zoom is a map nobody can aim at.
            className="h-11 pl-8 text-base lg:h-8 lg:text-sm"
          />
          <p id={statusId} aria-live="polite" className="sr-only">
            {status}
          </p>
          {query !== "" && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPicked(null);
                searchRef.current?.focus();
              }}
              aria-label={messages.clearSearch}
              // The icon stays small; below lg the button's own box grows to
              // the touch target around it, centred on the same spot.
              className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:text-foreground lg:size-6"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        {/* Quiet, and named for what it actually does: it asks the browser
            for a fix, which means a permission prompt. Same shape as the
            shelter tab's own location button, one row below its field. */}
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setPicked(null);
            locate();
          }}
          aria-pressed={state.status === "on"}
          className={cn(
            // Same 44px-below-lg rule the rest of this tab keeps.
            "mt-2 inline-flex w-fit items-center gap-1.5 rounded-ui py-0.5 text-xs transition-colors max-lg:min-h-11",
            state.status === "on"
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {state.status === "locating" ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Navigation className="size-3.5" aria-hidden />
          )}
          {state.status === "locating" ? messages.locating : messages.muniHere}
        </button>
      </div>

      {/* Scrolls at every size now: the panel this sits in is a floating card
          on md+ and a bottom sheet below it, and both have a fixed height. It
          used to ride a scrolling dialog on phones, which no longer exists. */}
      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {/* A denied or timed-out fix used to be a dead end: one sentence and
            nothing to press. Both ways out are here now, in the order they are
            worth trying: ask again, or stop asking and type the postcode,
            which is the answer somebody standing in the street already has. */}
        {state.status === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">
              {messages.muniPostcodeInstead}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={locate}
              className="h-11 gap-1.5 text-xs lg:h-7"
            >
              <Navigation className="size-3" aria-hidden />
              {messages.retryLocation}
            </Button>
          </div>
        )}

        {!query.trim() && !guess && !active && state.status !== "error" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{messages.muniHint}</p>

            {/* Fills the void this empty state used to leave below the
                explainer, and doubles as a hint about what the box takes.
                Quiet on purpose: these are a teaching aid, not a shortcut
                worth competing with the search box for attention. Tapping
                one runs the exact same path as typing it, by writing the
                same query state the input's own onChange writes. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                {messages.muniExampleLead}
              </span>
              {EXAMPLE_MUNICIPALITIES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setQuery(name);
                    setPicked(null);
                  }}
                  className="inline-flex h-6 items-center rounded-full bg-muted/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:min-h-11 max-lg:px-4"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shows its work: which postal district the občina came from. */}
        {guess && (
          <p className="text-xs text-muted-foreground">
            {t("muniFromPostcode", { code: guess.code, name: guess.label })}
          </p>
        )}

        {query.trim() && !guess && nameMatches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {messages.muniNoMatch} »{query.trim()}«
          </p>
        )}

        {!active && matches.length > 1 && (
          <div className="space-y-1.5">
            {guess && (
              <p className="text-xs text-muted-foreground">
                {messages.muniWhichOne}
              </p>
            )}
            <ul className="space-y-0.5">
              {matches.slice(0, MAX_MATCHES).map((entry) => (
                <li key={entry.name}>
                  <button
                    type="button"
                    onClick={() => setPicked(entry.name)}
                    className="flex w-full items-baseline justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 max-lg:min-h-11 max-lg:items-center"
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
              {matches.length > MAX_MATCHES && (
                <li className="px-2 py-1 text-xs text-muted-foreground">…</li>
              )}
            </ul>
          </div>
        )}

        {active && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <CoverageLine entry={active} messages={messages} />
              <button
                type="button"
                onClick={reset}
                className="inline-flex shrink-0 items-center text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline max-lg:min-h-11"
              >
                {messages.clear}
              </button>
            </div>

            {active.coverage.length > 0 ? (
              active.coverage.map((coverage) => (
                <CoverageCard
                  key={`${coverage.shelterId}-${coverage.species ?? "all"}`}
                  coverage={coverage}
                  text={cardText}
                  locale={locale}
                  action={
                    selectableIds.has(coverage.shelterId) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={selected.includes(coverage.shelterId)}
                        onClick={() => onToggle(coverage.shelterId)}
                        className="h-11 gap-1.5 text-xs lg:h-7"
                      >
                        {selected.includes(coverage.shelterId) && (
                          <Check className="size-3" aria-hidden />
                        )}
                        {selected.includes(coverage.shelterId)
                          ? messages.muniShelterSelected
                          : messages.muniSelectShelter}
                      </Button>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <NoCoverageAnswer entry={active} messages={messages} />
            )}

            <CostNote messages={messages} />

            <AnswerSteps messages={messages} />
          </div>
        )}
      </div>
    </div>
  );
}
