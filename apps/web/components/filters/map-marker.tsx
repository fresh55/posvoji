"use client";

import { PawPrint } from "lucide-react";
import {
  clusterDiscs,
  clusterHitWedges,
  type ClusterDisc,
  discFitsGlyph,
  markerGeometry,
  markerRadius,
  MARKER_STROKE_WIDTH,
  MAX_CLUSTER_DISCS,
  selectionState,
  townIsLive,
  townSelectableValues,
  type Town,
} from "@/lib/map-layout";
import { cn } from "@/lib/utils";

// The hollow disc a shelter with nothing listed draws: just over half the
// radius the coin would have taken, no fill, foreground at 45%. Exported
// because the map legend repeats this mark at legend size, and a lookalike
// painted from other classes would drift from the real one the first time
// either moved.
//
// 0.54 rather than the 0.5 it was, so the mark keeps the absolute size it had
// before the smallest radius step dropped from 5 to 4.7: at 0.5 it would have
// come out 2.125 units where it used to be 2.275, and this disc carries no
// count to encode. Its whole message is "nothing listed here", so it has no
// reason to shrink along with a scale it does not take part in. 0.54 puts it
// at 2.295, within a rounding error of where it was.
export const EMPTY_MARKER_RADIUS_SCALE = 0.54;
export const EMPTY_MARKER_STROKE_WIDTH = 0.7;
export const EMPTY_MARKER_CLASS = "fill-none stroke-foreground/45";

// The same mark at legend size. The viewBox runs in the map's own user units,
// so the radius and the stroke keep the proportion they have on the country:
// markerRadius(0) is the radius a shelter with no animals is sized at, less
// half the coin stroke, times the scale the hollow disc takes. The box adds a
// stroke's width of air on each side so the circle is not clipped by it.
export function EmptyMarkerGlyph({ className }: { className?: string }) {
  const r =
    (markerRadius(0) - MARKER_STROKE_WIDTH / 2) * EMPTY_MARKER_RADIUS_SCALE;
  const box = (r + EMPTY_MARKER_STROKE_WIDTH) * 2;
  return (
    <svg aria-hidden viewBox={`0 0 ${box} ${box}`} className={className}>
      <circle
        data-legend-empty=""
        cx={box / 2}
        cy={box / 2}
        r={r}
        strokeWidth={EMPTY_MARKER_STROKE_WIDTH}
        className={EMPTY_MARKER_CLASS}
      />
    </svg>
  );
}

// Lifts the coin off the country behind it. The values are in SVG units, which
// the 320-wide viewBox renders about three times larger, so under a pixel here
// is the shadow the eye gets. Dropped in dark mode: a black shadow on a dark
// map is only mud.
const COIN_SHADOW =
  "[filter:drop-shadow(0_0.4px_0.5px_rgba(0,0,0,0.25))] dark:[filter:none]";

// One timing for everything the species tabs redraw: the region density fills
// over in shelter-map, the marker radii here, and the cluster discs inside
// them. The map has to move as one object, so the number lives in one place and
// both files spend it. 300ms is long enough to read as the same country under a
// different question and short enough that running down the four tabs never
// queues up a backlog of half-finished morphs. ease-out because the new shape
// is the answer: leave the old one quickly, settle into the new one.
//
// Paired with an explicit transition-property list everywhere it is used, never
// with transition-all, and always alongside motion-reduce:transition-none,
// which is the convention the rest of this file already keeps.
export const MAP_MORPH = "duration-300 ease-out motion-reduce:transition-none";

