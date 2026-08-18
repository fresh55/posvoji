import type { AdoptionProvider } from "@posvoji/provider-sdk";
import horjul from "@posvoji/provider-horjul";
import ljubljana from "@posvoji/provider-ljubljana";
import macjaHisa from "@posvoji/provider-macja-hisa";
import muri from "@posvoji/provider-muri";
import obalno from "@posvoji/provider-obalno";
import zonzani from "@posvoji/provider-zonzani";

// Merged providers go here. Whether one actually runs is decided by its
// policy.yaml, not by this list.
export const providers: AdoptionProvider[] = [
  horjul,
  ljubljana,
  macjaHisa,
  muri,
  obalno,
  zonzani,
];
