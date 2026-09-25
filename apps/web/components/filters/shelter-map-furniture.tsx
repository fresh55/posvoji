import { cityAt, project } from "@/lib/geo";
import type { Town } from "@/lib/map-layout";
import { cn } from "@/lib/utils";
import { intersectionArea, type CalloutRect } from "./map-callout-layout";
import { PLATE_TOO_SMALL, WHILE_COUNTS_DRAWN_HIDDEN } from "./map-marker";
import { namePlacementBox, type NamePlacement } from "./map-names";

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

// Whether two rectangles in user units touch at all. Any shared area is an
// overlap; two boxes that only meet along an edge are not. The arithmetic is
// the annotation's own, which is where every rectangle here comes from.
function boxesOverlap(a: CalloutRect, b: CalloutRect): boolean {
  return intersectionArea(a, b) > 0;
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
  names,
  wide,
}: {
  towns: Town[];
  /** Every annotation standing on the plate right now, and the origin's name
   *  and mark. A town anchor drawn across one of them comes off for as long
   *  as it is up; see the anchor branch below. */
  calloutRects: CalloutRect[];
  /** The picked towns' names, keyed by town, where placePickedNames set them.
   *  The anchors give way to these as they do to an annotation; see the
   *  anchor branch below. */
  names: ReadonlyMap<string, NamePlacement>;
  /** Whether the plate has measured itself large enough to carry this layer
   *  at all: markersVisible in ShelterMap. See the gate below. */
  wide: boolean;
}) {
  // Two answers to one question, each for the moment the other cannot give.
  // Before anything is measured `wide` is true, which keeps the server's
  // markup and the first paint identical, and the container query on the
  // layer is what hides it on a narrow stage in that paint. Once the plate
  // has measured itself, the scale decides. The query asks how wide the stage
  // is, and a stage can be far wider than the plate it letterboxes: a phone
  // held sideways gives the dialog a stage about 790px wide around a plate
  // held to about 300 by the height, so the query let the layer through, the
  // coins had already gone by the scale, and the neighbours and the sea were
  // set at about four pixels.
  if (!wide) return null;
  // Every picked name as a box, once per render rather than once per anchor.
  const nameBoxes = [...names.values()].map(namePlacementBox);
  return (
    // Every name on this layer is set in the map's own units, so a plate drawn
    // a third the size sets them a third the size with it: on a phone the
    // country names and the water came out four or five pixels, which is not
    // quiet type, it is dirt on the paper. They leave where the paws and the
    // markers leave, which is the size below which nothing this small can be
    // read.
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
        const box = anchorBox(anchor.city, textX, textY, anchor.anchor);
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
        if (calloutRects.some((rect) => boxesOverlap(box, rect))) return null;
        // The picked names outrank an anchor the same way. A picked town
        // carries its name under its coin, in full ink and a heavier weight,
        // and the anchor beside it was the same word a second time a few
        // units away: Maribor picked read "Maribor" twice. Another town's
        // picked name set across an anchor interleaves with it as an
        // annotation would: one picked in Radovljica runs across Kranj's.
        //
        // Hidden rather than left out, and only where the picked names are
        // drawn. They go with the counts (COUNT_TOO_SMALL in map-marker.tsx),
        // and between that width and the one the coins leave at the anchor
        // is still the town's only name on the plate.
        const underName =
          (town !== undefined && names.has(town.key)) ||
          nameBoxes.some((rect) => boxesOverlap(box, rect));
        return (
          <text
            key={anchor.city}
            data-map-city={anchor.city}
            x={textX}
            y={textY}
            textAnchor={anchor.anchor}
            fontSize={CITY_ANCHOR_TYPE}
            className={cn(
              "tracking-[0.04em]",
              FURNITURE_INK,
              underName && WHILE_COUNTS_DRAWN_HIDDEN,
            )}
          >
            {anchor.city}
          </text>
        );
      })}
    </g>
  );
}