// r, cx and cy are SVG presentation attributes, and SVG2 also makes them CSS
// properties, which is the whole reason a radius can transition at all. Chrome
// and Safari have taken them from CSS for years and Firefox has since 72. Every
// circle below still sets the attribute as well as the style, so a browser that
// ignores the declaration reads the attribute and gets an instant radius rather
// than a missing one. A snap in an old browser is fine; a circle with no size
// is not.
//
// Radius rides r rather than a transform scale on the group. The group already
// spends transform on the hover scale-110, and a second scale on the same
// element would multiply into the hover instead of composing with it: a marker
// hovered mid-morph would jump, and one hovered at rest would sit at the wrong
// size for 300ms. r and transform are separate declarations, so a coin can grow
// and lean in at the same time without either knowing about the other.
//
// cx and cy come along because collision layout re-runs when the radii change,
// and a disc whose radius glides while its centre snaps tears away from the rim
// it is meant to be tangent to. The invisible hit geometry (the wedge paths and
// the per-disc hit circles) stays on the attributes and snaps, so for the
// length of the morph the target sits under a unit off the coin it belongs to.
// That is a pointer aiming at a moving mark either way, and a path's d cannot
// transition.
const DISC_MORPH = cn("transition-[r,cx,cy]", MAP_MORPH);

// The paw follows its disc. Width and height carry the glyph's size, x and y
// keep it centred as the disc moves, and a nested svg takes all four from CSS
// under the same geometry-properties rule the circles rely on.
const GLYPH_MORPH = cn("transition-[x,y,width,height]", MAP_MORPH);

// discFitsGlyph in lib/map-layout.ts decides which discs are big enough for a
// paw, and it decides in user units against RENDER_SCALE, a fixed guess at how
// many pixels a user unit is drawn at. That guess holds on a desktop and breaks
// below it: measured live, the map stage is 573px wide at a 1024 viewport with
// the panel out (smallest paw 6.6px), 400px on a landscape phone (4.5px) and
// 327px on a 768 tablet, where the paws come out 3.6 to 6.0px. A lucide paw at
// four pixels is not a quiet glyph, it is a smudge on the coin.
//
// So the per-disc gate keeps deciding which discs deserve a paw relative to
// each other, and this answers the question it cannot: is the plate drawn large
// enough for any paw to read at all. Below the cut the whole glyph layer comes
// off and the markers stay plain discs, which still carry selection by fill and
// count by radius.
//
// 512px, because the smallest paw the live roster draws is 3.9 user units and
// the stage spends 32px of its width on padding: (512 - 32) / 320 = 1.5 px per
// unit puts that paw at 5.85px, which is the floor. Above it every paw on the
// plate clears six pixels.
//
// A container query and not a viewport breakpoint, for a reason no breakpoint
// can cover: the panel folds to a rail, and the stage nearly doubles when it
// does. At a 1024 viewport the same map is 573px wide with the panel out and
// 909px with it folded, so the paws are wrong at one and right at the other
// while the viewport never moves. The stage's own width is the only thing that
// knows, and @container is how a child asks it.
const GLYPH_TOO_SMALL = "@max-[512px]/map-stage:hidden";

