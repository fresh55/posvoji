import { z } from "zod";
import {
  AdoptionStatus,
  AnimalSize,
  Compatibility,
  EnergyLevel,
  HttpUrl,
  Sex,
  Species,
} from "@posvoji/schema";

// A shelter with no animal list to crawl writes its animals into the portal
// instead, and this is the feed they arrive on. It sits beside
// portal-contract.ts and follows the same rules: an app-to-app API rather
// than the public dataset, so it lives in ingest and not in packages/schema,
// and it reuses the dataset's enums instead of retyping their members.
//
// docs/MANUAL-LISTINGS.md is the contract and
// apps/ingest/fixtures/portal-listings.contract.json is its authoritative
// shape. The portal asserts its own field set against that fixture and the
// schema below parses the fixture's export block, so the two sides can only
// move together.

export const PortalListingPhoto = z.strictObject({
  // Absolute, and served by the portal rather than by the shelter. Ingest
  // fetches it like any other remote photo and builds the width ladder itself.
  url: HttpUrl,
  // The stored copy's pixel size, not the upload's: the portal caps the
  // longest side at 2048 px and records what it wrote.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type PortalListingPhoto = z.infer<typeof PortalListingPhoto>;

// Optional fields are optional, never nullable. A field the shelter has not
// set is absent from the payload, which is how it maps one to one onto the
// Animal schema's optional fields: a null would have to be translated, and
// there is nothing for it to translate into.
export const PortalListing = z.strictObject({
  providerId: z.string().min(1),
  // The portal's UUID4 for the listing, minted once and never reused. It
  // becomes source.sourceAnimalId, and the animal id is derived from it.
  id: z.string().min(1),
  species: Species,
  // A shelter writing its own listing always states a concrete status, the
  // same reason the override contract excludes "unknown".
  status: AdoptionStatus.exclude(["unknown"]),
  name: z.string().min(1),
  sex: Sex.optional(),
  breed: z.string().optional(),
  birthDate: z.iso.date().optional(),
  approximateAgeMonths: z.number().int().nonnegative().optional(),
  size: AnimalSize.optional(),
  energy: EnergyLevel.optional(),
  // Flat on the wire and nested under Animal.goodWith in the dataset, as in
  // the override contract. portal-listings.ts owns that translation.
  goodWithKids: Compatibility.optional(),
  goodWithDogs: Compatibility.optional(),
  goodWithCats: Compatibility.optional(),
  apartmentOk: Compatibility.optional(),
  specialNeeds: z.boolean().optional(),
  shortDescription: z.string().optional(),
  // Ordered for display. Empty is ordinary: a shelter may write the facts
  // before it has a photo to add.
  photos: z.array(PortalListingPhoto),
  // The listing's own dates. createdAt seeds source.firstSeenAt on the run
  // that first sees the listing; carryFirstSeenAt keeps it from then on.
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PortalListing = z.infer<typeof PortalListing>;

export const PortalListingsPayload = z.strictObject({
  generatedAt: z.iso.datetime(),
  // Archived listings are not exported. A listing that leaves this array is
  // removed from the dataset the same way a crawled animal that left its
  // shelter's list page is.
  listings: z.array(PortalListing),
});
export type PortalListingsPayload = z.infer<typeof PortalListingsPayload>;
