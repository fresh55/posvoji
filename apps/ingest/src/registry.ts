import type { AdoptionProvider } from "@posvoji/provider-sdk";
import horjul from "@posvoji/provider-horjul";
import ljubljana from "@posvoji/provider-ljubljana";
import malaHisa from "@posvoji/provider-mala-hisa";
import macjaHisa from "@posvoji/provider-macja-hisa";
import maribor from "@posvoji/provider-maribor";
import macjiDol from "@posvoji/provider-macji-dol";
import meli from "@posvoji/provider-meli";
import muri from "@posvoji/provider-muri";
import obalno from "@posvoji/provider-obalno";
import turk from "@posvoji/provider-turk";
import zonzani from "@posvoji/provider-zonzani";

// Merged providers go here. Whether one actually runs is decided by its
// policy.yaml, not by this list.
export const providers: AdoptionProvider[] = [
  horjul,
  ljubljana,
  malaHisa,
  macjaHisa,
  maribor,
  macjiDol,
  meli,
  muri,
  obalno,
  turk,
  zonzani,
];
