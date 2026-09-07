import type { Animal, AnimalSource } from "@posvoji/schema";
import type { PermittedPhoto } from "@/lib/animal-images";

/**
 * The two shapes an animal has on this site, and the one type both answer to.
 *
 * The dataset's `Animal` is what ingest wrote: every photo with its source
 * URL, its rights and our cached copy beside them, and a `source` block
 * recording where the listing came from and when the crawl last saw it.
 * `ClientAnimal` is the same animal after lib/dataset.ts has resolved those
 * photos into what a surface actually draws and cut that block down to the one
 * field a surface links to, and it is what crosses into a client component.
 */

/** What `source` still says once an animal has crossed the client boundary:
 *  the shelter's own listing page, which the dialog and the shelter block link
 *  to.
 *
 *  The rest of `AnimalSource` is ingest bookkeeping, and no surface in
 *  apps/web reads it off an animal. Nothing names `providerId`,
 *  `sourceAnimalId` or `fetchedAt` at all; `firstSeenAt` appears only in a
 *  comment in lib/sort.ts, saying why it is not a substitute for `intakeDate`;
 *  `lastSeenAt` is read only by app/sitemap.ts, on the server, off the dataset
 *  animal and never off this projection. (The portal's `providerId` is a field
 *  of its own listing type, not of this one.) */
export type ClientAnimalSource = Pick<AnimalSource, "sourceUrl">;

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
  source: ClientAnimalSource;
};

/** An animal as a client component receives it: photos already resolved to
 *  the file each one is drawn from, the ones no surface may draw already
 *  dropped, and nothing on the wire that only the server needed. See
 *  animalsForClient in lib/dataset.ts. */
export type ClientAnimal = AnimalFields & { images: PermittedPhoto[] };

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
 * The `source` bookkeeping goes the same way, and for the same reason it goes
 * in animalsForClient: nothing reads it past this boundary, and the type says
 * so. Leaving it on the object while the type denied it would have shipped
 * two ids and three timestamps into every animal page's payload that no
 * surface could even name, which is the shape of waste this function exists
 * to remove.
 */
export function animalFields(animal: Animal): AnimalFields {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out only to leave it behind
  const { images, source, ...fields } = animal;
  return { ...fields, source: { sourceUrl: source.sourceUrl } };
}
