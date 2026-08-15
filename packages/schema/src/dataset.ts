import { z } from "zod";
import { Animal, Species } from "./animal";

// One published crawl result. `animals.json` on the CDN conforms to this.
export const Dataset = z.strictObject({
  generatedAt: z.iso.datetime(),
  animals: z.array(Animal),
});
export type Dataset = z.infer<typeof Dataset>;

export const ChangeEntry = z.strictObject({
  id: z.string().min(1),
  providerId: z.string().min(1),
  sourceUrl: z.url(),
  species: Species,
  name: z.string().optional(),
});
export type ChangeEntry = z.infer<typeof ChangeEntry>;

// Diff between two consecutive crawl runs. `changes.json` conforms to this;
// every notification channel (RSS, bots, future email) consumes it.
export const ChangeSet = z.strictObject({
  generatedAt: z.iso.datetime(),
  added: z.array(ChangeEntry),
  updated: z.array(ChangeEntry),
  removed: z.array(ChangeEntry),
});
export type ChangeSet = z.infer<typeof ChangeSet>;
