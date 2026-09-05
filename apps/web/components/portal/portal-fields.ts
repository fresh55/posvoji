import {
  BookmarkCheck,
  Check,
  CircleHelp,
  HeartHandshake,
  Mars,
  Pause,
  PawPrint,
  Venus,
  X,
  type LucideIcon,
} from "lucide-react";
import { filterCardVariants } from "@/components/filters/filter-card";
import { portalText } from "@/components/portal/portal-text";
import { ENERGY_ICONS, SPECIES_ICONS } from "@/lib/animal-icons";
import { FILTER_METADATA } from "@/lib/filters";
import { SPECIES_ORDER } from "@/lib/species";
import { sexLabel, sizeLabel, speciesLabel } from "@/lib/labels";
import {
  PORTAL_COMPATIBILITIES,
  PORTAL_ENERGIES,
  PORTAL_FIELDS,
  PORTAL_SEXES,
  PORTAL_SIZES,
  PORTAL_STATUSES,
  type PortalCompatibility,
  type PortalEnergy,
  type PortalSex,
  type PortalSize,
  type PortalStatus,
} from "@/lib/portal-api";
import { cn } from "@/lib/utils";

/** Narrows one of the API's plain strings to the set the portal edits. */
function oneOf<Value extends string>(
  values: readonly Value[],
): (value: string | null) => value is Value {
  return (value: string | null): value is Value =>
    value !== null && (values as readonly string[]).includes(value);
}

export const isPortalStatus = oneOf(PORTAL_STATUSES);
// The editor page reads the field to open at out of the address, where any
// string can turn up.
export const isPortalField = oneOf(PORTAL_FIELDS);
export const isPortalSex = oneOf(PORTAL_SEXES);
export const isPortalSize = oneOf(PORTAL_SIZES);
export const isPortalEnergy = oneOf(PORTAL_ENERGIES);
export const isPortalCompatibility = oneOf(PORTAL_COMPATIBILITIES);

// The species arrives as a plain string from the API, which reads it out of
// the dataset. One the schema does not know is not an animal we can name.
const isSpecies = oneOf(SPECIES_ORDER);

export function portalSpeciesIcon(species: string | null): LucideIcon {
  return isSpecies(species) ? SPECIES_ICONS[species] : PawPrint;
}

export function portalSpeciesLabel(species: string | null): string {
  return isSpecies(species) ? speciesLabel(species, "sl") : "Žival";
}

/**
 * One option of an icon choice row. The label and the icon come from the
 * tables the public site already uses, so a shelter picks the card the
 * adopter will later search by.
 */
export type ChoiceMeta = {
  label: string;
  icon: LucideIcon;
  /** Sizes the icon when the row is a scale rather than a set of equals. */
  iconClass?: string;
  /** A deliberate "not known" stays selected, without the positive accent. */
  mutedWhenSelected?: boolean;
};

function energyLabel(energy: PortalEnergy): string {
  return (
    FILTER_METADATA.energy.find((option) => option.value === energy)?.labels
      .sl ?? energy
  );
}

export const SEX_META: Record<PortalSex, ChoiceMeta> = {
  male: { label: sexLabel("male", "sl"), icon: Mars },
  female: { label: sexLabel("female", "sl"), icon: Venus },
  unknown: { label: "Ni znano", icon: CircleHelp },
};

// The paw grows with the size, so the three read as one scale before the
// labels are read at all.
export const SIZE_META: Record<PortalSize, ChoiceMeta> = {
  small: {
    label: sizeLabel("small", "sl"),
    icon: PawPrint,
    iconClass: "size-3.5",
  },
  medium: {
    label: sizeLabel("medium", "sl"),
    icon: PawPrint,
    iconClass: "size-4.5",
  },
  large: {
    label: sizeLabel("large", "sl"),
    icon: PawPrint,
    iconClass: "size-5.5",
  },
};

export const ENERGY_META: Record<PortalEnergy, ChoiceMeta> = {
  calm: { label: energyLabel("calm"), icon: ENERGY_ICONS.calm },
  balanced: { label: energyLabel("balanced"), icon: ENERGY_ICONS.balanced },
  lively: { label: energyLabel("lively"), icon: ENERGY_ICONS.lively },
};

