import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import {
  linesPath,
  OUTLINE_PATH,
  ringsPath,
} from "@/lib/map-regions";
import {
  COASTLINE,
  NEIGHBOR_SHAPES,
  RIVERS,
  SLOVENIA_UNDERLAY,
} from "@/lib/neighbor-shapes";
import { cn } from "@/lib/utils";

/** The country silhouette shared by the clip and the foreground outline. */
export const COUNTRY_OUTLINE = OUTLINE_PATH;

// Tile side in user units. The viewBox is 320 x 210 and the picker draws it
// near two pixels per unit, so a 3-unit tile puts the lines about six pixels
// apart and a 0.6-unit line renders about 1.2 pixels wide: thin enough to read
// as hatching, wide enough not to alias away.
const HATCH_TILE = 3;
const HATCH_LINE_WIDTH = 0.6;

// A partly picked region wore the selected green at half opacity, which sat
// between "picked" and "a dense grey region" and read as neither. Hatching is
// the cartographic answer: the selection colour, unmistakably not solid.
//
// userSpaceOnUse rather than the default objectBoundingBox: the twelve regions
// differ in size several times over, and a tile measured in fractions of each
// bounding box would give every region its own hatch density. The line stands
// upright in the middle of the tile and patternTransform rotates the whole
// tiling, so the line never straddles a tile seam and needs no duplicate to
// close the gap at the edge.
export function MixedHatch({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
      width={HATCH_TILE}
      height={HATCH_TILE}
    >
      {/* The ground under the lines. --filter-accent is pale green on light
          and deep green on dark, and --filter-accent-strong inverts with it,
          so the hatch keeps its contrast in both themes. */}
      <rect
        width={HATCH_TILE}
        height={HATCH_TILE}
        fill="var(--filter-accent)"
      />
      <line
        x1={HATCH_TILE / 2}
        y1={0}
        x2={HATCH_TILE / 2}
        y2={HATCH_TILE}
        stroke="var(--filter-accent-strong)"
        strokeWidth={HATCH_LINE_WIDTH}
      />
    </pattern>
  );
}

// How far the context fades in from each viewBox edge, in user units. The
// letterbox around the SVG is wider than the viewBox on some aspect ratios, so
// a context layer that stopped dead at the edge would rule a rectangle across
// the panel. Roughly a twentieth of the map's width: enough to read as an
// unbounded surround, not so much that the sea disappears.
const CONTEXT_FADE = 14;

// Where the open water is, in user units, measured off the projected Natural
// Earth coastline: the Gulf of Trieste reaches the left edge below y 162 and
// the bottom edge left of x 17. The sea is the only blue on the map and the
// fade was eating exactly the corner it lives in, so the two strips that cross
// it stop short of it. The gap between the keep line and the resume line is
// the strip's own falloff along its length, so it ends in a gradient rather
// than at a seam.
const SEA_KEEP_BELOW_Y = 162;
const SEA_FADE_RESUMES_ABOVE_Y = 132;
const SEA_KEEP_LEFT_OF_X = 18;
const SEA_FADE_RESUMES_RIGHT_OF_X = 50;

// A luminance mask that is white in the middle and black at the edges. The
// strips paint translucent black over the white ground rather than a gradient
// each, so where two of them overlap in a corner the alpha compounds and the
// corner goes dark, which is what a corner should do.
//
// The left and bottom strips carry a second mask of their own, which switches
// the strip off along its length before it reaches the southwest corner. Both
// are off there, so the sea and the Italian coast around Trieste run to the
// viewBox edge at full strength. A map that ends at its frame is ordinary
// cartography; a map with its only water washed out is not.
const FADE_STRIPS = [
  {
    key: "t",
    x: 0,
    y: 0,
    w: MAP_WIDTH,
    h: CONTEXT_FADE,
    from: [0, 0],
    to: [0, 1],
  },
  {
    key: "b",
    x: 0,
    y: MAP_HEIGHT - CONTEXT_FADE,
    w: MAP_WIDTH,
    h: CONTEXT_FADE,
    from: [0, 1],
    to: [0, 0],
  },
  {
    key: "l",
    x: 0,
    y: 0,
    w: CONTEXT_FADE,
    h: MAP_HEIGHT,
    from: [0, 0],
    to: [1, 0],
  },
  {
    key: "r",
    x: MAP_WIDTH - CONTEXT_FADE,
    y: 0,
    w: CONTEXT_FADE,
    h: MAP_HEIGHT,
    from: [1, 0],
    to: [0, 0],
  },
];