// Exact keyboard selection stays in the list, so markers remain pointer-only.
export function Marker({
  town,
  selected,
  onPick,
  onPointerEnter,
  onPointerLeave,
  onHoverShelter,
  hoveredShelterValue,
  highlighted,
  dimmed,
}: {
  town: Town;
  selected: string[];
  onPick: (values: string[]) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  /** A cluster wedge gained or lost the pointer. Null on leave. */
  onHoverShelter: (value: string | null) => void;
  /** The shelter whose wedge holds the pointer, so only its disc leans in. */
  hoveredShelterValue: string | null;
  /** The shelter is hovered in the list, so its marker reveals the hit halo
   *  and strengthens its stroke, same as pointer hover would. */
  highlighted: boolean;
  /** The list search matches none of this town's shelters, so the marker
   *  fades back while the matches keep full strength. */
  dimmed?: boolean;
}) {
  const shared = town.shelters.length > 1;
  // Only the shelters a click may toggle. An off-site shelter shares the
  // marker so the map can show where it is, but never the pick.
  const values = townSelectableValues(town);
  const state = selectionState(values, selected);
  const live = townIsLive(town, selected);
  // A town holding only shelters with nothing to pick is informational: hover
  // names it, nothing selects it. Unlike a dead marker it keeps its pointer
  // events, so the visitor can find out what the faint dot is.
  const info = values.length === 0;
  const geometry = markerGeometry(town);
  // Two or three discs get one hit wedge each, so a click lands on the shelter
  // it was aimed at instead of toggling the whole town. Empty for single and
  // overflow markers, which keep answering as a whole.
  const wedges = clusterHitWedges(town);
  const wedged = wedges.length > 0;
  // Sized by each shelter's own count, so the discs order the same way the
  // coins do. Empty unless this is a drawn cluster.
  const discs = clusterDiscs(town);

  // The pointer half of a cluster's per-shelter target, shared by the wedge
  // and by the disc circle painted over it.
  const hitHandlers = (value: string) => {
    const shelter = town.shelters.find((entry) => entry.value === value);
    // An off-site shelter's target names it and stops there, the same deal its
    // dot has always had.
    const pickable = live && shelter?.selectable !== false;
    return {
      pickable,
      props: {
        onClick: pickable ? () => onPick([value]) : undefined,
        onPointerEnter: () => onHoverShelter(value),
        onPointerLeave: () => onHoverShelter(null),
        className: cn(
          "fill-transparent stroke-none",
          pickable ? "cursor-pointer" : "cursor-default",
        ),
      },
    };
  };

  return (
    <g
      aria-hidden
      data-marker-kind={shared ? "cluster" : "single"}
      data-marker-key={town.key}
      data-marker-live={live}
      data-marker-shelters={town.shelters.length}
      data-marker-state={
        state === true ? "selected" : state === "mixed" ? "mixed" : "idle"
      }
      data-marker-info={info || undefined}
      data-marker-highlighted={highlighted || undefined}
      data-marker-dimmed={dimmed || undefined}
      onClick={wedged ? undefined : () => live && onPick(values)}
      onPointerEnter={wedged ? undefined : onPointerEnter}
      onPointerLeave={wedged ? undefined : onPointerLeave}
      className={cn(
        "group/pin transition-opacity motion-reduce:transition-none",
        live
          ? wedged
            ? "cursor-default"
            : "cursor-pointer"
          : info
            ? "cursor-default"
            : "pointer-events-none",
        dimmed && "opacity-30",
      )}
    >
      {/* The hit area grows into free space without covering another marker.
          It shows itself on hover, so the target you are aiming at is the
          target you can see. */}
      <circle
        cx={town.x}
        cy={town.y}
        r={town.hitR}
        className={cn(
          "fill-transparent transition-colors group-hover/pin:fill-foreground/8 motion-reduce:transition-none",
          highlighted && "fill-foreground/8",
        )}
      />

      {!shared ? (
        <MarkerDisc
          cx={town.x}
          cy={town.y}
          r={geometry.discRadius}
          glyphScale={1.15}
          selected={state === true}
          live={live}
          highlighted={highlighted}
        />
      ) : town.shelters.length > MAX_CLUSTER_DISCS ? (
        <CountDisc town={town} state={state} live={live} highlighted={highlighted} />
      ) : (
        <ClusterMarker
          town={town}
          discs={discs}
          selected={selected}
          live={live}
          highlighted={highlighted}
          hoveredShelterValue={hoveredShelterValue}
        />
      )}

      {/* Painted last so the wedges win the pointer over the halo and the
          discs alike. They are transparent: the discs stay the picture, the
          wedges only divide the target. */}
      {wedges.map(({ value, d }) => {
        const { pickable, props } = hitHandlers(value);
        return (
          <path
            key={value}
            d={d}
            data-wedge-shelter={value}
            data-wedge-pickable={pickable || undefined}
            {...props}
          />
        );
      })}

      {/* A wedge splits the target by direction, which is right out at the rim
          and wrong over the discs themselves: a large disc reaches past the
          town centre into its neighbour's wedge. One circle per disc, painted
          last and in the order the discs are drawn, so the disc under the
          pointer is the one that answers and the top disc wins where two
          overlap. */}
      {discs.map((disc) => {
        const { pickable, props } = hitHandlers(disc.value);
        return (
          <circle
            key={disc.value}
            cx={disc.x}
            cy={disc.y}
            r={disc.r + MARKER_STROKE_WIDTH / 2}
            data-disc-shelter={disc.value}
            data-disc-pickable={pickable || undefined}
            {...props}
          />
        );
      })}
    </g>
  );
}

