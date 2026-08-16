import type { AdoptionProvider } from "@posvoji/provider-sdk";
import macjaHisa from "@posvoji/provider-macja-hisa";

// Merged providers go here. Whether one actually runs is decided by its
// policy.yaml, not by this list.
export const providers: AdoptionProvider[] = [macjaHisa];
