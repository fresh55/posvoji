import {
  Cat,
  Dog,
  PawPrint,
  Rabbit,
  ScanLine,
  Scissors,
  ShieldCheck,
  Syringe,
  TestTubeDiagonal,
  type LucideIcon,
} from "lucide-react";
import type { Species } from "@posvoji/schema";
import type { ToggleKey } from "@/lib/filters";

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

// Likewise for species, shared by the tabs, the result count and the dialog's
// fact chips. Keyed by the schema enum, so a new species fails to compile.
export const SPECIES_ICONS: Record<Species, LucideIcon> = {
  dog: Dog,
  cat: Cat,
  rabbit: Rabbit,
  other: PawPrint,
};
