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
