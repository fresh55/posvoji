import { cityAt, project } from "@/lib/geo";
import type { Town } from "@/lib/map-layout";
import { cn } from "@/lib/utils";
import type { CalloutRect } from "./map-callout";
import { PLATE_TOO_SMALL } from "./map-marker";

// The plate's own type, the part a printed atlas carries and a chart does not:
// the neighbours named, the water named, and three anchor towns so the outline
// reads as Slovenia to somebody who does not already know the shape. None of it
// is a control and none of it is content: aria-hidden, no pointer events, and
// foreground alpha well under the callouts, which are the type that answers
// questions.
//
// Every number below is in viewBox units and was tuned against the live plate.
// Two rules set them. Nothing
// sits within 4 units of a viewBox edge, because the SVG letterboxes into
// containers of every aspect ratio and a label on the frame is a label waiting
// to be clipped. And nothing comes within a marker's reach of a marker the real
// roster draws: markers top out at radius 7.2 (MARKER_RADIUS_STEPS in
// lib/map-layout.ts) and may drift a further few units under collision layout,
// so an anchor keeps about ten units from its own town's centre.
const FURNITURE_INK = "fill-foreground/35";

// Sized to fit the land it names. Italy, Hungary and Croatia each show only a
// wedge of themselves in this viewBox, so the type is small and letterspaced
// rather than large: spaced capitals read as a region name at any size, which
// is exactly why atlases set country names that way.
const NEIGHBOR_TYPE = 4.6;

// Slovenian names in both locales, deliberately. This is a Slovenian plate:
// an Austrian sheet writes Wien whatever language you read it in, and the
// exonyms are close enough cognates that no English reader is lost. Localizing
// them would also put the one label the map owns into the message catalogue,
// where copy edits could drift it off the cartography it belongs to.
const NEIGHBOR_LABELS: {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** Degrees around (x, y). Only for a country the frame holds as a sliver
   *  too narrow for level type; the name then runs along the sliver, which is
   *  how printed atlases set a neighbour that barely enters the sheet. */
  rotate?: number;
}[] = [
  // The Friuli plain south-west of Gorizia, which is the widest Italian ground
  // the frame holds. It ends about three units short of the frontier, measured
  // off the rendered plate, and ten short of Vitovlje's marker at (41, 137).
  { text: "ITALIJA", x: 4, y: 136, anchor: "start" },
  // Carinthia, north of the Karavanke and clear of the top edge by more than
  // the cap height.
  { text: "AVSTRIJA", x: 150, y: 14, anchor: "middle" },
  // Hungary inside this frame is a diagonal wedge east of the Goričko border,
  // which runs x 286 to 299 down y 10 to 40: about 30 units of room, but only
  // along the slant. Level type this long crossed the border into Slovenia
  // however it was anchored, so the name runs with the wedge instead.
  { text: "MADŽARSKA", x: 291, y: 17, anchor: "start", rotate: 38 },
  // Gorski kotar, well south of the Kolpa.
  { text: "HRVAŠKA", x: 215, y: 200, anchor: "middle" },
];

// Italic is the water's register on every map ever printed, so the gulf gets it
// and nothing else does. Set in the one corner the context fade deliberately
// spares (see SEA_KEEP_* above), which is the only open water in the frame.
// Two stacked lines, because the water is a column about twenty units wide and
// the name set level is thirty: one line had nowhere to stand but the Italian
// coast, which is dry land and the wrong country besides.
const SEA_LABEL = {
  lines: ["Jadransko", "morje"],
  x: 12,
  y: 191,
  leading: 5,
  size: 3.4,
};

// Three towns, no dots. A dot would be a fourth kind of mark on a plate that
// already has markers, region fills and an origin ring, and would read as a
// shelter that is not there. The name alone is enough: these are anchors for
// the eye, not entries in the roster.
//
// Ljubljana and Maribor carry real markers, and collision layout may nudge a
// marker off its projected point, so a name offset from the raw coordinate
// could drift away from the disc it appears to caption. Each name therefore
// follows its town's laid-out position when one exists, sitting just off the
// disc's own edge. Kranj has no shelter and no marker, so its name stays on
// the projected point, pushed north-west away from Škofja Loka's marker.
const CITY_ANCHOR_TYPE = 3.8;
const CITY_ANCHOR_GAP = 1.8;

// What one character of an anchor's name is worth in width, as a share of the
// type size. The box is estimated from the character count rather than
// measured: getBBox does not exist in the test environment at all, and where
// it does exist it answers for whichever font actually loaded, so a layout
// decision resting on it would differ between two machines drawing the same
// plate.
//
// The plate's sans averages near 0.52 em a glyph across mixed-case names of
// this kind, and the anchors add 0.04 em of tracking on top of that. 0.62 is
// deliberately over the sum: this estimate only decides whether a name is
// about to be read through an annotation, and being wrong one way costs an
// anchor nobody misses for as long as the hover lasts, while being wrong the
// other way is the two names interleaved that this exists to prevent.
const ANCHOR_WIDTH_PER_CHAR = 0.62;
// How far the type reaches above and below the baseline it is set on, again as
// a share of the size and again rounded outward: ascenders run near 0.72 in
// this family and descenders near 0.21.
const ANCHOR_ASCENT = 0.8;
const ANCHOR_DESCENT = 0.25;