// White lets the strip fade, black holds it off. Both run in user units so
// the stops sit on the coastline the numbers were read from.
const FADE_KEEPS = [
  {
    key: "l",
    x1: 0,
    y1: SEA_FADE_RESUMES_ABOVE_Y,
    x2: 0,
    y2: SEA_KEEP_BELOW_Y,
    x: 0,
    y: 0,
    w: CONTEXT_FADE,
    h: MAP_HEIGHT,
  },
  {
    key: "b",
    x1: SEA_FADE_RESUMES_RIGHT_OF_X,
    y1: 0,
    x2: SEA_KEEP_LEFT_OF_X,
    y2: 0,
    x: 0,
    y: MAP_HEIGHT - CONTEXT_FADE,
    w: MAP_WIDTH,
    h: CONTEXT_FADE,
  },
];

export function ContextFade({ id }: { id: string }) {
  return (
    <>
      {FADE_STRIPS.map((strip) => (
        <linearGradient
          key={strip.key}
          id={`${id}-${strip.key}`}
          x1={strip.from[0]}
          y1={strip.from[1]}
          x2={strip.to[0]}
          y2={strip.to[1]}
        >
          <stop offset="0" stopColor="black" stopOpacity={1} />
          <stop offset="1" stopColor="black" stopOpacity={0} />
        </linearGradient>
      ))}
      {FADE_KEEPS.map((keep) => (
        <linearGradient
          key={keep.key}
          id={`${id}-${keep.key}-keep`}
          gradientUnits="userSpaceOnUse"
          x1={keep.x1}
          y1={keep.y1}
          x2={keep.x2}
          y2={keep.y2}
        >
          <stop offset="0" stopColor="white" />
          <stop offset="1" stopColor="black" />
        </linearGradient>
      ))}
      {FADE_KEEPS.map((keep) => (
        <mask
          key={keep.key}
          id={`${id}-${keep.key}-keep-mask`}
          maskUnits="userSpaceOnUse"
          x={keep.x}
          y={keep.y}
          width={keep.w}
          height={keep.h}
        >
          <rect
            x={keep.x}
            y={keep.y}
            width={keep.w}
            height={keep.h}
            fill={`url(#${id}-${keep.key}-keep)`}
          />
        </mask>
      ))}
      <mask
        id={id}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
      >
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="white" />
        {FADE_STRIPS.map((strip) => (
          <rect
            key={strip.key}
            x={strip.x}
            y={strip.y}
            width={strip.w}
            height={strip.h}
            fill={`url(#${id}-${strip.key})`}
            mask={
              FADE_KEEPS.some((keep) => keep.key === strip.key)
                ? `url(#${id}-${strip.key}-keep-mask)`
                : undefined
            }
          />
        ))}
      </mask>
    </>
  );
}

// Same for every render, and the walk behind them is not free.
const NEIGHBOR_PATHS = NEIGHBOR_SHAPES.map((neighbor) => ({
  id: neighbor.id,
  d: ringsPath(neighbor.rings),
}));
const UNDERLAY_PATH = ringsPath(SLOVENIA_UNDERLAY);
const COASTLINE_PATH = linesPath(COASTLINE);
const RIVERS_PATH = linesPath(RIVERS.flatMap((river) => river.lines));

// The coast is an edge, not a subject. The country silhouette runs at 1.1 in
// foreground/45; this is a third of that width at just over half the alpha, so
// the two can share the Slovenian shore without the thinner one arguing.
const COASTLINE_WIDTH = 0.4;
// Thinner still, and in a tone rather than in foreground alpha, so a river
// never reads as a border. Region fills lie over these lines inside Slovenia
// and tint them down as a region gets busier, which is the order that keeps
// the choropleth the thing being read.
const RIVER_WIDTH = 0.3;

