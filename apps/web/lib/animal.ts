import type { Animal } from "@posvoji/schema";
import type { PermittedPhoto } from "@/lib/animal-images";

/**
 * The two shapes an animal has on this site, and the one type both answer to.
 *
 * The dataset's `Animal` is what ingest wrote: every photo with its source
 * URL, its rights and our cached copy beside them. `ClientAnimal` is the same
 * animal after lib/dataset.ts has resolved those photos into what a surface
 * actually draws, and it is what crosses into a client component.
 */

/** Every field an `Animal` carries except its photos.
 *
 *  The two shapes differ in nothing else, and counting, filtering, sorting and
 *  wording an animal never look at a photo. Typing those against this is what
 *  lets one implementation serve both sides of the client boundary, with no
 *  cast and no second copy. */
export type AnimalFields = Omit<Animal, "images">;

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
 */
export function animalFields(animal: Animal): AnimalFields {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out only to leave it behind
  const { images, ...fields } = animal;
  return fields;
}
