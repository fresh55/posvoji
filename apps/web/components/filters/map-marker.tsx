"use client";

import { PawPrint } from "lucide-react";
import {
  clusterDiscPositions,
  clusterHitWedges,
  discFitsGlyph,
  markerGeometry,
  MARKER_STROKE_WIDTH,
  MAX_CLUSTER_DISCS,
  selectionState,
  townCount,
  townSelectableValues,
  type Town,
} from "@/lib/map-layout";
import { cn } from "@/lib/utils";

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
  const live =
    values.length > 0 && (townCount(town) > 0 || state !== false);
  const geometry = markerGeometry(town);
  // Two or three discs get one hit wedge each, so a click lands on the shelter
  // it was aimed at instead of toggling the whole town. Empty for single and
  // overflow markers, which keep answering as a whole.
  const wedges = clusterHitWedges(town);
  const wedged = wedges.length > 0;

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
        const shelter = town.shelters.find((entry) => entry.value === value);
        // An off-site shelter's wedge names it and stops there, the same deal
        // its dot has always had.
        const pickable = live && shelter?.selectable !== false;
        return (
          <path
            key={value}
            d={d}
            data-wedge-shelter={value}
            data-wedge-pickable={pickable || undefined}
            onClick={pickable ? () => onPick([value]) : undefined}
            onPointerEnter={() => onHoverShelter(value)}
            onPointerLeave={() => onHoverShelter(null)}
            className={cn(
              "fill-transparent stroke-none",
              pickable ? "cursor-pointer" : "cursor-default",
            )}
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
        <circle
          data-marker-empty=""
          cx={cx}
          cy={cy}
          r={r * 0.42}
          className={cn(
            "fill-foreground/35 stroke-none transition-colors motion-reduce:transition-none",
            groupHover && "group-hover/pin:fill-foreground/60",
            highlighted && "fill-foreground/60",
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
      <circle cx={cx} cy={cy} r={r} style={{ strokeWidth: MARKER_STROKE_WIDTH }} />
      {discFitsGlyph(r) && (
        <PawPrint
          x={cx - glyph / 2}
          y={cy - glyph / 2}
          width={glyph}
          height={glyph}
          fill="currentColor"
          strokeWidth={1.5}
          aria-hidden
          className="stroke-current"
        />
      )}
    </g>
  );
}

// One disc per shelter, each carrying that shelter's own selection. The old
// cluster drew two discs whatever the town held, and lit the first of them on
// "mixed" regardless of which shelter was picked.
function ClusterMarker({
  town,
  selected,
  live,
  highlighted,
  hoveredShelterValue,
}: {
  town: Town;
  selected: string[];
  live: boolean;
  highlighted: boolean;
  hoveredShelterValue: string | null;
}) {
  const { clusterRadius } = markerGeometry(town);
  const positions = clusterDiscPositions(town);

  return town.shelters.map((shelter, index) => (
    <MarkerDisc
      key={shelter.value}
      cx={positions[index].x}
      cy={positions[index].y}
      r={clusterRadius}
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
      <circle
        cx={town.x}
        cy={town.y}
        r={discRadius}
        style={{ strokeWidth: MARKER_STROKE_WIDTH }}
      />
      <text
        x={town.x}
        y={town.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-current stroke-none"
        style={{ fontSize: discRadius * 1.1, fontWeight: 600 }}
      >
        {town.shelters.length}
      </text>
    </g>
  );
}
