import type {
  AdoptionStatus,
  Animal,
  AnimalSource,
  TestResult,
} from "@posvoji/schema";
import type { PermittedPhoto } from "@/lib/animal-images";

/**
 * The two shapes an animal has on this site, and the one type both answer to.
 *
 * The dataset's `Animal` is what ingest wrote: every photo with its source
 * URL, its rights and our cached copy beside them, and a `source` block
 * recording where the listing came from and when the crawl last saw it.
 * `ClientAnimal` is the same animal after lib/dataset.ts has resolved those
 * photos into what a surface actually draws and cut that block down to the link
 * and verification time, and it is what crosses into a client component.
 */

/** Only the listing link and its real verification time cross this boundary.
 * Missing time remains supported for older client fixtures and is shown as unknown. */
export type ClientAnimalSource = Pick<AnimalSource, "sourceUrl"> &
  Partial<Pick<AnimalSource, "fetchedAt">>;

/** Every field an `Animal` carries except its photos, and with `source` cut to
 *  the part both shapes carry.
 *
 *  Counting, filtering, sorting and wording an animal never look at a photo,
 *  and none of them look at the bookkeeping either. Typing those against this
 *  is what lets one implementation serve both sides of the client boundary,
 *  with no cast and no second copy.
 *
 *  `source` narrows here and not only on `ClientAnimal` for the same reason
 *  `images` is omitted here rather than narrowed: once the two shapes disagree
 *  about a field, the type they share can only promise what both of them
 *  carry. Were the whole `AnimalSource` promised, no function taking
 *  `AnimalFields` could be handed a `ClientAnimal`, and the grid, the card, the
 *  dialog and shelter-summary all hand it one. A server surface that needs the
 *  bookkeeping takes an `Animal` instead; app/sitemap.ts is the only one that
 *  does. */
export type AnimalFields = Omit<Animal, "images" | "source"> & {
  source?: ClientAnimalSource;
};

/** Whether a visitor can act on this animal now: available, or an unknown
 *  that the shelter's own listing still carries. An allowlist and not a
 *  denylist of the other three, so a status added to the schema is not taken
 *  for adoptable until someone says it is. The long-stay plea (lib/labels.ts)
 *  asks it. */
export function adoptableNow(status: AdoptionStatus): boolean {
  return status === "available" || status === "unknown";
}

/** When this animal's wait began, as far as the record can say it, and
 *  whether that is only the latest day the shelter's words allow.
 *
 *  The intake date, else the found date, else intakeBy as a floor. Why the
 *  found date stands in: docs/ANIMAL-ENRICHMENT.md, "Time in the shelter".
 *  The filter, the sort, the stay line, the card's mark and the shelter
 *  summary all read this, so none of them can count a wait another leaves
 *  out. */
export type StayStart = { date: string; floor: boolean };

export function stayStart(
  animal: Pick<AnimalFields, "intakeDate" | "foundDate" | "intakeBy">,
): StayStart | undefined {
  if (animal.intakeDate) return { date: animal.intakeDate, floor: false };
  if (animal.foundDate) return { date: animal.foundDate, floor: false };
  if (animal.intakeBy) return { date: animal.intakeBy, floor: true };
  return undefined;
}

/** Whether a test was done: a positive or a negative. Absent and a recorded
 *  "unknown" are both no result. The FIV and FeLV rows count what they leave
 *  out by it (lib/filters/metadata.ts), and the dialog names the same gap. */
export function hasTestResult(result: TestResult | undefined): boolean {
  return result === "positive" || result === "negative";
}

/** An animal as a client component receives it: photos already resolved to
 *  the file each one is drawn from, the ones no surface may draw already
 *  dropped, and nothing on the wire that only the server needed. See
 *  animalsForClient in lib/dataset.ts. */
export type ClientAnimal = AnimalFields & {
  images: PermittedPhoto[];
  gallery?: { url: string; count: number };
};

/**
 * The same animal with its photos left behind, for a client component that
 * reads none of them.
 *
 * The other half of what animalsForClient does. A server component handing a
 * dataset `Animal` to a client one serializes every field of it into the
 * page's flight payload, photos included: each image carries the shelter's
 * own URL, its rights and, where ingest derived one, a base64 placeholder.
 * AnimalFacts and ShelterBlock are typed against AnimalFields precisely
 * because they never look at a photo, so on the animal page that was about
 * 3KB of unread payload per page across a thousand pages.
 *
 * Photos that are drawn go to the component that draws them (the gallery),
 * already resolved by permittedPhotos.
 *
 * Source identity and first/last-seen bookkeeping stay on the server;
 * fetchedAt now has a visible purpose in the source-verification line.
 */
export function animalFields(animal: Animal): AnimalFields {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out only to leave it behind
  const { images, source, ...fields } = animal;
  return { ...fields, source: { sourceUrl: source.sourceUrl, fetchedAt: source.fetchedAt } };
}