/**
 * Answers shared by the yes/no/unknown fields: the three "gets on with" ones
 * (kids, dogs, cats) and "primeren za stanovanje".
 */
export const COMPATIBILITY_META: Record<PortalCompatibility, ChoiceMeta> = {
  yes: { label: "Da", icon: Check },
  no: { label: "Ne", icon: X },
  unknown: { label: "Ni znano", icon: CircleHelp, mutedWhenSelected: true },
};

/**
 * specialNeeds is a boolean on the wire and a flag in the schema: the animal
 * needs more time, knowledge or care than most, or the shelter has not said
 * so. There is no third answer to offer, which is why this is two cards and
 * not the three COMPATIBILITY_META carries. "No answer" is the row with
 * nothing chosen, which a tap on the chosen card gives back.
 */
export const PORTAL_SPECIAL_NEEDS_ANSWERS = ["yes", "no"] as const;
export type PortalSpecialNeedsAnswer =
  (typeof PORTAL_SPECIAL_NEEDS_ANSWERS)[number];

/** The Da and Ne of COMPATIBILITY_META, so the two fields read alike. */
export const SPECIAL_NEEDS_META: Record<PortalSpecialNeedsAnswer, ChoiceMeta> = {
  yes: COMPATIBILITY_META.yes,
  no: COMPATIBILITY_META.no,
};

/** true/false/null, as the API and the draft state carry it, to the card answer. */
export function specialNeedsAnswer(
  value: boolean | null,
): PortalSpecialNeedsAnswer | null {
  if (value === true) return "yes";
  if (value === false) return "no";
  return null;
}

/** The card answer back to true/false/null. No card clears the override. */
export function specialNeedsValue(
  answer: PortalSpecialNeedsAnswer | null,
): boolean | null {
  if (answer === "yes") return true;
  if (answer === "no") return false;
  return null;
}

