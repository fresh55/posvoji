"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  ClipboardCheck,
  House,
  Mars,
  PawPrint,
  Venus,
  type LucideIcon,
} from "lucide-react";
import type { AnimalSize, Sex, TestResult } from "@posvoji/schema";
import { AgeStageIcon } from "@/components/filters/age-stage-icon";
import { CoatColorDots, CoatLengthMark } from "@/components/filters/coat-cards";
import { useI18n } from "@/components/i18n-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { hasTestResult, type AnimalFields } from "@/lib/animal";
import { useAnimalDescription } from "@/lib/animal-descriptions";
import {
  CARE_ICONS,
  ENERGY_ICONS,
  GOOD_WITH_ICONS,
  HEALTH_ICONS,
} from "@/lib/animal-icons";
import { namesSeveralAnimals } from "@/lib/animal-name";
import {
  ageGroup,
  ageInMonths,
  ageStage,
  careMatches,
  GOOD_WITH_KEYS,
  groupLabel,
  optionLabel,
  toggleLabel,
  togglesAskedOf,
  type GoodWithKey,
  type ToggleKey,
} from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import { quotedLang } from "@/lib/i18n-format";
import { ADOPTION_REQUIREMENT_LABELS } from "@/lib/filters/metadata";
import { ageLabel, sexLabel, sizeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SEX_ICONS: Record<Exclude<Sex, "unknown">, LucideIcon> = {
  male: Mars,
  female: Venus,
};

const REQUIREMENT_KEYS = Object.keys(ADOPTION_REQUIREMENT_LABELS) as
  (keyof typeof ADOPTION_REQUIREMENT_LABELS)[];

// A requirement a Lahko ponudim row finds wears that row's mark. The two the
// filters leave to the animal, indoor-only and only-pet, draw the home they
// ask for. Young children wear Doma imam's mark for children, the question
// the requirement answers.
const REQUIREMENT_ICONS: Record<(typeof REQUIREMENT_KEYS)[number], LucideIcon> = {
  indoorOnly: Building2,
  onlyPet: House,
  noYoungKids: GOOD_WITH_ICONS.kids,
  bondedPair: CARE_ICONS["bonded-pair"],
  experiencedCarer: CARE_ICONS["experienced-carer"],
  ongoingCare: CARE_ICONS["ongoing-care"],
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
// COARSE_PILL is the finger's share of it, and every pill in these rows
// carries it so one row cannot stand taller than the one above. 26px is what
// a pill measures for a mouse, which is the size the rows were drawn at and
// stays; a thumb gets 36px of drawing and, on the pills that open something,
// 44px of hit area from tap-target over it. The 4px the overlay overhangs is
// why the rows' own gap-y grows with it: at gap-y-1.5 two wrapped lines of
// pills overlapped each other's overlays.
const COARSE_PILL =
  "pointer-coarse:min-h-9 pointer-coarse:py-2";

// The row those pills wrap in. The gap-y is tied to COARSE_PILL's overhang by
// the paragraph above, so the two live together rather than in five places
// that have to be remembered at once.
const FACT_ROW_CLASS =
  "flex flex-wrap gap-x-2 gap-y-1.5 pointer-coarse:gap-y-2.5";

const HEALTH_PILL_CLASS =
  `inline-flex cursor-help items-center gap-1.5 rounded-ui border border-brand-border/70 bg-brand/60 px-2.5 py-1 text-xs text-brand-foreground transition-colors hover:bg-brand/80 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none ${COARSE_PILL} pointer-coarse:tap-target`;

// The mark that separates a pill you can press from the inert ones standing in
// the same row. The pills that open an explainer looked exactly like the
// dashed unknown pill, the "no" answers and the requirement pills, and
// cursor-help above only reaches a pointer: a thumb had nothing to go on and
// the popovers went unfound.
//
// A dotted underline on the label is the conventional "this word explains
// itself" sign, the one abbr has worn since the browser default, and it spends
// no colour: the green already means something here, so a second tier could
// not be another fill. decoration-current so the line is the pill's own ink at
// half strength, quiet enough not to read as a link.
//
// Only the label carries it, not the icon beside it, and only the triggers:
// the collapsed summary button has its chevron and needs no second mark.
const HEALTH_LABEL_CLASS =
  "underline decoration-current/50 decoration-dotted decoration-1 underline-offset-4";

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
          <span className={HEALTH_LABEL_CLASS}>{label}</span>
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
// pill, and words that say what the animal would rather have. The border is
// lighter than the identity pills' plain one, because a no should not outweigh
// who the animal is. An unanswered question is drawn dashed and stays inert,
// because there is nothing to explain yet.
const GOOD_WITH_NO_CLASS =
  `inline-flex items-center gap-1.5 rounded-ui border border-foreground/15 px-2.5 py-1 text-xs text-muted-foreground ${COARSE_PILL}`;
const GOOD_WITH_UNKNOWN_CLASS =
  `inline-flex items-center gap-1.5 rounded-ui border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground ${COARSE_PILL}`;

// What the home has to be. A condition that rules a home out outranks the
// size badge and the shelter's paragraph, so it is a pill in the group rather
// than a 12px aside under the text: "oddaja se izključno za notranje bivanje"
// was last, in the last line of a paragraph that opens clamped. Its own tier
// of dress: no fill, unlike the identity pills, and a darker edge and full
// ink, unlike the muted "no" answers, because this is the one row a visitor
// either matches or does not.
const REQUIREMENT_PILL_CLASS =
  `inline-flex items-center gap-1.5 rounded-ui border border-foreground/25 px-2.5 py-1 text-xs ${COARSE_PILL}`;

function RequirementFact({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li className={REQUIREMENT_PILL_CLASS}>
      <Icon
        className="size-3.5 shrink-0 opacity-70"
        strokeWidth={1.75}
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

// The missing-result pill wears the tube both test badges wear, so the answer
// the shelter recorded and the one it did not are visibly the same question.
// It wore FIV's shield and its tick, on a pill saying there is no result.
const UnknownTestIcon = HEALTH_ICONS["brez-fiv"];

// An itemised health row lists only what the record answers, so a cat missing
// its FIV or FeLV result shows three green pills and nothing about the two
// tests a visitor with a resident cat came for. The gap gets a name. Cats
// only, because nobody asks a dog; and only these two, because sterilisation,
// vaccination and the chip are done before an adoption anyway.
function healthGapKey(
  species: string,
  medical: { fiv?: TestResult; felv?: TestResult } | undefined,
): TranslationKey | undefined {
  if (species !== "cat") return undefined;
  // A positive is a result, and the shelter's own words carry it, so it is
  // never a gap.
  const fiv = !hasTestResult(medical?.fiv);
  const felv = !hasTestResult(medical?.felv);
  if (fiv && felv) return "healthUnknownFivFelv";
  if (fiv) return "healthUnknownFiv";
  if (felv) return "healthUnknownFelv";
  return undefined;
}

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
            <span className={HEALTH_LABEL_CLASS}>{label}</span>
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
          <span className={HEALTH_LABEL_CLASS}>{label}</span>
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

// Past this length a description starts to bury the shelter box, so it opens
// clamped. The threshold is characters rather than measured lines to keep the
// server and the client rendering the same thing.
const CLAMP_DESCRIPTION_CHARS = 320;

// Length is not the only way a description gets tall. The text is printed
// whitespace-pre-line, so every break the shelter wrote is a line on screen,
// and a listing set out as a short line each for age, sex and character ran
// past the clamp's five lines at half the character count. Lines are
// counted, not measured, for the same reason the length is: the server and
// the client have to decide this the same way.
const CLAMP_DESCRIPTION_LINES = 5;

// The paragraphs a description is printed in. Shelters separate them with a
// blank line, and this used to be one whitespace-pre-line paragraph, so that
// blank line was a line on screen like any other: on 33 of the 189 clamped
// descriptions it was the fifth one, and the clamp drew its ellipsis alone on
// an empty line above "Preberi več". Split here and printed one element each,
// the separation is a margin rather than a line, and the clamp spends all
// five of its lines on text. The single breaks inside a paragraph stay, both
// on screen and in the count below: the shelter meant those.
function descriptionParagraphs(description: string): string[] {
  return description
    .split(/\n[^\S\n]*\n\s*/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function clampsDescription(paragraphs: string[]): boolean {
  const printed = paragraphs.reduce(
    (count, paragraph) => count + paragraph.length,
    0,
  );
  if (printed > CLAMP_DESCRIPTION_CHARS) return true;
  const lines = paragraphs.reduce(
    (count, paragraph) => count + paragraph.split("\n").length,
    0,
  );
  return lines > CLAMP_DESCRIPTION_LINES;
}

// A description that is nothing but the photographer's credit. Two dogs at
// Horjul carry "Foto Anja Troha" and no other word, which says nothing about
// the dog and reads as if the shelter wrote its name wrong. Sixteen more
// listings carry the same credit after a real description, where it is the
// sign-off it was meant as and stays printed with the rest of the shelter's
// words: we do not edit those, we only decline to print a description that is
// only a credit. The credit the listing is given under is the provider's, and
// the footnote under the shelter box already prints that one.
const PHOTO_CREDIT_ONLY =
  /^(?:Foto|Fotografij[ae]|Fotografiral[ai]?|Vse fotografije)\s*:?\s+\p{Lu}[^.]{2,40}$/u;

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
        COARSE_PILL,
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
  // What the read-more button expands, named so aria-expanded has something
  // to point at. Two animals can be in the tree at once while the dialog
  // steps from one to the next, so the id cannot be a constant.
  const descriptionId = useId();
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
  // The stage the shelter stated where it gave no number, so the filter that
  // found this animal under Senior is not contradicted by a missing age.
  const statedStage =
    months === undefined ? ageStage(animal, reference) : undefined;
  const sex = animal.sex && animal.sex !== "unknown" ? animal.sex : undefined;
  // "Complete" is measured against what the species can answer: FIV and FeLV
  // are cat questions, so a dog is not two answers short for never having been
  // asked. A full row of green ticks carries one message, so it collapses to
  // that message until someone wants the itemized version.
  const applicable = togglesAskedOf(animal.species);
  const medical = applicable.filter((toggle) => toggle.matches(animal));
  // One row of pills cannot describe three dogs, so a listing that names
  // several of them leaves age, sex, size and energy to the text below.
  // The health and status pills stay: those the shelter answered for the
  // listing as a whole.
  const severalAnimals = namesSeveralAnimals(animal.name);
  const hasIdentity =
    !severalAnimals &&
    (sex !== undefined || months !== undefined || statedStage !== undefined || animal.size !== undefined ||
      animal.energy !== undefined || animal.coatColors !== undefined || animal.coatLength !== undefined);
  const fullRecord = medical.length === applicable.length;
  // Named only beside an itemised row: a full record has no gap to name, and a
  // shelter that recorded nothing at all says nothing here either.
  const healthGap =
    medical.length > 0 && !fullRecord
      ? healthGapKey(animal.species, animal.medical)
      : undefined;
  // Where all the shelter said about children is the requirement row's
  // "Potrebuje dom brez majhnih otrok", the children pill stays out: "Ni
  // podatka o otrocih" beside it would say there is no answer.
  const goodWithKeys =
    animal.adoptionRequirements?.noYoungKids === true &&
    animal.goodWith?.kids !== "yes" &&
    animal.goodWith?.kids !== "no"
      ? GOOD_WITH_KEYS.filter((key) => key !== "kids")
      : GOOD_WITH_KEYS;
  // One answered question is enough to show the row, and the row then answers
  // the rest. A shelter that has recorded nothing says nothing here.
  const hasGoodWith = goodWithKeys.some(
    (key) => animal.goodWith?.[key] !== undefined,
  );
  const apartment =
    animal.apartmentOk === "yes" || animal.apartmentOk === "no"
      ? animal.apartmentOk
      : undefined;
  const animalName = animal.name ?? messages.unnamed;
  const requirements = REQUIREMENT_KEYS.filter(
    (key) => animal.adoptionRequirements?.[key] === true,
  );
  // The patience flag rides in the same row as the reviewed requirements:
  // both answer what the home has to be, and a row each would have asked the
  // visitor to read the same question twice. It is read through the filter's
  // own rule, so an animal the Potrpežljivost row leaves to a narrower one
  // does not say it twice here either.
  const needsPatience = careMatches(animal, "patient");
  const hasRequirements = requirements.length > 0 || needsPatience;
  // Two ways in, one paragraph. The animal's own page is server-rendered from
  // a whole dataset animal, so it carries its description and asks the store
  // for nothing. The grid's dialog gets an animal without one, because the
  // home page stopped shipping 503 descriptions to print at most one, and the
  // text is fetched instead. Passing no id is what keeps the page's side from
  // fetching. See lib/animal-descriptions.ts.
  const fetched = useAnimalDescription(
    animal.shortDescription ? undefined : animal.id,
  );
  const description = animal.shortDescription || fetched;
  // Whichever way it arrived, the same two questions: is any of it about the
  // animal, and is there enough of it to open clamped.
  const paragraphs =
    description && !PHOTO_CREDIT_ONLY.test(description.trim())
      ? descriptionParagraphs(description)
      : [];
  const clampDescription = clampsDescription(paragraphs);

  return (
    <div className="space-y-4">
      {/* Who the animal is, then what home it needs, then what its health
          record says, then what company it keeps. The rows sit further apart
          than the lines inside one of them, so a row that wraps still reads as
          one row: at space-y-1.5 against the rows' own gap-2, two separate
          statements sat closer than two lines of one. The breed lives in the
          dialog's subtitle, not here. */}
      {(hasIdentity ||
        hasRequirements ||
        medical.length > 0 ||
        hasGoodWith ||
        apartment) && (
        <div className="space-y-2.5">
          {hasIdentity && (
            <ul
              aria-label={messages.animalDetails}
              className={FACT_ROW_CLASS}
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
                >
                  {t("factAgeValue", { age: ageLabel(months, locale) })}
                </Fact>
              )}
              {statedStage !== undefined && (
                <Fact
                  iconNode={
                    <AgeStageIcon
                      stage={statedStage}
                      className="size-3.5 opacity-70"
                    />
                  }
                  prefix={groupLabel("age", locale)}
                >
                  {optionLabel("age", statedStage, [], locale)}
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
              {animal.coatColors && (
                // The swatches rather than the palette mark: this pill names
                // colours, and the filter that finds them draws the same
                // discs.
                <Fact
                  iconNode={<CoatColorDots values={animal.coatColors} />}
                  prefix={groupLabel("coatColor", locale)}
                >
                  {animal.coatColors.map(color => optionLabel("coatColor", color, [], locale)).join(", ")}
                </Fact>
              )}
              {animal.coatLength && (
                <Fact
                  iconNode={
                    <CoatLengthMark
                      value={animal.coatLength}
                      className="size-3.5 shrink-0 opacity-70"
                    />
                  }
                  prefix={groupLabel("coatLength", locale)}
                >
                  {optionLabel("coatLength", animal.coatLength, [], locale)}
                </Fact>
              )}
              {animal.energy && (
                <Fact
                  icon={ENERGY_ICONS[animal.energy]}
                  prefix={groupLabel("energy", locale)}
                >
                  {optionLabel("energy", animal.energy, [], locale)}
                </Fact>
              )}
            </ul>
          )}
          {/* Second, straight after who the animal is: a condition that rules
              a home out matters more to the visitor reading this than the
              size pill above it. Its own name, not the housing row's: two
              lists called "Dom" gave a screen reader the same landmark twice,
              and the two rows answer different questions. The shelter's own
              words may say this again at the end of the paragraph below; that
              is the point of saying it here, so nothing is deduped away. */}
          {hasRequirements && (
            <ul
              aria-label={messages.adoptionRequirements}
              className={FACT_ROW_CLASS}
            >
              {requirements.map((key) => (
                <RequirementFact
                  key={key}
                  icon={REQUIREMENT_ICONS[key]}
                >
                  {ADOPTION_REQUIREMENT_LABELS[key][locale]}
                </RequirementFact>
              ))}
              {/* The need behind the filter's Potrpežljivost row, in its
                  words, so a visitor who ticked it recognises them. */}
              {needsPatience && (
                <RequirementFact icon={CARE_ICONS.patient}>
                  {messages.specialNeedsLabel}
                </RequirementFact>
              )}
            </ul>
          )}
          {medical.length > 0 && (
            <ul
              ref={healthRow}
              aria-label={messages.health}
              className={FACT_ROW_CLASS}
            >
              {fullRecord && !showHealthDetails ? (
                <li>
                  <button
                    type="button"
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
                    {/* No count beside it. It was the same token twice, so it
                        could never say anything, and it read as a smaller
                        record for a dog (3/3) than for a cat (5/5). */}
                    {messages.healthAllClear}
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
                <>
                  {medical.map(({ key }) => (
                    <HealthFact
                      key={key}
                      toggle={key}
                      label={toggleLabel(key, locale)}
                      hint={messages[HEALTH_HINTS[key]]}
                    />
                  ))}
                  {/* Last, after what the record does answer, and inert: there
                      is no sentence to open on a test nobody ran. */}
                  {healthGap && (
                    <li className={GOOD_WITH_UNKNOWN_CLASS}>
                      <UnknownTestIcon
                        className="size-3.5 shrink-0 opacity-70"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span>{messages[healthGap]}</span>
                    </li>
                  )}
                </>
              )}
            </ul>
          )}
          {hasGoodWith && (
            <ul
              aria-label={messages.goodWithFacts}
              className={FACT_ROW_CLASS}
            >
              {goodWithKeys.map((key) => {
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
            <ul
              aria-label={messages.home}
              className={FACT_ROW_CLASS}
            >
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

      {/* The shelter's own words come right after the pills and ahead of the
          quiet context lines: the facts, then the sentence somebody wrote
          about this animal, then the asides. Nothing here until the fetch
          lands, which is what an animal with no description draws too. No
          spinner and no skeleton: it is one paragraph inside a dialog that is
          already open and already full, and a placeholder for it would be
          more noticeable than the wait. */}
      {paragraphs.length > 0 && (
        <div className="space-y-1">
          <div
            id={descriptionId}
            // Named for the dialog, which parks its fixed close button in the
            // last 44px of these lines on a phone and reserves the column
            // back. The animal's own page has no such button and draws this
            // at its full width; see animal-dialog.tsx.
            data-slot="animal-description"
            // The shelter wrote this and we print it verbatim, so it is
            // Slovenian on an English page too. See quotedLang in lib/i18n.ts.
            lang={quotedLang("sl", locale)}
            // max-w-prose: at the dialog's full width these lines run past
            // ninety characters, which is more than an eye tracks comfortably.
            // The pills and boxes around it keep the full width; only the
            // running text narrows.
            //
            // The clamp counts the line boxes of the paragraphs inside it,
            // which is what lets the gap between them cost a margin rather
            // than one of the five lines. Measured the same in Chrome, Firefox
            // and WebKit on the built export: five lines of text either way,
            // with the gaps added on top.
            className={cn(
              "max-w-prose space-y-2 text-sm leading-relaxed",
              clampDescription && !showFullDescription && "line-clamp-5",
            )}
          >
            {paragraphs.map((paragraph, index) => (
              <p
                // The shelter's own paragraphs, in the order it wrote them:
                // nothing sorts or filters them, so the position is the
                // identity.
                key={index}
                className="whitespace-pre-line"
              >
                {paragraph}
              </p>
            ))}
          </div>
          {clampDescription && (
            <button
              type="button"
              aria-expanded={showFullDescription}
              aria-controls={descriptionId}
              onClick={() => setShowFullDescription((open) => !open)}
              className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {showFullDescription ? messages.showLess : messages.readMore}
            </button>
          )}
        </div>
      )}

      {/* The requirements and the patience flag used to stand here, as 12px
          muted asides under the description. They say what the home has to be,
          which is not context, so they moved into the badge group above. The
          time in the shelter left for the shelter block; see
          stayStatement in lib/labels.ts. */}
    </div>
  );
}