// Slovenia is an alpine country and this plate was drawing it flat. The raster
// is a real hillshade: AWS Open Data terrain tiles (Mapzen terrarium encoding,
// SRTM and friends underneath) at zoom 9, reprojected pixel by pixel through
// the inverse of project() in lib/geo.ts so a ridge lands where the border that
// follows it lands, then shaded with Horn's slope and aspect under the
// cartographic sun: azimuth 315, altitude 45. 640 x 420, twice the viewBox.
// scripts/build-map-hillshade.mjs is the whole pipeline and reruns in a minute.
//
// The raster is shadow only. Flat ground is pure white, and multiply cannot
// lighten, so nothing above the flat value could ever have shown; leaving it in
// would only have laid a grey wash over the plate. That is why the sea and the
// Pannonian plain cost nothing here and the Alps cost everything.
//
// Which leaves the two things this must not do. It must not read as a subject:
// the choropleth keeps the floor, so the opacity is set from a token the theme
// owns and is small enough that a region's density step still wins any
// comparison. And it must not read as terrain across the frontier, which is
// what the country clip is for.
//
// Dark carries its own token values. Multiply on a near-black land base has no
// headroom, so dark inverts the raster and screens it: the same slopes, drawn
// as light on dark instead of dark on light, at a lower opacity again because
// a light mark on a dark ground carries further. See --map-relief-* in
// globals.css.
function Hillshade({ clipId }: { clipId: string }) {
  return (
    <image
      data-map-hillshade
      href="/map-hillshade.png"
      x={0}
      y={0}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
      // The raster is 640 x 420 and the viewBox is 320 x 210, the same ratio,
      // so this changes no pixel. It is here so that a future viewBox cannot
      // silently letterbox the relief off its own coordinates.
      preserveAspectRatio="none"
      clipPath={`url(#${clipId})`}
      className={cn(
        "[mix-blend-mode:var(--map-relief-blend)]",
        "[filter:invert(var(--map-relief-invert))]",
        "opacity-[var(--map-relief-opacity)]",
      )}
    />
  );
}

// Slovenia used to float alone on a flat panel. This is the ground it actually
// sits on, painted before anything else: sea across the whole viewBox, then the
// neighbouring land over it. Blue survives only where no country covers it,
// which is the Adriatic corner and nowhere else, so the coast is drawn by the
// land rather than by a hand-cut sea polygon that would drift from it.
//
// The countries carry no border stroke between them. Natural Earth and GURS
// generalise the frontier about 1.4 units apart, so a stroked neighbour would
// ghost a second border alongside Slovenia's own, and a silhouette that quiet
// has no business drawing lines at all.
export function GeographicContext({
  maskId,
  clipId,
}: {
  maskId: string;
  clipId: string;
}) {
  return (
    <g aria-hidden className="pointer-events-none" mask={`url(#${maskId})`}>
      <rect
        data-map-sea
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        fill="var(--map-sea)"
      />
      {NEIGHBOR_PATHS.map((neighbor) => (
        <path
          key={neighbor.id}
          d={neighbor.d}
          data-map-abroad={neighbor.id}
          fill="var(--map-abroad)"
        />
      ))}
      {/* Natural Earth's Slovenia, in the neighbours' own tone. The real
          country covers it entirely, so it is never seen; it is here so the
          two sources' disagreement about the border cannot open a sliver of
          sea or canvas along it. */}
      <path data-map-abroad="SVN" d={UNDERLAY_PATH} fill="var(--map-abroad)" />

      <Hillshade clipId={clipId} />

      {/* Over the land fills and under everything Slovenia draws on top of
          them. Drawn straight through the border rather than stopping at it:
          a river that ends at a frontier is a thing no map has ever meant.
          Inside the country the density fills cover them, so a busy region
          quiets its own rivers and the choropleth keeps the floor. */}
      <path
        data-map-rivers
        d={RIVERS_PATH}
        fill="none"
        stroke="var(--map-river)"
        strokeWidth={RIVER_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Last, so the shore stays a clean edge over the fill it traces. It
          says where the land stops and nothing else, which is why it is a
          hairline and not a border. */}
      <path
        data-map-coastline
        d={COASTLINE_PATH}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="fill-none stroke-foreground/25"
        strokeWidth={COASTLINE_WIDTH}
      />
    </g>
  );
}