// Whether two rectangles in user units touch at all.
function boxesOverlap(a: CalloutRect, b: CalloutRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}
/** The box an anchor's name takes up, estimated from its character count. `x`
 *  is where the text is anchored and `y` the baseline it sits on, so a name
 *  set ragged-left grows to the right of x and one set ragged-right grows to
 *  the left of it. */
function anchorBox(
  text: string,
  x: number,
  y: number,
  anchor: "start" | "end",
): CalloutRect {
  const width = text.length * CITY_ANCHOR_TYPE * ANCHOR_WIDTH_PER_CHAR;
  return {
    x: anchor === "start" ? x : x - width,
    y: y - CITY_ANCHOR_TYPE * ANCHOR_ASCENT,
    width,
    height: CITY_ANCHOR_TYPE * (ANCHOR_ASCENT + ANCHOR_DESCENT),
  };
}
const CITY_ANCHORS: {
  city: string;
  anchor: "start" | "end";
}[] = [
  { city: "Ljubljana", anchor: "start" },
  { city: "Maribor", anchor: "start" },
  { city: "Kranj", anchor: "end" },
];

export function PlateFurniture({
  towns,
  calloutRects,
  wide,
}: {
  towns: Town[];
  /** Every annotation standing on the plate right now. A town anchor drawn
   *  across one of them comes off for as long as it is up; see the anchor
   *  branch below. */
  calloutRects: CalloutRect[];
  /** Whether the plate has measured itself wide enough to draw the anchors at
   *  all. The class below still hides them; this is what stops the layout work
   *  behind them. See markersVisible in ShelterMap. */
  wide: boolean;
}) {
  return (
    // Every name on this layer is set in the map's own units, so a plate drawn
    // a third the size sets them a third the size with it: on a phone the
    // country names and the water came out four or five pixels, which is not
    // quiet type, it is dirt on the paper. They leave at the same width the
    // paws and the markers leave at, which is the width below which nothing
    // this small can be read.
    <g
      aria-hidden
      data-map-furniture
      className={cn("pointer-events-none", PLATE_TOO_SMALL)}
    >
      {NEIGHBOR_LABELS.map((label) => (
        <text
          key={label.text}
          data-map-neighbor={label.text}
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
          fontSize={NEIGHBOR_TYPE}
          transform={
            label.rotate != null
              ? `rotate(${label.rotate} ${label.x} ${label.y})`
              : undefined
          }
          className={cn("uppercase tracking-[0.16em]", FURNITURE_INK)}
        >
          {label.text}
        </text>
      ))}

      <text
        data-map-sea-label
        x={SEA_LABEL.x}
        y={SEA_LABEL.y}
        textAnchor="middle"
        fontSize={SEA_LABEL.size}
        fontStyle="italic"
        className={FURNITURE_INK}
      >
        {SEA_LABEL.lines.map((line, index) => (
          <tspan
            key={line}
            x={SEA_LABEL.x}
            y={SEA_LABEL.y + index * SEA_LABEL.leading}
          >
            {line}
          </tspan>
        ))}
      </text>

      {/* With the markers these are placed around, and by the same measured
          answer: `wide` is markersVisible in ShelterMap. On a plate too small
          for coins the whole map is about a third the size, where 3.8-unit
          type renders under five pixels, and unreadable type is not quiet, it
          is dirt. The md class that used to say this is gone from both, for
          the reason markersVisible gives. */}
      {wide && (
        <g>
          {CITY_ANCHORS.map((anchor) => {
            // The town's laid-out disc when the city has one, so the name stays
            // welded to the mark it captions however far collision layout nudged
            // it; the raw projection when it does not.
            const town = towns.find(
              (candidate) => candidate.city === anchor.city,
            );
            const at =
              town ??
              (() => {
                const raw = cityAt(anchor.city);
                return raw ? { ...project(raw), r: 0 } : null;
              })();
            if (!at) return null;
            const dx =
              anchor.anchor === "start"
                ? at.r + CITY_ANCHOR_GAP
                : -(at.r + CITY_ANCHOR_GAP + 0.7);
            const textX = at.x + dx;
            const textY = at.y + (town ? 1.4 : -3.5);
            // The cartographic convention, and the whole reason the annotations
            // report where they landed. An annotation carries no card, so a name
            // drawn under one interleaves with it letter for letter: the halo
            // keeps the annotation readable and does nothing at all for the
            // anchor. The anchor is the one that gives way, because it answers
            // no question. It is simply not on the plate while the annotation
            // is, with no transition of its own: this is not a state the name is
            // in, it is a name that is not being drawn.
            //
            // Anchor text only. The coins never move for an annotation, being
            // the subject it is about, and the neighbour and sea names are set
            // out over ground that draws no markers and raises no annotations.
            const covered = calloutRects.some((rect) =>
              boxesOverlap(
                anchorBox(anchor.city, textX, textY, anchor.anchor),
                rect,
              ),
            );
            if (covered) return null;
            return (
              <text
                key={anchor.city}
                data-map-city={anchor.city}
                x={textX}
                y={textY}
                textAnchor={anchor.anchor}
                fontSize={CITY_ANCHOR_TYPE}
                className={cn("tracking-[0.04em]", FURNITURE_INK)}
              >
                {anchor.city}
              </text>
            );
          })}
        </g>
      )}
    </g>
  );
}
