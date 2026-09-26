// The questions the quick answers page asks, which animals it asks them of,
// and what a tap on each answer sends. Kept apart from the page so the rules
// can be tested without it, and so the workspace notice counts with the very
// same predicate the page walks by.

import { CircleHelp, type LucideIcon } from "lucide-react";
import {
  COMPATIBILITY_META,
  ENERGY_META,
  SIZE_META,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSize,
  type ChoiceMeta,
} from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { FACET_ICONS, GOOD_WITH_ICONS } from "@/lib/animal-icons";
import {
  PORTAL_COMPATIBILITIES,
  PORTAL_ENERGIES,
  PORTAL_SIZES,
  type PortalAnimalPatch,
} from "@/lib/portal-api";

/** The five answers, in the order the page asks for them. */
export const QUICK_FIELDS = [
  "goodWithKids",
  "goodWithDogs",
  "goodWithCats",
  "size",
  "energy",
] as const;

export type QuickField = (typeof QUICK_FIELDS)[number];

/** What one save of the page carries: some of the five, never anything else. */
export type QuickPatch = Pick<PortalAnimalPatch, QuickField>;

/**
 * What the page reads of a record. A crawled animal and a manual listing both
 * carry these under the same names, so both go through the same page.
 */
export type QuickRecord = {
  id: string;
  name: string | null;
  species: string | null;
  status: string | null;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
} & Record<QuickField, string | null>;

/**
 * The Ne vem card every question ends with. It is a card the page draws and
 * never a value it sends; see answerPatch for what a tap on it does. The key
 * is the household questions' own "unknown", so a stored unknown, which the
 * editor's "Ni znano" writes, shows as this card.
 */
export const UNKNOWN = "unknown";

const UNKNOWN_META: ChoiceMeta = {
  label: portalText.quickUnknown,
  icon: CircleHelp,
  mutedWhenSelected: true,
};

const SIZE_CHOICES = [...PORTAL_SIZES, UNKNOWN] as const;
const ENERGY_CHOICES = [...PORTAL_ENERGIES, UNKNOWN] as const;

// The editor's own cards, with Ne vem in place of the editor's "Ni znano". The
// page asks a question, and Ne vem is how a person answers one; it is also not
// the same act, since "Ni znano" stores a value and Ne vem does not.
const HOUSEHOLD_META: Record<(typeof PORTAL_COMPATIBILITIES)[number], ChoiceMeta> = {
  ...COMPATIBILITY_META,
  unknown: UNKNOWN_META,
};
const SIZE_CHOICE_META: Record<(typeof SIZE_CHOICES)[number], ChoiceMeta> = {
  ...SIZE_META,
  unknown: UNKNOWN_META,
};
const ENERGY_CHOICE_META: Record<(typeof ENERGY_CHOICES)[number], ChoiceMeta> = {
  ...ENERGY_META,
  unknown: UNKNOWN_META,
};

export type QuickQuestion = {
  field: QuickField;
  /** The question as the page asks it, and the name of its row of cards. */
  label: string;
  /** The mark the public site gives the same question. */
  icon: LucideIcon;
  options: readonly string[];
  meta: Readonly<Record<string, ChoiceMeta>>;
};

export const QUICK_QUESTIONS: readonly QuickQuestion[] = [
  {
    field: "goodWithKids",
    label: portalText.quickKids,
    icon: GOOD_WITH_ICONS.kids,
    options: PORTAL_COMPATIBILITIES,
    meta: HOUSEHOLD_META,
  },
  {
    field: "goodWithDogs",
    label: portalText.quickDogs,
    icon: GOOD_WITH_ICONS.dogs,
    options: PORTAL_COMPATIBILITIES,
    meta: HOUSEHOLD_META,
  },
  {
    field: "goodWithCats",
    label: portalText.quickCats,
    icon: GOOD_WITH_ICONS.cats,
    options: PORTAL_COMPATIBILITIES,
    meta: HOUSEHOLD_META,
  },
  {
    field: "size",
    label: portalText.fieldSize,
    icon: FACET_ICONS.size,
    options: SIZE_CHOICES,
    meta: SIZE_CHOICE_META,
  },
  {
    field: "energy",
    label: portalText.fieldEnergy,
    icon: FACET_ICONS.energy,
    options: ENERGY_CHOICES,
    meta: ENERGY_CHOICE_META,
  },
];

/**
 * Whether the public site asks this species its size. Velikost sorts dogs and
 * the other animals; nobody shops for a cat by it, so the site never counts a
 * cat as missing one (groupFitsSpecies in lib/filters/engine.ts) and neither
 * does this page. A test holds the two together.
 */
export function asksSize(species: string | null): boolean {
  return species !== "cat";
}

