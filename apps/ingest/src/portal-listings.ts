import type {
  Animal,
  AnimalGoodWith,
  AnimalImage,
  ImageRights,
  ProviderPolicy,
} from "@posvoji/schema";
import type {
  PortalListing,
  PortalListingsPayload,
} from "./portal-listings-contract";
import type { ShelterEntry } from "./shelters";

// A manual listing is a crawled animal whose crawler is the portal. This
// module is that crawler: it turns one export payload into Animal records
// that enter the pipeline at the same point a provider adapter's records do,
// so carryFirstSeenAt, guardUniqueAnimalIds, guardMassRemoval,
// applyAllowedFields, the image cache and the crawled snapshot all see them
// as ordinary animals. Nothing here is injected after the override merge, and
// the override tables are not involved. See docs/MANUAL-LISTINGS.md.

// docs/DATA-POLICY.md principle 3 asks every animal to link to the listing it
// came from. For a manual listing the original is the listing on Posvoji.si
// itself, so the link is the shelter's own page on this site. The slug is the
// providerId, which is also the shelter id: the same string the shelter page
// route and the override join already depend on.
const SITE_ORIGIN = "https://posvoji.si";

export function listingSourceUrl(providerId: string): string {
  return `${SITE_ORIGIN}/zavetisca/${providerId}`;
}

// The photo rights a listing's images carry, read off the provider's own
// images policy rather than assumed. A manual shelter is expected to be
// cache-permitted, since typing a listing in is publishing it, but the policy
// stays the authority: cacheImages checks the same value again and would
// refuse a photo this module had mislabelled.
function imageRightsFor(policy: ProviderPolicy): ImageRights | undefined {
  switch (policy.images) {
    case "cache-permitted":
      return "cache-permitted";
    case "remote":
      return "display-permitted";
    case "none":
      // Not "unknown": the policy states there is no photo grant, so the
      // photos are left out entirely rather than shipped unshowable.
      return undefined;
  }
}

function goodWithOf(listing: PortalListing): AnimalGoodWith | undefined {
  const goodWith: AnimalGoodWith = {};
  if (listing.goodWithKids !== undefined) goodWith.kids = listing.goodWithKids;
  if (listing.goodWithDogs !== undefined) goodWith.dogs = listing.goodWithDogs;
  if (listing.goodWithCats !== undefined) goodWith.cats = listing.goodWithCats;
  // An empty object would serialize as "goodWith": {} and read as an answer.
  return Object.keys(goodWith).length > 0 ? goodWith : undefined;
}

// Width and height are the portal's record of the file it stored. They are
// deliberately not copied onto the image here: on Animal those two fields
// describe the cached copy, and cacheImages sets them from the file it wrote.
// Passing the portal's numbers through would promise a size for an image the
// cache may not have taken.
function imagesOf(
  listing: PortalListing,
  rights: ImageRights | undefined,
): AnimalImage[] {
  if (rights === undefined) return [];
  return listing.photos.map((photo) => ({ sourceUrl: photo.url, rights }));
}

// Why a listing produced no animal. Every one of these is reported rather
// than thrown: one shelter's misconfigured policy must not stop the run for
// the others, and a listing that is silently dropped is worse than one that
// is named.
export type ListingSkipReason =
  | "unknown-provider"
  | "provider-disabled"
  | "provider-not-manual"
  | "unknown-shelter"
  | "not-targeted";

export interface ListingSkip {
  providerId: string;
  listingId: string;
  reason: ListingSkipReason;
}

export interface ListingApplied {
  providerId: string;
  listingId: string;
  animalId: string;
  updatedAt: string;
}

export interface BuildListingsResult {
  animals: Animal[];
  applied: ListingApplied[];
  skipped: ListingSkip[];
}

type ListingDecision =
  | { build: true; policy: ProviderPolicy; shelter: ShelterEntry }
  | { build: false; reason: ListingSkipReason };

// Whether a listing may become an animal, and with what. Order matters: an
// unknown provider is reported as such rather than as an untargeted one.
function decide(
  listing: PortalListing,
  policy: ProviderPolicy | undefined,
  shelter: ShelterEntry | undefined,
  providerIds: ReadonlySet<string> | undefined,
): ListingDecision {
  if (policy === undefined) return { build: false, reason: "unknown-provider" };
  if (!policy.enabled) return { build: false, reason: "provider-disabled" };
  // Only a manual shelter may create listings. A crawled shelter's listing
  // would duplicate the animal its own site already publishes, and the two
  // would fight over one id namespace.
  if (policy.ingestion !== "manual") {
    return { build: false, reason: "provider-not-manual" };
  }
  if (providerIds && !providerIds.has(listing.providerId)) {
    return { build: false, reason: "not-targeted" };
  }
  // Animal.shelter needs a name and a city, and a manual shelter has no site
  // to read them off. Without a register entry there is no record to build.
  if (shelter === undefined) {
    return { build: false, reason: "unknown-shelter" };
  }
  return { build: true, policy, shelter };
}

