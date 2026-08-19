import {
  BookmarkCheck,
  Cat,
  Check,
  CircleHelp,
  Dog,
  HeartHandshake,
  Mars,
  Pause,
  PawPrint,
  Rabbit,
  Venus,
  X,
  type LucideIcon,
} from "lucide-react";
import { ENERGY_ICONS } from "@/lib/animal-icons";
import {
  PORTAL_COMPATIBILITIES,
  PORTAL_ENERGIES,
  type PortalCompatibility,
  type PortalEnergy,
  type PortalSex,
  type PortalSize,
  type PortalStatus,
} from "@/lib/portal-api";

// The species arrives as a plain string from the API, which reads it out of
// the dataset. An unknown one gets the generic paw rather than nothing.
export const SPECIES_ICONS: Record<string, LucideIcon> = {
  dog: Dog,
  cat: Cat,
  rabbit: Rabbit,
  other: PawPrint,
};

export const FALLBACK_SPECIES_ICON = PawPrint;

const SPECIES_LABELS: Record<string, string> = {
  dog: "Pes",
  cat: "Mačka",
  rabbit: "Zajček",
  other: "Druga žival",
};

export function speciesLabel(species: string | null): string {
  return (species && SPECIES_LABELS[species]) || "Žival";
}

type StatusMeta = {
  label: string;
  icon: LucideIcon;
  /** Selected state. Green means available, amber pending, black final, grey paused. */
  selected: string;
  /** Read-only badge on the card header. */
  badge: string;
};

export const STATUS_META: Record<PortalStatus, StatusMeta> = {
  available: {
    label: "Na voljo",
    icon: PawPrint,
    selected:
      "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)] hover:border-[var(--filter-accent-border)] hover:bg-[var(--filter-accent)] hover:text-[var(--filter-accent-foreground)]",
    badge:
      "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]",
  },
  reserved: {
    label: "Rezerviran",
    icon: BookmarkCheck,
    selected:
      "border-amber-500/40 bg-amber-500/15 text-amber-700 hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-300",
    badge:
      "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  adopted: {
    label: "Oddan",
    icon: HeartHandshake,
    selected:
      "border-foreground bg-foreground text-background hover:border-foreground hover:bg-foreground hover:text-background",
    badge: "border-transparent bg-foreground text-background",
  },
  hold: {
    label: "Zadržan",
    icon: Pause,
    selected:
      "border-foreground/25 bg-muted text-foreground hover:border-foreground/25 hover:bg-muted hover:text-foreground",
    badge: "border-transparent bg-muted text-muted-foreground",
  },
};

export function isPortalStatus(value: string | null): value is PortalStatus {
  return value !== null && value in STATUS_META;
}

export const SEX_META: Record<PortalSex, { label: string; icon: LucideIcon }> = {
  male: { label: "Samec", icon: Mars },
  female: { label: "Samica", icon: Venus },
  unknown: { label: "Ni znano", icon: CircleHelp },
};

export function isPortalSex(value: string | null): value is PortalSex {
  return value !== null && value in SEX_META;
}

// The paw grows with the size, so the three read as one scale before the
// labels are read at all.
export const SIZE_META: Record<
  PortalSize,
  { label: string; iconClass: string }
> = {
  small: { label: "Majhna", iconClass: "size-3.5" },
  medium: { label: "Srednja", iconClass: "size-4.5" },
  large: { label: "Velika", iconClass: "size-5.5" },
};

export function isPortalSize(value: string | null): value is PortalSize {
  return value !== null && value in SIZE_META;
}

/**
 * Same three levels and the same icons the public energy filter uses, so a
 * shelter picks the card the adopter will later search by.
 */
export const ENERGY_META: Record<
  PortalEnergy,
  { label: string; icon: LucideIcon }
> = {
  calm: { label: "Miren", icon: ENERGY_ICONS.calm },
  balanced: { label: "Uravnotežen", icon: ENERGY_ICONS.balanced },
  lively: { label: "Živahen", icon: ENERGY_ICONS.lively },
};

export function isPortalEnergy(value: string | null): value is PortalEnergy {
  return (
    value !== null && (PORTAL_ENERGIES as readonly string[]).includes(value)
  );
}

/** Answers shared by the three "gets on with" fields (kids, dogs, cats). */
export const COMPATIBILITY_META: Record<
  PortalCompatibility,
  { label: string; icon: LucideIcon }
> = {
  yes: { label: "Da", icon: Check },
  no: { label: "Ne", icon: X },
  unknown: { label: "Ni znano", icon: CircleHelp },
};

export function isPortalCompatibility(
  value: string | null,
): value is PortalCompatibility {
  return (
    value !== null &&
    (PORTAL_COMPATIBILITIES as readonly string[]).includes(value)
  );
}

/** One surface contract for every choice card in the portal, matching the filters. */
export const CHOICE_CARD =
  "group relative flex min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-ui border border-border/80 bg-background text-muted-foreground shadow-xs outline-none transition-[border-color,background-color,box-shadow,color] duration-150 hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

/** Selected state for the neutral choice cards (sex, size), same green as the filters. */
export const CHOICE_CARD_SELECTED =
  "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)] hover:border-[var(--filter-accent-border)] hover:bg-[var(--filter-accent)] hover:text-[var(--filter-accent-foreground)]";

/**
 * Selected state for a deliberate "I don't know" answer. It is still a
 * choice, not a blank, so it stays marked selected, just without the green
 * accent that means "known and positive".
 */
export const CHOICE_CARD_SELECTED_MUTED =
  "border-foreground/25 bg-muted text-foreground hover:border-foreground/25 hover:bg-muted hover:text-foreground";
