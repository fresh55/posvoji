"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  HeartHandshake,
  MapPin,
  Mars,
  PawPrint,
  Venus,
  type LucideIcon,
} from "lucide-react";
import type { AnimalSize, Sex } from "@posvoji/schema";
import { AgeStageIcon } from "@/components/filters/age-stage-icon";
import { useI18n } from "@/components/i18n-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AnimalFields } from "@/lib/animal";
import { GOOD_WITH_ICONS, HEALTH_ICONS } from "@/lib/animal-icons";
import {
  ageGroup,
  ageInMonths,
  GOOD_WITH_KEYS,
  TOGGLES,
  toggleLabel,
  type GoodWithKey,
  type ToggleKey,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import {
  ageLabel,
  longStayMonths,
  monthsInShelter,
  sexLabel,
  sizeLabel,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

const SEX_ICONS: Record<Exclude<Sex, "unknown">, LucideIcon> = {
  male: Mars,
  female: Venus,
};

// The size filter speaks in growing paw prints, so the size badge does too:
// the paw itself is the measurement.
const SIZE_ICON_CLASS: Record<AnimalSize, string> = {
  small: "size-3",
  medium: "size-3.5",
  large: "size-4",
};

// One sentence per health badge. "Brez FIV" means nothing to most visitors
// until someone says it out loud.
const HEALTH_HINTS: Record<ToggleKey, TranslationKey> = {
  sterilizacija: "hintSterilizacija",
  cepljenje: "hintCepljenje",
  cip: "hintCip",
  "brez-fiv": "hintBrezFiv",
  "brez-felv": "hintBrezFelv",
};

// The household questions read as full phrases rather than labels, because
// "Otroci" alone says nothing about the answer. One set of words per answer,
// and the popover sentence for a yes.
const GOOD_WITH_LABELS: Record<
  GoodWithKey,
  Record<"yes" | "no" | "unknown", TranslationKey>
> = {
  kids: {
    yes: "goodWithYesKids",
    no: "goodWithNoKids",
    unknown: "goodWithUnknownKids",
  },
  dogs: {
    yes: "goodWithYesDogs",
    no: "goodWithNoDogs",
    unknown: "goodWithUnknownDogs",
  },
  cats: {
    yes: "goodWithYesCats",
    no: "goodWithNoCats",
    unknown: "goodWithUnknownCats",
  },
};

const GOOD_WITH_HINTS: Record<GoodWithKey, TranslationKey> = {
  kids: "hintGoodWithKids",
  dogs: "hintGoodWithDogs",
  cats: "hintGoodWithCats",
};

// The dark explainer bubble every fact popover wears. One constant, because
// it was the same class string typed out three times.
const FACT_POPOVER_CLASS =
  "w-auto max-w-xs border-transparent bg-foreground px-2.5 py-1.5 text-xs text-background";

// The washed-out accent keeps the green badges from outshouting the identity
// badges above them; the summary badge and the expanded ones dress the same.
const HEALTH_PILL_CLASS =
  "inline-flex cursor-help items-center gap-1.5 rounded-ui border border-[var(--filter-accent-border)]/70 bg-[var(--filter-accent)]/60 px-2.5 py-1 text-xs text-[var(--filter-accent-foreground)] transition-colors hover:bg-[var(--filter-accent)]/80 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none";

// A health badge explains itself when asked. A popover rather than a hover
// tooltip, because a thumb cannot hover.
function HealthFact({
  toggle: key,
  label,
  hint,
}: {
  toggle: ToggleKey;
  label: string;
  hint: string;
}) {
  const Icon = HEALTH_ICONS[key];
  return (
    <li>
      <Popover>
        <PopoverTrigger className={HEALTH_PILL_CLASS}>
          <Icon
            className="size-3.5 shrink-0 opacity-70"
            strokeWidth={1.75}
            aria-hidden
          />
          {label}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          className={FACT_POPOVER_CLASS}
        >
          {hint}
        </PopoverContent>
      </Popover>
    </li>
  );
}

// A "no" is not a fault, so it never gets a warning colour: a plain bordered
// pill, and words that say what the animal would rather have. An unanswered
// question is drawn dashed and stays inert, because there is nothing to
// explain yet.
const GOOD_WITH_NO_CLASS =
  "inline-flex items-center gap-1.5 rounded-ui border border-foreground/25 px-2.5 py-1 text-xs text-muted-foreground";
const GOOD_WITH_UNKNOWN_CLASS =
  "inline-flex items-center gap-1.5 rounded-ui border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground";

// Once one household question has an answer, all three are shown: a row that
// listed only the yeses would read as an all-clear on the rest.
function GoodWithFact({
  facet,
  answer,
  label,
  hint,
}: {
  facet: GoodWithKey;
  answer: "yes" | "no" | "unknown";
  label: string;
  hint: string;
}) {
  const Icon = GOOD_WITH_ICONS[facet];
  const icon = (
    <Icon className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
  );

  if (answer === "yes") {
    return (
      <li>
        <Popover>
          <PopoverTrigger className={HEALTH_PILL_CLASS}>
            {icon}
            {label}
          </PopoverTrigger>
          <PopoverContent
            side="top"
            className={FACT_POPOVER_CLASS}
          >
            {hint}
          </PopoverContent>
        </Popover>
      </li>
    );
  }

  return (
    <li
      className={
        answer === "no" ? GOOD_WITH_NO_CLASS : GOOD_WITH_UNKNOWN_CLASS
      }
    >
      {icon}
      <span>{label}</span>
    </li>
  );
}

// The housing answer is a yes or a no and nothing else: "unknown" would be a
// pill that says the shelter has not looked into it, which is not worth the
// row. A yes explains itself the way the household yeses do; a no is dressed
// as plainly, because needing a garden is not a fault.
function ApartmentFact({
  answer,
  label,
  hint,
}: {
  answer: "yes" | "no";
  label: string;
  hint: string;
}) {
  const icon = (
    <Building2
      className="size-3.5 shrink-0 opacity-70"
      strokeWidth={1.75}
      aria-hidden
    />
  );

  if (answer === "no") {
    return (
      <li className={GOOD_WITH_NO_CLASS}>
        {icon}
        <span>{label}</span>
      </li>
    );
  }

  return (
    <li>
      <Popover>
        <PopoverTrigger className={HEALTH_PILL_CLASS}>
          {icon}
          {label}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          className={FACT_POPOVER_CLASS}
        >
          {hint}
        </PopoverContent>
      </Popover>
    </li>
  );
}

// A stay this long is the animal's story, not a data point, so it gets its own
// line instead of a pill. The threshold lives in labels.ts, shared with the
// card's quiet mark.

// Past this length a description starts to bury the shelter box, so it opens
// clamped. The threshold is characters rather than measured lines to keep the
// server and the client rendering the same thing.
const CLAMP_DESCRIPTION_CHARS = 320;

// The icon carries the meaning on screen; a screen reader gets the same
// meaning from the prefix instead. Facts that read as a full sentence on their
// own (the sex) need no prefix. A fact whose symbol is not a plain Lucide icon
// hands it in as a node instead.
function Fact({
  icon: Icon,
  iconNode,
  prefix,
  className,
  children,
}: {
  icon?: LucideIcon;
  iconNode?: ReactNode;
  prefix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-ui border bg-muted/40 px-2.5 py-1 text-xs",
        className,
      )}
    >
      {Icon ? (
        <Icon
          className="size-3.5 shrink-0 opacity-70"
          strokeWidth={1.75}
          aria-hidden
        />
      ) : (
        iconNode
      )}
      {prefix && <span className="sr-only">{prefix}: </span>}
      <span>{children}</span>
    </li>
  );
}

