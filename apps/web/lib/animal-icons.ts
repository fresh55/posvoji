import {
  Baby,
  Cat,
  Dog,
  Gauge,
  HandHeart,
  HeartPulse,
  House,
  MapPin,
  Mars,
  Moon,
  PawPrint,
  Rabbit,
  Ruler,
  ScanLine,
  Scissors,
  ShieldCheck,
  Shrub,
  Sprout,
  Syringe,
  TestTubeDiagonal,
  TreeDeciduous,
  Users,
  Venus,
  VenusAndMars,
  WavesHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AnimalSize, EnergyLevel, Sex, Species } from "@posvoji/schema";
import type {
  AgeGroup,
  FilterFacet,
  GoodWithKey,
  ToggleKey,
} from "@/lib/filters";
import type { SpeciesTab } from "@/lib/species";

// One icon per health trait, shared by the filter panel and the animal
// dialog so the same fact never arrives wearing two different symbols.
// Keyed by ToggleKey, so a new trait fails to compile here.
export const HEALTH_ICONS: Record<ToggleKey, LucideIcon> = {
  sterilizacija: Scissors,
  cepljenje: Syringe,
  cip: ScanLine,
  "brez-fiv": ShieldCheck,
  "brez-felv": TestTubeDiagonal,
};

// One icon per household question, for the dialog's facts row. The filter
// cards draw the same three animals from good-with-glyphs.tsx instead, where
// the parts move on their own, so a change here wants one there to match.
// Keyed by GoodWithKey, so a new facet fails to compile.
export const GOOD_WITH_ICONS: Record<GoodWithKey, LucideIcon> = {
  kids: Baby,
  dogs: Dog,
  cats: Cat,
};

// One icon per energy level. The three read as a tempo scale rather than a
// rating: rest, rhythm, jolt. Keyed by the schema enum, so a new level fails
// to compile.
export const ENERGY_ICONS: Record<EnergyLevel, LucideIcon> = {
  calm: Moon,
  balanced: WavesHorizontal,
  lively: Zap,
};

// Likewise for species, shared by the tabs, the result count and the dialog's
// fact chips. Keyed by the schema enum, so a new species fails to compile.
export const SPECIES_ICONS: Record<Species, LucideIcon> = {
  dog: Dog,
  cat: Cat,
  rabbit: Rabbit,
  other: PawPrint,
};

// The filter tabs, which merge rabbit and other (see lib/species.ts). The
// rabbit stands for the whole small-animal bucket: PawPrint would repeat the
// mark the result count already spends on "Vse", and today the bucket is
// rabbits. Keyed by SpeciesTab, so a new tab fails to compile.
export const SPECIES_TAB_ICONS: Record<SpeciesTab, LucideIcon> = {
  dog: Dog,
  cat: Cat,
  other: Rabbit,
};

// One icon per filter facet, for a chips-row pill that stands for a whole
// facet rather than for one value: a folded summary ("Zavetišče Mala hiša
// +3"), or a facet whose values have no mark of their own. Keyed by
// FilterFacet, so a new facet fails to compile.
export const FACET_ICONS: Record<FilterFacet, LucideIcon> = {
  sex: VenusAndMars,
  age: Sprout,
  size: Ruler,
  energy: Gauge,
  shelter: MapPin,
  toggles: HeartPulse,
  goodWith: Users,
  home: House,
  care: HandHeart,
};

// The two facets whose cards draw a mark per value but keep it in local
// geometry rather than in a lucide node: sex-cards.tsx rewrites lucide's mars
// and venus so both layers can draw one path list, and age-stage-icon.tsx
// adapts Sprout, Shrub and TreeDeciduous so the stem and the canopy can move
// apart. A chip wants neither of those; it wants the same symbol, still.
const SEX_ICONS: Record<Sex, LucideIcon> = {
  male: Mars,
  female: Venus,
  unknown: VenusAndMars,
};

const AGE_ICONS: Record<AgeGroup, LucideIcon> = {
  mladicek: Sprout,
  odrasel: Shrub,
  senior: TreeDeciduous,
};

// Size is one paw at three sizes, which is how size-paw-cards.tsx says it and
// the only way three sizes can be said with one symbol. Scaled down from the
// cards' size-3/4/5 to sit in a pill, and kept far enough apart that two size
// chips side by side are not the same picture twice.
const SIZE_PAW: Record<AnimalSize, string> = {
  small: "size-2.5",
  medium: "size-3.5",
  large: "size-[1.125rem]",
};

/** The mark a chip wears: the one its own card wore where there is one, and
 *  the facet's otherwise. A row where Samec and Samica, or Mladiček and
 *  Odrasel, carried the same symbol was a row that had to be read word by
 *  word, and it disagreed with the card the visitor had just pressed.
 *
 *  className is set only where the glyph itself has to change size to mean
 *  what it means. Everything else draws at the row's own size. */
export function filterValueGlyph(
  facet: FilterFacet,
  value: string,
): { Icon: LucideIcon; className?: string } {
  if (facet === "sex" && value in SEX_ICONS) {
    return { Icon: SEX_ICONS[value as Sex] };
  }
  if (facet === "age" && value in AGE_ICONS) {
    return { Icon: AGE_ICONS[value as AgeGroup] };
  }
  if (facet === "size" && value in SIZE_PAW) {
    return { Icon: PawPrint, className: SIZE_PAW[value as AnimalSize] };
  }
  if (facet === "energy" && value in ENERGY_ICONS) {
    return { Icon: ENERGY_ICONS[value as EnergyLevel] };
  }
  if (facet === "toggles" && value in HEALTH_ICONS) {
    return { Icon: HEALTH_ICONS[value as ToggleKey] };
  }
  if (facet === "goodWith" && value in GOOD_WITH_ICONS) {
    return { Icon: GOOD_WITH_ICONS[value as GoodWithKey] };
  }
  // shelter has a value per shelter and no symbol for any of them; dom and
  // posebna skrb have one value each, so the facet's own mark is already the
  // value's.
  return { Icon: FACET_ICONS[facet] };
}
