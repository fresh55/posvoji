import {
  CAT_GLYPH,
  DOG_GLYPH,
  RABBIT_GLYPH,
} from "@/components/filters/animal-glyph-paths";
import type { SpeciesTab } from "@/lib/species";
import { cn } from "@/lib/utils";

// The outline each species tab wears, as path data rather than a lucide
// component, so the tab can ink it in on press (species-tabs.tsx). The data is
// checked against lucide's Dog, Cat and Rabbit in species-tabs.test.tsx.
// "Other" wears the rabbit: it is the species the tab was folded from.
export const SPECIES_GLYPHS: Record<SpeciesTab, readonly string[]> = {
  dog: DOG_GLYPH,
  cat: CAT_GLYPH,
  other: RABBIT_GLYPH,
};

/** The glyph at rest: a plain svg, the same on every surface that names a
 *  species tab. The strip draws it between beats, and the filter sheet's
 *  scope pill draws it beside the species it repeats, so the pill is the
 *  pressed tab's own mark rather than a second drawing of it. */
export function SpeciesGlyphIcon({
  tab,
  className,
}: {
  tab: SpeciesTab;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="24"
      height="24"
      className={cn("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {SPECIES_GLYPHS[tab].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
