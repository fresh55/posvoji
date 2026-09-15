import { MAP_HEIGHT, MAP_WIDTH, cityAt, project } from "@/lib/geo";
import { OUTLINE_PATH } from "@/lib/map-regions";
import { cn } from "@/lib/utils";
import { BoundariesCredit } from "@/components/filters/map-attribution";

// Where one shelter is, at the only fidelity the registry supports: a town
// name, so a dot on the country and nothing more. No regions, no relief, no
// furniture. The twelve region shapes carry 2200 vertices to say which of them
// a single dot already stands in, and at this size their seams read as noise
// around the one mark that matters.
//
// Same viewBox as ShelterMap and the mini map (320 x 210, lib/geo.ts), so the
// dot lands where those two put the same town.

// The country's own edge, at whole viewBox units.
//
// Every vertex of OUTLINE_PATH, none of its decimals. The thinned
// MINI_OUTLINE_PATH is a third of the bytes but drops vertices two units
// apart, which is over a pixel of drift at the width this renders at and
// reads as a polygonal coast. The decimals are where the weight actually is:
// dropping them alone takes the path from 8691 to 5804 characters with all
// 816 vertices kept, and one unit is 0.65px at the 208px this draws at, so
// the worst rounding error is a third of a pixel under a 1.1 wide stroke.
// Every shelter page carries this string, so the third is worth having.
//
// Computed once when the module loads, not once per page.
const COARSE_OUTLINE_PATH = OUTLINE_PATH.replace(/\d+\.\d+/g, (n) =>
  String(Math.round(Number(n))),
);

const OUTLINE_STROKE_WIDTH = 1.1;

// The mark. The dot is the answer to the question, the halo is what makes it
// findable: a lone 5px dot on a pale silhouette is easy to miss, and a disc
// eight units across gives the eye something to land on before it reads the
// dot inside. Both in viewBox units, so they hold their proportions at every
// width the caller picks.
const HALO_RADIUS = 8;
const HALO_STROKE_WIDTH = 1;
const DOT_RADIUS = 3.4;

// A hundredth of a unit is under a hundredth of a pixel here, and every
// shelter page is prerendered.
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function ShelterLocationMap({
  city,
  label,
  outline,
  className,
}: {
  /** The shelter's town, as the registry spells it. Resolved here through
   *  cityAt, which folds case and the Slovenian accents. */
  city: string;
  /** The finished accessible name, in the caller's locale. This component
   *  never builds a string, so it never has to know which language the page
   *  is in. */
  label: string;
  /** What the drawn shape is, in the caller's locale, for the credit under
   *  it. The licence and the source are fixed text and stay here: the outline
   *  is GURS data under CC BY 4.0, which asks to be credited wherever the
   *  boundaries are drawn, so this is not optional. The found-animal plate
   *  says the same thing through MapAttribution, which also credits the
   *  relief this plate does not draw. */
  outline: string;
  className?: string;
}) {
  const at = cityAt(city);
  // A town the gazetteer does not know draws nothing. A dot placed by guess
  // would be a dot in the sea, and a shelter is better off with no map than
  // with a wrong one.
  if (!at) return null;

  const { x, y } = project(at);

  return (
    <figure
      // One plate, drawn the way /najdena-zival draws the same country: a
      // frame, a ground and a credit. Below sm only, where this had 176x116 of
      // drawing hard left in a 358px column with 180px of blank beside it and
      // nothing to say it was a map. From sm it sits in a 13rem sidebar beside
      // the contact rows, where a second border would be a card around a
      // drawing that is already inside one.
      className={cn(
        "shrink-0 max-sm:w-full max-sm:rounded-ui max-sm:border max-sm:bg-muted/40 max-sm:p-3",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={label}
        // Never a fixed width: the viewBox carries the aspect ratio and the
        // caller owns the size. The default is the width this drawing was
        // tuned at, capped so a wide plate cannot blow it up, and centred
        // because below sm the plate is wider than that cap.
        className="mx-auto h-auto w-full max-w-[320px]"
      >
        <path
          d={COARSE_OUTLINE_PATH}
          strokeWidth={OUTLINE_STROKE_WIDTH}
          // The shapes are polygonal, so a mitred corner spikes on the coast.
          strokeLinejoin="round"
          strokeLinecap="round"
          className="fill-foreground/5 stroke-foreground/45"
        />
        {/* The same accent trio the notice on this page wears: the pale
            surface, its border, and the strong ink inside. Three tokens that
            already answer for both themes, so nothing here needs a second
            colour for dark mode. */}
        <circle
          cx={round(x)}
          cy={round(y)}
          r={HALO_RADIUS}
          strokeWidth={HALO_STROKE_WIDTH}
          className="fill-brand stroke-brand-border"
        />
        <circle
          cx={round(x)}
          cy={round(y)}
          r={DOT_RADIUS}
          className="fill-brand-strong"
        />
      </svg>
      {/* In flow under the drawing rather than floated into a corner of it,
          the way the found-animal plate floats its own: that one has a
          hillshade to sit on and this one has bare paper, where a box in the
          corner would read as a label on the sea. */}
      <figcaption className="mt-1.5 text-3xs leading-tight text-muted-foreground">
        {outline}: <BoundariesCredit />
      </figcaption>
    </figure>
  );
}
