// What the card and the editor page's summary both say about one animal: the
// line under the name, the address of its public page, and which of the
// adopter's filters it still leaves blank. Written once, because the two are
// the same animal on two screens.

import {
  SEARCHABLE_FIELDS,
  SEX_META,
  isPortalSex,
  isPortalStatus,
  portalSpeciesLabel,
} from "@/components/portal/portal-fields";
import type { AnimalFields } from "@/lib/animal";
import { animalPath } from "@/lib/animal-path";
import { ageInMonths } from "@/lib/filters";
import { formatAge, pick } from "@/lib/labels";
import { isOverridden } from "@/components/portal/animal-form";
import { fill, portalText } from "@/components/portal/portal-text";
import type {
  PortalAnimal,
  PortalListing,
  PortalShelter,
  PortalStatus,
} from "@/lib/portal-api";

/**
 * What the line under the name is read off. A crawled animal and a manual
 * listing both carry these five under the same names, so both go through the
 * one function and the two cards cannot drift apart.
 */
type MetaFields = {
  species: string | null;
  breed: string | null;
  sex: string | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
};

// The public site's arithmetic, read through the API's nulls, so the same
// birth date turns into the same number of months on both sides.
//
// The date it is measured from is deliberately not the same one. The public
// site reads ages off the export it is serving (see animal-grid.tsx), because
// its pages are prerendered and the ages printed on them have to match the
// list they were filtered into. The portal is looking at live records, so
// today is the honest answer here, and at a month boundary the two can differ
// by one month for the same animal.
function ageMonths(animal: MetaFields, now: Date): number | undefined {
  return ageInMonths(
    {
      birthDate: animal.birthDate ?? undefined,
      approximateAgeMonths: animal.approximateAgeMonths ?? undefined,
    },
    now,
  );
}

export function portalMetaLine(animal: MetaFields, now: Date): string {
  const months = ageMonths(animal, now);
  return [
    portalSpeciesLabel(animal.species),
    // Crawled or typed here, the breed is the word staff recognise the animal
    // by, so it sits next to the species rather than only inside the editor.
    animal.breed ?? "",
    isPortalSex(animal.sex) && animal.sex !== "unknown"
      ? SEX_META[animal.sex].label.toLowerCase()
      : "",
    months === undefined ? "" : formatAge(months, "sl"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The public address of this animal's own page. animalPath() takes a dataset
 * animal and the portal never holds one, but it reads only the id, the name,
 * the species and the shelter's town and id (see lib/animal-path.ts), and the
 * portal has all five. The value is complete for the call, which is what the
 * cast stands on.
 *
 * The name is handed in rather than read off the animal. The address carries
 * the name, the public site is a static export rebuilt about every twelve
 * hours, and its animal route generates no page for a slug that was not in
 * that build (dynamicParams is false). A rename saved here therefore names a
 * page that does not exist yet, so the link keeps the name the animal was
 * listed under and the surface drawing it says so beside it.
 */
export function portalPublicPath(
  animal: PortalAnimal,
  shelter: PortalShelter,
  name: string | null,
): string {
  return publicPath(animal.id, name, animal.species ?? "zival", shelter);
}

/** The one call, so the cast above is written once. */
function publicPath(
  id: string,
  name: string | null,
  species: string,
  shelter: PortalShelter,
): string {
  const fields = {
    id,
    name: name ?? undefined,
    species,
    shelter: { id: shelter.slug, city: shelter.city ?? "" },
  } as unknown as AnimalFields;
  return animalPath(fields, "sl");
}

/**
 * The public address of one manual listing's page.
 *
 * The id is the one the public site knows the animal by, and that is not the
 * uuid the portal minted: ingest enters a listing at the crawl phase as
 * `<providerId>:<uuid>` (see docs/MANUAL-LISTINGS.md), and the address carries
 * a hash of it.
 *
 * The name is handed in for the same reason as above: a listing renamed here
 * names a page the last build did not generate, so the link keeps the name the
 * list loaded with.
 */
export function portalListingPublicPath(
  listing: PortalListing,
  shelter: PortalShelter,
  name: string,
): string {
  return publicPath(
    `${listing.providerId}:${listing.id}`,
    name,
    listing.species,
    shelter,
  );
}

/**
 * The searchable fields this animal still has no answer for, keys and all.
 * The line under the card prints the labels; the keys are what lets it link
 * to the editor at the first of them. A listing answers the same five, so
 * both cards ask this.
 */
export function missingSearchableFields(
  animal: Record<(typeof SEARCHABLE_FIELDS)[number]["key"], string | null>,
) {
  return SEARCHABLE_FIELDS.filter((field) => animal[field.key] === null);
}

/**
 * "{n} manjka" with the verb in the form Slovenian wants for that count.
 * pick() is the site's one dual-and-plural ladder, so this cannot drift from
 * the counts the public grid prints.
 */
export function missingCountLabel(count: number): string {
  return fill(
    pick(count, [
      portalText.missingOne,
      portalText.missingTwo,
      portalText.missingFew,
      portalText.missingMany,
    ]),
    { count },
  );
}

/** The status as the portal edits it, and whose answer it is. */
export function statusOf(animal: PortalAnimal): {
  status: PortalStatus | null;
  /**
   * "shelter" once the shelter has picked or confirmed a value, "site" while
   * it is still the crawl's reading of their own page.
   */
  source: "shelter" | "site";
} {
  return {
    status: isPortalStatus(animal.status) ? animal.status : null,
    source: isOverridden(animal, "status") ? "shelter" : "site",
  };
}

/**
 * A status the shelter has not made its own yet. Only these are what the
 * banner above the list offers to confirm in one go; an animal with no status
 * at all is not among them, because there is nothing to confirm.
 */
export function hasUnconfirmedStatus(animal: PortalAnimal): boolean {
  const { status, source } = statusOf(animal);
  return status !== null && source === "site";
}

/** The same question as missingSearchableFields, without building the list. */
export function hasMissingSearchableFields(animal: PortalAnimal): boolean {
  return SEARCHABLE_FIELDS.some((field) => animal[field.key] === null);
}

/**
 * Whether the animal belongs in the "Za pregled" filter: something on it is
 * still waiting for the shelter, either the status or one of the fields an
 * adopter searches by.
 */
export function needsReview(animal: PortalAnimal): boolean {
  return hasUnconfirmedStatus(animal) || hasMissingSearchableFields(animal);
}
