import type { Species } from "@posvoji/schema";

// The species half of the URL codec: Slovenian, ASCII-only, ?vrsta=pes. The
// other params are PARAM_NAMES in lib/filters.ts.
//
// Keyed by species rather than listed, so one added to the schema fails to
// compile here instead of quietly becoming unshareable.
export const SPECIES_SLUGS: Record<Species, string> = {
  dog: "pes",
  cat: "macka",
  rabbit: "zajcek",
  other: "ostalo",
};

// The order the site says species in everywhere else: the tabs, the result
// count, the dialog's fact chips, the shelter pick card.
//
// Read off the slug map rather than off the schema's Species enum, which is
// where this used to come from. That enum is a zod value, so naming it pulled
// the whole zod runtime into the browser to construct four strings: 287KB
// before hydration on 1044 of the export's 1051 pages, for nothing else.
// Record<Species, string> keeps the guarantee the enum gave, because a species
// added to the schema still fails to compile against the map above, and string
// keys keep their insertion order.
export const SPECIES_ORDER: readonly Species[] = Object.keys(
  SPECIES_SLUGS,
) as Species[];

// The tabs the site filters by. Rabbits fold into "other": a tab per species
// gave a whole tab to a single rabbit, and a merged tab holds whatever small
// animals arrive next. The card still names the animal a rabbit; only the
// filter stops distinguishing.
export type SpeciesTab = "dog" | "cat" | "other";

// Keyed by species, so one added to the schema fails to compile here instead
// of quietly disappearing from every tab.
export const TAB_OF_SPECIES: Record<Species, SpeciesTab> = {
  dog: "dog",
  cat: "cat",
  rabbit: "other",
  other: "other",
};

export const SPECIES_TAB_ORDER: readonly SpeciesTab[] = ["dog", "cat", "other"];

// The tab half of the URL codec. "ostalo" is the slug the other species
// already answered to, so links written either way keep working.
export const SPECIES_TAB_SLUGS: Record<SpeciesTab, string> = {
  dog: "pes",
  cat: "macka",
  other: "ostalo",
};

// Slugs that shared links used before the rabbit tab was folded in. Parsed,
// never written.
export const LEGACY_TAB_SLUGS: Record<string, SpeciesTab> = {
  zajcek: "other",
};
