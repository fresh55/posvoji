import type { Animal, ProviderPolicy } from "@posvoji/schema";
import type { PoliteClient } from "./polite-client";

export interface SourceAnimalRef {
  sourceAnimalId: string;
  sourceUrl: string;
}

export interface RawAnimal {
  ref: SourceAnimalRef;
  fetchedAt: string;
  data: unknown;
}

export interface ProviderContext {
  client: PoliteClient;
  policy: ProviderPolicy;
}

export interface AdoptionProvider {
  // Must match the folder name and the providerId in policy.yaml.
  id: string;
  discover(ctx: ProviderContext): Promise<SourceAnimalRef[]>;
  fetch(ctx: ProviderContext, ref: SourceAnimalRef): Promise<RawAnimal>;
  normalize(ctx: ProviderContext, raw: RawAnimal): Promise<Animal>;
}
