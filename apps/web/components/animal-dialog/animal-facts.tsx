"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Hourglass,
  MapPin,
  Mars,
  PawPrint,
  Venus,
  type LucideIcon,
} from "lucide-react";
import type { Animal, AnimalSize, Sex } from "@posvoji/schema";
import { AgeStageIcon } from "@/components/filters/age-stage-icon";
import { useI18n } from "@/components/i18n-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HEALTH_ICONS } from "@/lib/animal-icons";
import {
  ageGroup,
  ageInMonths,
  TOGGLES,
  toggleLabel,
  type ToggleKey,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import {
  ageLabel,
  LONG_STAY_MONTHS,
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

// The washed-out accent keeps the green badges from outshouting the identity
// badges above them; the summary badge and the expanded ones dress the same.
const HEALTH_PILL_CLASS =
  "inline-flex cursor-help items-center gap-1.5 rounded-ui border border-[var(--filter-accent-border)]/70 bg-[var(--filter-accent)]/60 px-2.5 py-1 text-xs text-[var(--filter-accent-foreground)] transition-colors hover:bg-[var(--filter-accent)]/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

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
          className="w-auto max-w-xs border-transparent bg-foreground px-2.5 py-1.5 text-xs text-background"
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
  onSeeLongestWaiting,
}: {
  animal: Animal;
  /** The dataset's own build time, so every span agrees with the cards. */
  reference: Date;
  /**
   * Re-sorts the list by longest wait and closes the dialog. Absent while
   * that sort is already on, which it is by default, so the link only shows
   * when it would actually change something.
   */
  onSeeLongestWaiting?: () => void;
}) {
  const { locale, messages, t } = useI18n();
  // A complete record collapses to one line until asked; per-animal state,
  // so the component is keyed by animal where it is used.
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const months = ageInMonths(animal, reference);
  const stayMonths = animal.intakeDate
    ? monthsInShelter(animal.intakeDate, reference)
    : undefined;
  const stay =
    stayMonths !== undefined ? ageLabel(stayMonths, locale) : undefined;
  // An adopted animal has left, so its stay is history and stays quiet. The
  // plea is reserved for animals actually up for adoption: a reserved or held
  // one is not waiting for the visitor's decision.
  const inShelter = animal.status !== "adopted";
  const waiting =
    inShelter && animal.status !== "hold" && animal.status !== "reserved";
  const longStay =
    waiting && stayMonths !== undefined && stayMonths >= LONG_STAY_MONTHS;
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
  const clampDescription =
    (animal.shortDescription?.length ?? 0) > CLAMP_DESCRIPTION_CHARS;

  return (
    <div className="space-y-3">
      {/* Who the animal is, then what its health record says. Two close-set
          rows, so the identity is not buried in a wall of same-shaped badges.
          The breed lives in the dialog's subtitle, not here. */}
      {(hasIdentity || medical.length > 0) && (
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
            <ul aria-label={messages.health} className="flex flex-wrap gap-2">
              {fullRecord && !showHealthDetails ? (
                <li>
                  <button
                    type="button"
                    aria-expanded={false}
                    onClick={() => setShowHealthDetails(true)}
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

      {animal.shortDescription && (
        <div className="space-y-1">
          <p
            className={cn(
              "text-sm leading-relaxed whitespace-pre-line",
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

      {/* Last before the shelter box on purpose: facts, then the shelter's
          own words, then the wait, then the way to act on it. Styled like a
          quiet alert in the same neutral box as the shelter block, the amber
          held to the icon alone. The link re-sorts the list by longest wait,
          and only offers itself while the list is sorted some other way. */}
      {longStay && stay && (
        <div className="flex items-start gap-3 rounded-ui border bg-muted/40 px-4 py-3">
          <Hourglass
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            strokeWidth={1.75}
            aria-hidden
          />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">{t("longStay", { duration: stay })}</p>
            {onSeeLongestWaiting && (
              <button
                type="button"
                onClick={onSeeLongestWaiting}
                className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {messages.longStayLink}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