// A quiet fact that reads as context rather than identity: where the animal
// was found, how long it has been waiting. Text, not a pill, so it cannot be
// confused with the age badge above it.
function Aside({
  icon: Icon,
  prefix,
  children,
}: {
  icon: LucideIcon;
  prefix?: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
      {prefix && <span className="sr-only">{prefix}: </span>}
      {children}
    </span>
  );
}

export function AnimalFacts({
  animal,
  reference,
}: {
  animal: AnimalFields;
  /** The dataset's own build time, so every span agrees with the cards. */
  reference: Date;
}) {
  const { locale, messages, t } = useI18n();
  // A complete record collapses to one line until asked; per-animal state,
  // so the component is keyed by animal where it is used.
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  // The summary pill is the control and the whole of what it replaces: it goes
  // out of the tree the moment it is pressed, and focus went to the body with
  // it, which drops a keyboard visitor back at the top of the document. The
  // row it opened takes the focus instead.
  const healthRow = useRef<HTMLUListElement>(null);
  const handOverHealthFocus = useRef(false);
  useEffect(() => {
    if (!handOverHealthFocus.current) return;
    handOverHealthFocus.current = false;
    healthRow.current?.querySelector("button")?.focus();
  }, [showHealthDetails]);
  const months = ageInMonths(animal, reference);
  const stayMonths = animal.intakeDate
    ? monthsInShelter(animal.intakeDate, reference)
    : undefined;
  const stay =
    stayMonths !== undefined ? ageLabel(stayMonths, locale) : undefined;
  // An adopted animal has left, so its stay is history and stays quiet.
  const inShelter = animal.status !== "adopted";
  // Whether the shelter block below is about to make the long-stay plea, in
  // which case this quiet aside yields to it rather than saying the same
  // number twice. Read from labels.ts so the two cannot disagree about who
  // counts as waiting long; see shelter-block.tsx.
  const longStay = longStayMonths(animal, reference) !== undefined;
  const sex = animal.sex && animal.sex !== "unknown" ? animal.sex : undefined;
  const medical = TOGGLES.filter((toggle) => toggle.matches(animal));
  const hasIdentity =
    sex !== undefined || months !== undefined || animal.size !== undefined;
  // "Complete" is measured against what the species can answer: FIV and FeLV
  // are cat questions. A full row of green ticks carries one message, so it
  // collapses to that message until someone wants the itemized version.
  const applicable = TOGGLES.filter(
    (toggle) => !toggle.species || toggle.species === animal.species,
  );
  const fullRecord =
    medical.length === applicable.length && applicable.length >= 3;
  // One answered question is enough to show the row, and the row then answers
  // all three. A shelter that has recorded nothing says nothing here.
  const hasGoodWith = GOOD_WITH_KEYS.some(
    (key) => animal.goodWith?.[key] !== undefined,
  );
  const apartment =
    animal.apartmentOk === "yes" || animal.apartmentOk === "no"
      ? animal.apartmentOk
      : undefined;
  const animalName = animal.name ?? messages.unnamed;
  const clampDescription =
    (animal.shortDescription?.length ?? 0) > CLAMP_DESCRIPTION_CHARS;

  return (
    <div className="space-y-3">
      {/* Who the animal is, then what its health record says. Two close-set
          rows, so the identity is not buried in a wall of same-shaped badges.
          The breed lives in the dialog's subtitle, not here. */}
      {(hasIdentity || medical.length > 0 || hasGoodWith || apartment) && (
        <div className="space-y-1.5">
          {hasIdentity && (
            <ul
              aria-label={messages.animalDetails}
              className="flex flex-wrap gap-2"
            >
              {sex && (
                <Fact icon={SEX_ICONS[sex]}>{sexLabel(sex, locale)}</Fact>
              )}
              {/* The same sprout, shrub or tree the age filter buckets by,
                  so the sidebar and the badge tell one story. */}
              {months !== undefined && (
                <Fact
                  iconNode={
                    <AgeStageIcon
                      stage={ageGroup(months)}
                      className="size-3.5 opacity-70"
                    />
                  }
                  prefix={messages.factAge}
                >
                  {ageLabel(months, locale)}
                </Fact>
              )}
              {animal.size && (
                <Fact
                  iconNode={
                    <PawPrint
                      className={cn(
                        "shrink-0 opacity-70",
                        SIZE_ICON_CLASS[animal.size],
                      )}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  }
                  prefix={messages.factSize}
                >
                  {sizeLabel(animal.size, locale)}
                </Fact>
              )}
            </ul>
          )}
          {medical.length > 0 && (
            <ul
              ref={healthRow}
              aria-label={messages.health}
              className="flex flex-wrap gap-2"
            >
              {fullRecord && !showHealthDetails ? (
                <li>
                  <button
                    type="button"
                    aria-expanded={false}
                    onClick={(event) => {
                      // Only where the press really holds focus. A mouse click
                      // in Safari leaves focus where it was, and moving it then
                      // would be a jump nobody asked for.
                      handOverHealthFocus.current =
                        document.activeElement === event.currentTarget;
                      setShowHealthDetails(true);
                    }}
                    className={cn(HEALTH_PILL_CLASS, "cursor-pointer")}
                  >
                    <ClipboardCheck
                      className="size-3.5 shrink-0 opacity-70"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    {t("healthAllClear", { count: medical.length })}
                    <span className="sr-only">
                      {messages.showHealthDetails}
                    </span>
                    <ChevronDown
                      className="size-3 shrink-0 opacity-70"
                      aria-hidden
                    />
                  </button>
                </li>
              ) : (
                medical.map(({ key }) => (
                  <HealthFact
                    key={key}
                    toggle={key}
                    label={toggleLabel(key, locale)}
                    hint={messages[HEALTH_HINTS[key]]}
                  />
                ))
              )}
            </ul>
          )}
          {hasGoodWith && (
            <ul
              aria-label={messages.goodWithFacts}
              className="flex flex-wrap gap-2"
            >
              {GOOD_WITH_KEYS.map((key) => {
                const answer = animal.goodWith?.[key] ?? "unknown";
                return (
                  <GoodWithFact
                    key={key}
                    facet={key}
                    answer={answer}
                    label={messages[GOOD_WITH_LABELS[key][answer]]}
                    hint={t(GOOD_WITH_HINTS[key], { name: animalName })}
                  />
                );
              })}
            </ul>
          )}
          {apartment && (
            <ul aria-label={messages.home} className="flex flex-wrap gap-2">
              <ApartmentFact
                answer={apartment}
                label={
                  apartment === "yes"
                    ? messages.apartmentYes
                    : messages.apartmentNo
                }
                hint={t("hintApartmentOk", { name: animalName })}
              />
            </ul>
          )}
        </div>
      )}

      {((inShelter && stay && !longStay) || animal.originMunicipality) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {inShelter && stay && !longStay && (
            <Aside icon={CalendarClock}>
              {messages.factTimeInShelter}: {stay}
            </Aside>
          )}
          {/* The pin says "found in" without forcing a gender or a case on
              the sentence; the words only exist for screen readers. */}
          {animal.originMunicipality && (
            <Aside icon={MapPin} prefix={messages.factOrigin}>
              {animal.originMunicipality}
            </Aside>
          )}
        </p>
      )}

      {/* Said plainly and once, in the same quiet line as the other context
          facts. A shelter marking this is asking for the right person, not
          warning the visitor off, so it gets no alert box and no colour. */}
      {animal.specialNeeds && (
        <p className="text-xs text-muted-foreground">
          <Aside icon={HeartHandshake}>{messages.specialNeedsNote}</Aside>
        </p>
      )}

      {animal.shortDescription && (
        <div className="space-y-1">
          <p
            // The shelter wrote this and we print it verbatim, so it is
            // Slovenian on an English page too. Under <html lang="en"> a
            // screen reader read it with English phonemes, which is close to
            // unintelligible; naming the language switches the voice. Left
            // off on the Slovenian pages, where the document already says it.
            lang={locale === "sl" ? undefined : "sl"}
            // max-w-prose: at the dialog's full width these lines run past
            // ninety characters, which is more than an eye tracks comfortably.
            // The pills and boxes around it keep the full width; only the
            // running text narrows.
            className={cn(
              "max-w-prose text-sm leading-relaxed whitespace-pre-line",
              clampDescription && !showFullDescription && "line-clamp-5",
            )}
          >
            {animal.shortDescription}
          </p>
          {clampDescription && (
            <button
              type="button"
              aria-expanded={showFullDescription}
              onClick={() => setShowFullDescription((open) => !open)}
              className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {showFullDescription ? messages.showLess : messages.readMore}
            </button>
          )}
        </div>
      )}

      {/* The long wait itself renders inside the shelter block now, where the
          sentence sits beside the one button that can answer it. Standing
          alone here it either floated unanchored or stacked a second box on
          the shelter's; see shelter-block.tsx. This component still computes
          longStay, because the quiet time-in-shelter aside above yields to it. */}
    </div>
  );
}
