"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  LoaderCircle,
  Navigation,
  Phone,
  Search,
  X,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
  CoverageCard,
  type CoverageCardText,
} from "@/components/municipality-coverage-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNearby } from "@/hooks/use-nearby";
import type { LookupEntry } from "@/lib/municipality-coverage";
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

const REGISTER_URL = "https://www.gov.si/teme/zascita-zivali/#e69068";
const LAW_URL =
  "https://www.uradni-list.si/glasilo-uradni-list-rs/vsebina/2021-01-2993";
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
}) {
  const { locale, messages, t } = useI18n();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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

  const cardText: CoverageCardText = {
    dogs: messages.speciesDogs,
    cats: messages.speciesCats,
    call: messages.muniCall,
    onSite: messages.muniOnSite,
    lost: messages.muniLost,
    sourcePrefix: messages.muniSource,
    datedSourceNote: messages.muniDatedSource,
  };

  const reset = () => {
    setQuery("");
    setPicked(null);
    stopLocating();
  };

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
            className="h-8 pl-8 text-sm"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPicked(null);
                searchRef.current?.focus();
              }}
              aria-label={messages.clearSearch}
              className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:text-foreground"
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
            "mt-2 inline-flex w-fit items-center gap-1.5 rounded-ui py-0.5 text-xs transition-colors",
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
        {state.status === "error" && (
          <p className="text-sm text-muted-foreground">{state.message}</p>
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
                  className="inline-flex h-6 items-center rounded-full bg-muted/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                    className="flex w-full items-baseline justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
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
              <p className="text-xs text-muted-foreground">
                {active.name} ·{" "}
                {active.coverage.length === 1
                  ? messages.muniResponsible
                  : active.coverage.length > 1
                    ? messages.muniResponsiblePlural
                    : messages.muniUnverified}
              </p>
              <button
                type="button"
                onClick={reset}
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
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
                        className="h-7 gap-1.5 text-xs"
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
              <div className="space-y-3">
                <div className="space-y-1.5 rounded-ui border border-dashed p-4 text-sm text-muted-foreground">
                  <p>{messages.muniUnverifiedAdvice}</p>
                  <a
                    href={REGISTER_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs underline underline-offset-2 hover:text-foreground"
                  >
                    {messages.muniRegister}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>

                {/* Not an answer, but better than none: somewhere to call. */}
                {active.nearest.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">
                      {messages.muniNearestTitle}
                    </p>
                    <p className="text-[11px] leading-tight text-muted-foreground">
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
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {shelter.city} · {shelter.km} km
                            </span>
                          </span>
                          {shelter.phone && (
                            <a
                              href={`tel:${shelter.phone.replace(/\s/g, "")}`}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-ui border px-2 py-1 text-xs transition-colors hover:bg-muted"
                            >
                              <Phone className="size-3" aria-hidden />
                              {shelter.phone}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* The fact that stops people reporting a found animal: they
                assume the vet bill is theirs. It is not. */}
            <div className="space-y-1 rounded-ui border bg-muted/40 p-3">
              <p className="text-xs leading-relaxed">{messages.muniCost}</p>
              <a
                href={LAW_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {messages.muniCostSource}
                <ExternalLink className="size-2.5" aria-hidden />
              </a>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium">{messages.muniStepsTitle}</p>
              <ol className="space-y-1.5">
                {[messages.muniStep1, messages.muniStep2, messages.muniStep3].map(
                  (step, index) => (
                    <li
                      key={step}
                      className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                    >
                      <span className="shrink-0 font-medium text-foreground">
                        {index + 1}.
                      </span>
                      {step}
                    </li>
                  ),
                )}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
