import type { AdoptionProvider } from "@posvoji/provider-sdk";
import macjaHisa from "@posvoji/provider-macja-hisa";
import muri from "@posvoji/provider-muri";
import obalno from "@posvoji/provider-obalno";
import zonzani from "@posvoji/provider-zonzani";

// Merged providers go here. Whether one actually runs is decided by its
// policy.yaml, not by this list.
export const providers: AdoptionProvider[] = [macjaHisa, muri, obalno, zonzani];