function buildAnimal(
  listing: PortalListing,
  policy: ProviderPolicy,
  shelter: ShelterEntry,
  now: string,
): Animal {
  const animal: Animal = {
    // The portal mints a UUID4 per listing and never reuses it, and a manual
    // shelter has no crawled animals, so this namespace cannot collide with a
    // provider's derived ids.
    id: `${listing.providerId}:${listing.id}`,
    source: {
      providerId: listing.providerId,
      sourceAnimalId: listing.id,
      sourceUrl: listingSourceUrl(listing.providerId),
      // The run read the feed now. firstSeenAt starts at the listing's own
      // creation date and carryFirstSeenAt keeps it from the next run on,
      // exactly as it does for a crawled animal.
      fetchedAt: now,
      firstSeenAt: listing.createdAt,
      lastSeenAt: now,
    },
    shelter: { id: shelter.id, name: shelter.name, city: shelter.city },
    // A listing always states a name; every field below it may be absent.
    name: listing.name,
    species: listing.species,
    status: listing.status,
    images: imagesOf(listing, imageRightsFor(policy)),
    attribution: policy.attribution,
  };

  // Set when the listing carries the field, rather than spread with undefined
  // for the ones it does not. applyAllowedFields already treats a present but
  // undefined key as carrying nothing, and this keeps the two agreeing: the
  // record has the keys it has, the same as one a provider adapter built.
  if (listing.sex !== undefined) animal.sex = listing.sex;
  if (listing.breed !== undefined) animal.breed = listing.breed;
  if (listing.birthDate !== undefined) animal.birthDate = listing.birthDate;
  if (listing.approximateAgeMonths !== undefined) {
    animal.approximateAgeMonths = listing.approximateAgeMonths;
  }
  if (listing.size !== undefined) animal.size = listing.size;
  if (listing.energy !== undefined) animal.energy = listing.energy;
  const goodWith = goodWithOf(listing);
  if (goodWith !== undefined) animal.goodWith = goodWith;
  if (listing.apartmentOk !== undefined) {
    animal.apartmentOk = listing.apartmentOk;
  }
  if (listing.specialNeeds !== undefined) {
    animal.specialNeeds = listing.specialNeeds;
  }
  if (listing.shortDescription !== undefined) {
    animal.shortDescription = listing.shortDescription;
  }

  return animal;
}

// One export payload, as Animal records the pipeline can carry.
//
// policies is every loaded policy, disabled ones included, so a listing for a
// provider that was switched off is reported as disabled rather than as
// unknown. shelters is data/shelters.yaml, which is where a manual shelter's
// name and city come from. now is the run's timestamp, the same value for
// every listing in one run.
//
// providerIds is the providers this run is allowed to build listings for,
// from --provider. Left out, every enabled manual provider is in scope. A
// listing outside the set is skipped as "not-targeted", which is a different
// fact from a listing whose provider is not permitted to have one.
export function buildListingAnimals(
  payload: PortalListingsPayload,
  policies: ReadonlyMap<string, ProviderPolicy>,
  shelters: ReadonlyMap<string, ShelterEntry>,
  now: string,
  providerIds?: ReadonlySet<string>,
): BuildListingsResult {
  const animals: Animal[] = [];
  const applied: ListingApplied[] = [];
  const skipped: ListingSkip[] = [];

  for (const listing of payload.listings) {
    const decision = decide(
      listing,
      policies.get(listing.providerId),
      shelters.get(listing.providerId),
      providerIds,
    );
    if (!decision.build) {
      skipped.push({
        providerId: listing.providerId,
        listingId: listing.id,
        reason: decision.reason,
      });
      continue;
    }
    const animal = buildAnimal(listing, decision.policy, decision.shelter, now);
    animals.push(animal);
    applied.push({
      providerId: listing.providerId,
      listingId: listing.id,
      animalId: animal.id,
      updatedAt: listing.updatedAt,
    });
  }

  return { animals, applied, skipped };
}
