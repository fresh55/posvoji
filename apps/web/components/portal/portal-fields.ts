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
 * nothing chosen, which a tap on the chosen card gives back wherever the grid
 * lets it (see ChoiceGrid's clearable).
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
 * The three boxes the browser reads a value out of for us, and can fail to,
 * in the order both forms read them. A number box holding "2-1" and a date
 * box holding a year of 0001 both report an empty value with validity.badInput
 * set, so each page keeps its own note of which boxes are in that state.
 */
export const READ_BOXES = ["birthDate", "ageYears", "ageMonths"] as const;

export type ReadBox = (typeof READ_BOXES)[number];

/**
 * A hundred years, which is past any animal a shelter holds. The API refuses
 * the same count, so the box is refused here, where the message can sit next
 * to it, rather than by the server after the save.
 *
 * The other half of this bound is MAX_AGE_MONTHS in apps/portal/core/schemas.py.
 */
export const MAX_AGE_MONTHS = 1200;

/**
 * The two age boxes as the one month count the wire carries.
 *
 * An empty half counts as zero, so "2 let" alone is two years; only two empty
 * boxes mean no age at all, which is what clears an override. The months box
 * is not capped at eleven: "18 mesecev" adds up to the same age. A box holding
 * something that is not a count, or a total past MAX_AGE_MONTHS, yields no
 * number and names the box at fault, so the form can point at the one the
 * shelter has to fix.
 *
 * Both forms ask this, so the crawled editor and the listing form cannot come
 * to different answers about the same two boxes.
 */
export function parseAgeBoxes(
  years: string,
  months: string,
): { months: number | null; error: AgeBox | null } {
  const rawYears = years.trim();
  const rawMonths = months.trim();
  if (rawYears === "" && rawMonths === "") return { months: null, error: null };

  const wholeYears = rawYears === "" ? 0 : Number(rawYears);
  const wholeMonths = rawMonths === "" ? 0 : Number(rawMonths);
  if (!isCount(wholeYears)) return { months: null, error: "years" };
  if (!isCount(wholeMonths)) return { months: null, error: "months" };
  const total = wholeYears * 12 + wholeMonths;
  if (total > MAX_AGE_MONTHS) {
    // The years alone past the cap is the years box; otherwise the months
    // pushed a plausible year count over it.
    return {
      months: null,
      error: wholeYears * 12 > MAX_AGE_MONTHS ? "years" : "months",
    };
  }
  return { months: total, error: null };
}

/** No animal in a shelter was born before this. The other half of the bound,
 *  1900 and today, is EARLIEST_BIRTH_DATE and bounded_birth_date in
 *  apps/portal/core/schemas.py. */
export const EARLIEST_BIRTH_DATE = "1900-01-01";

/** Today as the date input spells it, in the local calendar. */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whether a birth date is one the animal could have: a real calendar day, not
 * before EARLIEST_BIRTH_DATE and not after today.
 *
 * The date input only ever hands over an ISO day or the empty string, but a
 * draft read back from storage can hold anything, so the shape is checked as
 * well. Empty is not a date and not a fault: the form treats it as no answer.
 */
export function isPlausibleBirthDate(value: string, now: Date): boolean {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return false;
  }
  return value >= EARLIEST_BIRTH_DATE && value <= localIsoDate(now);
}

/**
 * The most the API takes for each free-text field. The inputs carry these as
 * maxLength, and buildPatch cuts to them as well, because a draft read back
 * from storage or pasted past the limit never went through the input's check.
 *
 * The other half of these two bounds is the max_length on name, breed and
 * shortDescription in apps/portal/core/schemas.py.
 */
export const TEXT_LIMITS = {
  name: 200,
  breed: 200,
  shortDescription: 2000,
} as const;

/** Trimmed and cut to the limit, or null for nothing. Cut first, so a cut
 *  that lands on a space does not leave it at the end. */
