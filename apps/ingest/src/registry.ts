import type { AdoptionProvider } from "@posvoji/provider-sdk";

// Every merged provider registers its implementation here. A provider only
// actually runs when its policy.yaml is valid AND enabled (see export.ts).
export const providers: AdoptionProvider[] = [];
