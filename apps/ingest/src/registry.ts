import type { AdoptionProvider } from "@posvoji/provider-sdk";
import horjul from "@posvoji/provider-horjul";
import ljubljana from "@posvoji/provider-ljubljana";
import malaHisa from "@posvoji/provider-mala-hisa";
import macjaHisa from "@posvoji/provider-macja-hisa";
import maribor from "@posvoji/provider-maribor";
import muri from "@posvoji/provider-muri";
import obalno from "@posvoji/provider-obalno";
import zonzani from "@posvoji/provider-zonzani";

// Merged providers go here. Whether one actually runs is decided by its
// policy.yaml, not by this list.
export const providers: AdoptionProvider[] = [
  horjul,
  ljubljana,
  malaHisa,
  macjaHisa,
  maribor,
  muri,
  obalno,
  zonzani,
];