/** <input type="date"> only understands YYYY-MM-DD, so both sides get cut to it. */
export function isoDate(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

export function trimmed(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/**
 * The stored month count split over the two age inputs. A half that comes out
 * zero stays empty rather than reading "0", except when the whole age is zero
 * and the months box is the only place left to show it. In the crawled editor
 * two empty boxes are also what reverting the field looks like.
 */
export function ageParts(total: number | null): {
  years: string;
  months: string;
} {
  if (total === null) return { years: "", months: "" };
  const years = Math.floor(total / 12);
  const months = total % 12;
  return {
    years: years === 0 ? "" : String(years),
    months: months === 0 && years !== 0 ? "" : String(months),
  };
}

/** Both halves of the age are whole counts, never a fraction or a minus. */
export function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Which of the two age inputs holds something that is not a count. */
export type AgeBox = "years" | "months";

/**
 * The hint a field renders, named so its control can point aria at it. The
 * field is a plain string: the listing form names two rows the crawled editor
 * has no field for.
 */
export function hintId(uid: string, field: string): string {
  return `${uid}-${field}-hint`;
}

type StatusMeta = {
  label: string;
  icon: LucideIcon;
  /** Selected state, where it differs from the card's own green accent. */
  selected?: string;
  /** Read-only badge on the card header. */
  badge: string;
};

export const STATUS_META: Record<PortalStatus, StatusMeta> = {
  available: {
    label: "Na voljo",
    icon: PawPrint,
    badge:
      "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]",
  },
  reserved: {
    label: "Rezerviran",
    icon: BookmarkCheck,
    selected:
      "border-amber-500/40 bg-amber-500/15 text-amber-700 hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-300",
    badge:
      "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  adopted: {
    label: "Oddan",
    icon: HeartHandshake,
    selected:
      "border-foreground bg-foreground text-background hover:border-foreground hover:bg-foreground hover:text-background",
    badge: "border-transparent bg-foreground text-background",
  },
  hold: {
    label: "Zadržan",
    icon: Pause,
    selected:
      "border-foreground/25 bg-muted text-foreground hover:border-foreground/25 hover:bg-muted hover:text-foreground",
    badge: "border-transparent bg-muted text-muted-foreground",
  },
};

/**
 * Every choice card in the portal is the public filters' card with an icon
 * and a label centred inside it. Layout stays with the caller.
 */
export function choiceCard(selected: boolean, className?: string): string {
  return cn(
    filterCardVariants({ selected }),
    "flex items-center justify-center gap-1.5",
    className,
  );
}

/**
 * A value the crawl read off the shelter's own website, drawn on the control
 * that would replace it. It has to read as "this is what your page says", not
 * as "you chose this": on the 2026-08-20 export 95% of the animals carry
 * status "available" and not one of those was typed here, so an accent on all
 * of them would present our reading as the shelter's answer and leave nothing
 * to distinguish the ones they have actually confirmed.
 */
export const CHOICE_CARD_INHERITED =
  "border-dashed border-foreground/30 bg-muted/40 text-foreground hover:border-foreground/40 hover:bg-muted/40";

/**
 * The fields an adopter filters the public site by that the crawl almost
 * never reads. On the 2026-08-20 export not one of the 503 animals carried an
 * energy level or a "good with kids" answer, so those filters return nothing
 * however many animals would in fact match. Only a shelter can close that,
 * which is why the card names the ones still unanswered.
 *
 * The labels are the short form on purpose: they run together on one line
 * under the card, where the full "Se razume z otroki" would not fit.
 */
export const SEARCHABLE_FIELDS = [
  { key: "energy", label: "energija" },
  { key: "goodWithKids", label: "otroci" },
  { key: "goodWithDogs", label: "psi" },
  { key: "goodWithCats", label: "mačke" },
  { key: "apartmentOk", label: "stanovanje" },
] as const;

/**
 * The same five under the names the form gives them. The editor page lists
 * them one per line beside the form, where there is room for the whole name
 * and where the checklist has to read as the same thing as the rows it sits
 * next to.
 */
export const SEARCHABLE_LABELS: Record<
  (typeof SEARCHABLE_FIELDS)[number]["key"],
  string
> = {
  energy: portalText.fieldEnergy,
  goodWithKids: portalText.fieldGoodWithKids,
  goodWithDogs: portalText.fieldGoodWithDogs,
  goodWithCats: portalText.fieldGoodWithCats,
  apartmentOk: portalText.fieldApartmentOk,
};

/**
 * Selected state for a deliberate "I don't know" answer. It is still a
 * choice, not a blank, so it stays marked selected, just without the green
 * accent that means "known and positive".
 *
 * The data-[state=on]: half is not a duplicate of the plain half. The cards
 * are ToggleGroup items, and both toggleVariants and filterCardVariants spell
 * their selected accent against data-[state=on], which outranks a bare
 * border-, bg- or text- utility however late tailwind-merge puts it. Without
 * the repeats the "Ni znano" card came out green-bordered and green-lettered
 * over a muted fill.
 */
export const CHOICE_CARD_MUTED =
  "border-foreground/25 bg-muted text-foreground hover:border-foreground/25 hover:bg-muted hover:text-foreground data-[state=on]:border-foreground/25 data-[state=on]:bg-muted data-[state=on]:text-foreground data-[state=on]:hover:bg-muted data-[state=on]:hover:text-foreground";

/**
 * The species cards a manual listing opens with. The icons and the Slovenian
 * are the public site's own, so the card a shelter picks is the tab an
 * adopter later filters the grid by.
 *
 * Keyed off SPECIES_ORDER rather than listed, so a species added to the
 * schema fails to compile here instead of quietly missing from the form.
 */
export const SPECIES_META: Record<
  (typeof SPECIES_ORDER)[number],
  ChoiceMeta
> = {
  dog: { label: speciesLabel("dog", "sl"), icon: SPECIES_ICONS.dog },
  cat: { label: speciesLabel("cat", "sl"), icon: SPECIES_ICONS.cat },
  rabbit: { label: speciesLabel("rabbit", "sl"), icon: SPECIES_ICONS.rabbit },
  other: { label: speciesLabel("other", "sl"), icon: SPECIES_ICONS.other },
};