function MarkerDisc({
  cx,
  cy,
  r,
  glyphScale,
  selected,
  live,
  discAttribute,
  shelterValue,
  highlighted,
  hoverScope = "group",
}: {
  cx: number;
  cy: number;
  r: number;
  glyphScale: number;
  selected: boolean;
  live: boolean;
  discAttribute?: string;
  shelterValue?: string;
  highlighted?: boolean;
  /** "group" leans in whenever the marker is hovered anywhere. "self" waits to
   *  be told, which is what a wedged cluster needs: one disc answers, not all
   *  of them. */
  hoverScope?: "group" | "self";
}) {
  const glyph = r * glyphScale;
  const groupHover = hoverScope === "group";
  // A shelter with nothing to pick is a place, not a control. A paw disc a
  // shade fainter still read as a control, so it draws as a different shape
  // entirely: a small plain dot. The state is carried by the shape, not by the
  // opacity.
  if (!selected && !live) {
    return (
      <g
        data-cluster-disc={discAttribute}
        data-cluster-shelter={shelterValue}
        className={cn(
          "origin-center transition-[fill,transform] [transform-box:fill-box] motion-reduce:transition-none",
          groupHover &&
            "group-hover/pin:scale-110 motion-reduce:group-hover/pin:scale-100",
          highlighted && "scale-110 motion-reduce:scale-100",
        )}
      >
        {/* Hollow, not filled: a speck read as dirt on the map. The radius,
            the stroke and the classes come from the constants above, which the
            legend's EmptyMarkerGlyph draws from as well, so the mark and the
            row explaining it cannot drift. */}
        <circle
          data-marker-empty=""
          cx={cx}
          cy={cy}
          r={r * EMPTY_MARKER_RADIUS_SCALE}
          style={{
            strokeWidth: EMPTY_MARKER_STROKE_WIDTH,
            // See DISC_MORPH: the attributes above are the fallback, these are
            // what actually animate.
            r: r * EMPTY_MARKER_RADIUS_SCALE,
            cx,
            cy,
          }}
          className={cn(
            EMPTY_MARKER_CLASS,
            // The stroke colour a hover changes joins the geometry on the
            // shared timing rather than keeping its own. One element carries
            // one transition list, and a hollow disc is small enough that its
            // whole answer, colour and size alike, should land together.
            "transition-[stroke,r,cx,cy]",
            MAP_MORPH,
            groupHover && "group-hover/pin:stroke-foreground/75",
            highlighted && "stroke-foreground/75",
          )}
        />
      </g>
    );
  }

  return (
    <g
      data-cluster-disc={discAttribute}
      data-cluster-shelter={shelterValue}
      className={cn(
        // Each disc grows around its own centre, so cluster discs breathe
        // apart instead of shifting as a block.
        "origin-center transition-[color,fill,stroke,transform] [transform-box:fill-box] motion-reduce:transition-none",
        COIN_SHADOW,
        groupHover &&
          "group-hover/pin:scale-110 motion-reduce:group-hover/pin:scale-100",
        highlighted && "scale-110 motion-reduce:scale-100",
        selected
          ? "fill-[var(--filter-accent-strong)] stroke-[var(--filter-accent-strong)] text-background"
          : cn(
              "fill-background stroke-foreground/75 text-foreground/75",
              groupHover &&
                "group-hover/pin:stroke-foreground group-hover/pin:text-foreground",
              highlighted && "stroke-foreground text-foreground",
            ),
      )}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        style={{ strokeWidth: MARKER_STROKE_WIDTH, r, cx, cy }}
        className={DISC_MORPH}
      />
      {discFitsGlyph(r) && (
        <PawPrint
          x={cx - glyph / 2}
          y={cy - glyph / 2}
          width={glyph}
          height={glyph}
          style={{
            x: cx - glyph / 2,
            y: cy - glyph / 2,
            width: glyph,
            height: glyph,
          }}
          fill="currentColor"
          strokeWidth={1.5}
          aria-hidden
          className={cn("stroke-current", GLYPH_MORPH, GLYPH_TOO_SMALL)}
        />
      )}
    </g>
  );
}

