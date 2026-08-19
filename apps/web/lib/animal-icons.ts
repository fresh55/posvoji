import {
  Baby,
  Cat,
  Dog,
  Moon,
  PawPrint,
  Rabbit,
  ScanLine,
  Scissors,
  ShieldCheck,
  Syringe,
  TestTubeDiagonal,
  WavesHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { EnergyLevel, Species } from "@posvoji/schema";
import type { GoodWithKey, ToggleKey } from "@/lib/filters";

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
