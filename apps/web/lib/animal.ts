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