// One disc per shelter, each carrying that shelter's own selection and its own
// count. The old cluster drew two discs whatever the town held, lit the first
// of them on "mixed" regardless of which shelter was picked, and drew them the
// same size however lopsided the town was.
function ClusterMarker({
  town,
  discs,
  selected,
  live,
  highlighted,
  hoveredShelterValue,
}: {
  town: Town;
  discs: ClusterDisc[];
  selected: string[];
  live: boolean;
  highlighted: boolean;
  hoveredShelterValue: string | null;
}) {
  return town.shelters.map((shelter, index) => (
    <MarkerDisc
      key={shelter.value}
      cx={discs[index].x}
      cy={discs[index].y}
      r={discs[index].r}
      glyphScale={1.3}
      selected={selected.includes(shelter.value)}
      // An off-site shelter keeps its dot even when its town has animals: the
      // disc, not the town, is what says "this one you can pick".
      live={live && shelter.selectable !== false}
      discAttribute={selected.includes(shelter.value) ? "selected" : "idle"}
      shelterValue={shelter.value}
      // The hovered wedge picks the disc that leans in. A list hover still
      // names the town, so it lights every disc, as before.
      highlighted={highlighted || hoveredShelterValue === shelter.value}
      hoverScope="self"
    />
  ));
}

// Past three shelters the discs stop being readable and stop being honest, so
// the marker says the number instead.
function CountDisc({
  town,
  state,
  live,
  highlighted,
}: {
  town: Town;
  state: boolean | "mixed";
  live: boolean;
  highlighted: boolean;
}) {
  const { discRadius } = markerGeometry(town);
  return (
    <g
      data-cluster-overflow={town.shelters.length}
      className={cn(
        "origin-center transition-[color,fill,stroke,transform] [transform-box:fill-box] group-hover/pin:scale-110 motion-reduce:transition-none motion-reduce:group-hover/pin:scale-100",
        COIN_SHADOW,
        highlighted && "scale-110 motion-reduce:scale-100",
        state === true
          ? "fill-[var(--filter-accent-strong)] stroke-[var(--filter-accent-strong)] text-background"
          : state === "mixed"
            ? "fill-[var(--filter-accent)] stroke-[var(--filter-accent-strong)] text-[var(--filter-accent-foreground)]"
            : live
              ? cn(
                  "fill-background stroke-foreground/75 text-foreground/75 group-hover/pin:stroke-foreground group-hover/pin:text-foreground",
                  highlighted && "stroke-foreground text-foreground",
                )
              : "fill-background stroke-foreground/40 text-foreground/40",
      )}
    >
      {/* Radius only, no cx or cy. A text element's x and y are coordinate
          lists, not geometry properties, so the digits inside cannot ride CSS
          the way a circle can. A coin that glided to a new position while its
          own number snapped there would tear the number out of the disc, so
          the two stay welded and move together instantly. The size is what
          carries the species change here, and the size does animate. */}
      <circle
        cx={town.x}
        cy={town.y}
        r={discRadius}
        style={{ strokeWidth: MARKER_STROKE_WIDTH, r: discRadius }}
        className={cn("transition-[r]", MAP_MORPH)}
      />
      <text
        x={town.x}
        y={town.y}
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(
          "fill-current stroke-none transition-[font-size]",
          MAP_MORPH,
        )}
        style={{ fontSize: discRadius * 1.1, fontWeight: 600 }}
      >
        {town.shelters.length}
      </text>
    </g>
  );
}