/** The questions this record is asked, in the page's order. */
export function questionsFor(species: string | null): readonly QuickQuestion[] {
  return asksSize(species)
    ? QUICK_QUESTIONS
    : QUICK_QUESTIONS.filter((question) => question.field !== "size");
}

/** Whether a stored value is an answer the page can show as a card. */
export function isAnswer(field: QuickField, value: string | null): boolean {
  if (field === "size") return isPortalSize(value);
  if (field === "energy") return isPortalEnergy(value);
  return isPortalCompatibility(value);
}

/** The questions this record still has no answer to. */
export function missingAnswers(record: QuickRecord): QuickField[] {
  return questionsFor(record.species)
    .map((question) => question.field)
    .filter((field) => !isAnswer(field, record[field]));
}

/**
 * Whether a round asks this record anything. An animal that has already gone
 * to a home can no longer be found by an adopter, so it is never asked.
 */
export function needsAnswers(record: QuickRecord): boolean {
  return record.status !== "adopted" && missingAnswers(record).length > 0;
}

/**
 * The animals one round goes through, in the order of the list: every one
 * still missing an answer, and the one the address names even when it has
 * been answered since, so a reload lands back on it.
 */
export function roundOf(
  records: readonly QuickRecord[],
  current: string | null,
): string[] {
  return records
    .filter((record) => record.id === current || needsAnswers(record))
    .map((record) => record.id);
}

/**
 * The round a reload picks up again: the one this tab stored, when the
 * address is still inside it, less any animal that has left the list since.
 * Anything else starts a new round from the list as it is now.
 */
export function resumeRound(
  stored: readonly string[] | null,
  records: readonly QuickRecord[],
  current: string | null,
): string[] {
  if (stored && current && stored.includes(current)) {
    const listed = new Set(records.map((record) => record.id));
    return stored.filter((id) => listed.has(id));
  }
  return roundOf(records, current);
}

/**
 * Where Naprej goes from `from`: the first animal after it that still misses
 * an answer, or -1 when there is none and the round is over. Animals answered
 * since the round began are stepped over, wherever they were answered.
 */
export function nextOpen(
  round: readonly string[],
  from: number,
  byId: ReadonlyMap<string, QuickRecord>,
): number {
  for (let index = from + 1; index < round.length; index += 1) {
    const record = byId.get(round[index]!);
    if (record && needsAnswers(record)) return index;
  }
  return -1;
}

/**
 * What a tap on `choice` sends for one field, or null when it sends nothing.
 *
 * `own` is whether the value standing now is the shelter's own: an override
 * on a crawled animal, or anything at all on a manual listing.
 *
 * Ne vem never sends a value. It takes the shelter's own answer back, the
 * null the editor's Povrni sends, and otherwise sends nothing, on all five
 * questions alike:
 *
 * - Size and energy have no "unknown" in the data. An empty field is how the
 *   data says nobody knows.
 * - The household questions do have one, but the public filters count it as
 *   no answer, so storing it would tell adopters nothing.
 * - What the portal shows as the crawl is the crawl before the reviewed
 *   enrichment (animals.crawled.json; see docs/ANIMAL-ENRICHMENT.md). A
 *   stored answer suppresses the enrichment of its field, and on the
 *   2026-09-25 export the public site had 184 "good with cats" answers the
 *   portal does not show. An "unknown" sent from a one-tap Ne vem would
 *   replace answers the shelter cannot see from here.
 *
 * A value only the crawl has cannot be emptied from the portal at all, so
 * there Ne vem changes nothing, and the page says why.
 */
export function answerPatch(
  record: QuickRecord,
  field: QuickField,
  choice: string,
  own: boolean,
): QuickPatch | null {
  const patch: QuickPatch = {};
  if (choice === UNKNOWN) {
    if (!own) return null;
    patch[field] = null;
    return patch;
  }
  if (choice === record[field]) return null;
  if (field === "size") {
    if (!isPortalSize(choice)) return null;
    patch.size = choice;
  } else if (field === "energy") {
    if (!isPortalEnergy(choice)) return null;
    patch.energy = choice;
  } else {
    if (!isPortalCompatibility(choice)) return null;
    patch[field] = choice;
  }
  return patch;
}

/**
 * The note a row carries after Ne vem, once nothing is still on its way:
 * "open" when the field is now empty, "site" when a value the crawl read is
 * what stands. None where the stored answer is the shelter's own, which Ne
 * vem would have taken back, or where it is a stored "unknown", which is
 * already the Ne vem card.
 */
export function unknownNote(
  record: QuickRecord,
  field: QuickField,
  own: boolean,
  picked: boolean,
): "open" | "site" | null {
  if (!picked) return null;
  const value = record[field];
  if (!isAnswer(field, value)) return "open";
  if (own || value === UNKNOWN) return null;
  return "site";
}