export function limited(value: string, max: number): string | null {
  return trimmed(value.slice(0, max));
}

/**
 * The hint a field renders, named so its control can point aria at it. The
 * field is a plain string: the listing form names two rows the crawled editor
 * has no field for.
 */
export function hintId(uid: string, field: string): string {
  return `${uid}-${field}-hint`;
}

/**
 * The API's keys under the names the form shows them by. One table: the
 * checklist beside the form and the message a refused save carries both name
 * the same fields, and two lists would drift.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: portalText.fieldName,
  status: portalText.statusLegend,
  species: portalText.fieldSpecies,
  sex: portalText.fieldSex,
  breed: portalText.fieldBreed,
  birthDate: portalText.fieldBirthDate,
  approximateAgeMonths: portalText.fieldAgeMonths,
  size: portalText.fieldSize,
  energy: portalText.fieldEnergy,
  goodWithKids: portalText.fieldGoodWithKids,
  goodWithDogs: portalText.fieldGoodWithDogs,
  goodWithCats: portalText.fieldGoodWithCats,
  apartmentOk: portalText.fieldApartmentOk,
  specialNeeds: portalText.fieldSpecialNeeds,
  shortDescription: portalText.fieldDescription,
};

/**
 * A key not in the table is a field the form has no name for yet, and the raw
 * key is still more use to a shelter than no name at all.
 */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
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
    // The warn family, spelled as ui/badge.tsx's warn variant spells it. The
    // hover half repeats the resting values on purpose: it is there to stop
    // the choice card's own hover wash from taking the tone off a card that is
    // already picked, so it has to be the same three tokens and not quieter
    // ones. The ink is amber-800 rather than the amber-700 this held, which on
    // the 15% wash moves the 2xs badge from 4.49:1 to 6.34:1.
    selected:
      "border-[var(--status-warn-border)] bg-[var(--status-warn)] text-[var(--status-warn-foreground)] hover:border-[var(--status-warn-border)] hover:bg-[var(--status-warn)] hover:text-[var(--status-warn-foreground)]",
    badge:
      "border-[var(--status-warn-border)] bg-[var(--status-warn)] text-[var(--status-warn-foreground)]",
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
export const SEARCHABLE_LABELS = Object.fromEntries(
  SEARCHABLE_FIELDS.map(({ key }) => [key, fieldLabel(key)]),
) as Record<(typeof SEARCHABLE_FIELDS)[number]["key"], string>;

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

/**
 * The row one field draws in.
 *
 * Both forms mark their rows with data-field and their controls with
 * data-field-control, and three paths look them up: an address that opens at a
 * named row, a submit that moves the focus onto a box it refused, and the
 * card's "manjka za iskalnik" line arriving at the field it named. The two
 * selectors live here so a change to the markup cannot silently break the
 * lookup in the other form.
 */
export function fieldRow(
  form: HTMLFormElement | null,
  field: string,
): HTMLElement | null {
  return form?.querySelector<HTMLElement>(`[data-field="${field}"]`) ?? null;
}

/** The controls inside one row, in the order they are read. */
export function fieldControls(row: HTMLElement): HTMLElement[] {
  return Array.from(
    row.querySelectorAll<HTMLElement>(
      "[data-field-control] input, [data-field-control] textarea, [data-field-control] button",
    ),
  );
}

/**
 * The control of one box the browser reads for us, for the submit that has to
 * point at it and the discard that has to empty it. Through the rows rather
 * than by id, so the two forms can keep their own ids. The two age boxes share
 * a row, in the order the form reads them.
 */
export function readBoxControl(
  form: HTMLFormElement | null,
  box: ReadBox,
): HTMLInputElement | null {
  const row = fieldRow(
    form,
    box === "birthDate" ? "birthDate" : "approximateAgeMonths",
  );
  if (!row) return null;
  const control = fieldControls(row)[box === "ageMonths" ? 1 : 0];
  return control instanceof HTMLInputElement ? control : null;
}
