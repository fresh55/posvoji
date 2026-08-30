import { z } from "zod";
import {
  AdoptionStatus,
  AnimalSize,
  Compatibility,
  EnergyLevel,
  Sex,
} from "@posvoji/schema";

// The Django shelter portal (apps/portal) lets a shelter correct fields on
// its own crawled animals. This schema mirrors that portal's fixed export
// contract; it lives in ingest rather than packages/schema because it
// describes an app-to-app API, not the public dataset.
export const OverrideFields = z.strictObject({
  name: z.string().min(1).optional(),
  shortDescription: z.string().optional(),
  // A shelter correcting its own animal always states a concrete status.
  status: AdoptionStatus.exclude(["unknown"]).optional(),
  sex: Sex.optional(),
  breed: z.string().optional(),
  birthDate: z.iso.date().optional(),
  approximateAgeMonths: z.number().int().nonnegative().optional(),
  size: AnimalSize.optional(),
  energy: EnergyLevel.optional(),
  // These are flat on the wire and nested under Animal.goodWith in the
  // dataset. The merge layer owns that translation.
  goodWithKids: Compatibility.optional(),
  goodWithDogs: Compatibility.optional(),
  goodWithCats: Compatibility.optional(),
  apartmentOk: Compatibility.optional(),
  specialNeeds: z.boolean().optional(),
});
export type OverrideFields = z.infer<typeof OverrideFields>;

// A null baseline means the crawl stated nothing for that field; an absent
// key means there was no crawled animal to read. Deriving this shape keeps it
// synchronized with the override fields above.
type BaselineShape = {
  [K in keyof typeof OverrideFields.shape]: z.ZodOptional<
    z.ZodNullable<(typeof OverrideFields.shape)[K]>
  >;
};

export const BaselineFields = z.strictObject(
  Object.fromEntries(
    Object.entries(OverrideFields.shape).map(([key, field]) => [
      key,
      field.nullable().optional(),
    ]),
  ) as BaselineShape,
);
export type BaselineFields = z.infer<typeof BaselineFields>;

export const PortalOverride = z.strictObject({
  providerId: z.string().min(1),
  animalId: z.string().min(1),
  fields: OverrideFields,
  baseline: BaselineFields.optional(),
  recordedAt: z.iso.datetime().optional(),
});
export type PortalOverride = z.infer<typeof PortalOverride>;

export const PortalExportPayload = z.strictObject({
  generatedAt: z.iso.datetime(),
  overrides: z.array(PortalOverride),
});
export type PortalExportPayload = z.infer<typeof PortalExportPayload>;
