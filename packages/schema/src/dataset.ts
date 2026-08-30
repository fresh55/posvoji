import { z } from "zod";
import { Animal, Species } from "./animal";
import { HttpUrl } from "./url";

export const Dataset = z.strictObject({
  generatedAt: z.iso.datetime(),
  animals: z.array(Animal),
});
export type Dataset = z.infer<typeof Dataset>;

export const ChangeEntry = z.strictObject({
  id: z.string().min(1),
  providerId: z.string().min(1),
  sourceUrl: HttpUrl,
  species: Species,
  name: z.string().optional(),
});
export type ChangeEntry = z.infer<typeof ChangeEntry>;

// Diff between two runs. Notification channels read this, not the full dataset.
export const ChangeSet = z.strictObject({
  generatedAt: z.iso.datetime(),
  added: z.array(ChangeEntry),
  updated: z.array(ChangeEntry),
  removed: z.array(ChangeEntry),
});
export type ChangeSet = z.infer<typeof ChangeSet>;
