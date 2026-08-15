import type { Animal, ProviderPolicy } from "@posvoji/schema";
import type { PoliteClient } from "./polite-client";

export interface SourceAnimalRef {
  sourceAnimalId: string;
  sourceUrl: string;
}

export interface RawAnimal {
  ref: SourceAnimalRef;
  fetchedAt: string;
  /** Provider-shaped payload extracted from the source, not yet normalized. */
  data: unknown;
}

export interface ProviderContext {
  client: PoliteClient;
  policy: ProviderPolicy;
}

export interface AdoptionProvider {
  /** Must match the folder name and policy.yaml providerId. */
  id: string;
  /** List currently published animals (cheap pass over list pages). */
  discover(ctx: ProviderContext): Promise<SourceAnimalRef[]>;
  /** Fetch one animal's detail page / record. */
  fetch(ctx: ProviderContext, ref: SourceAnimalRef): Promise<RawAnimal>;
  /** Map a raw record to the shared Animal schema. */
  normalize(ctx: ProviderContext, raw: RawAnimal): Promise<Animal>;
}

export function defineProvider(provider: AdoptionProvider): AdoptionProvider {
  return provider;
}
