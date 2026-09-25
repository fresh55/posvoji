"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Species } from "@posvoji/schema";

import { logoChipClassName, markBox } from "@/components/shelter-avatar";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { KM_PER_MAP_UNIT, MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "@/lib/geo";
import type { ShelterLogo } from "@/lib/shelter-logos";
import { cn } from "@/lib/utils";
import {
  avoidCalloutOverlap,
  coveredArea,
  type CalloutRect,
} from "./map-callout-layout";
import {
  labelBox,
  outsideFrame,
  placeOriginName,
  type NamePlacement,
} from "./map-names";

// Screen-pixel sizes, converted to SVG units by calloutType.
const TITLE_PX = 12;
const META_PX = 11;
const LEADING = 1.35;
const LINE_GAP_PX = 4;
const SPECIES_GAP_PX = 7;
// Text halo for the distance label drawn directly over the map.
const HALO_PX = 1.7;

const PAD_X_PX = 12;
const PAD_Y_PX = 8;
// Title-only labels use tighter vertical padding.
const PAD_Y_TIGHT_PX = 6;
const RADIUS_PX = 10;
// Use a shadow spread for fractional SVG-unit widths. Chrome rounds a
// CSS border up to one unit, making it thicker when the map is scaled.
const RING_PX = 1;
const SHADOW_Y_PX = 1;
const SHADOW_BLUR_PX = 2;
const SHADOW_ALPHA = 0.18;
const LABEL_GAP_PX = 12;
const LEADER_GAP_PX = 3;
// Air round a logo that needs a chip to sit on, and the gap under it.
const LOGO_CHIP_PX = 4;
const LOGO_GAP_PX = 6;
// Reserve space around the foreignObject so it does not clip the shadow.
const BLEED_PX = SHADOW_Y_PX + SHADOW_BLUR_PX;
const BLOCK_PX = 238;
// Initial content height: one title line and one metadata line.
const MIN_BLOCK_PX = Math.round(
  TITLE_PX * LEADING + LINE_GAP_PX + META_PX * LEADING,
);

// Limit scaling so labels stay legible without covering the map.
const MIN_UNITS_PER_PX = 0.26;
const MAX_UNITS_PER_PX = 0.6;

// Rendered title size takes precedence over the unit clamp on small maps.
const MIN_TITLE_PX = 11;

const MAX_BLOCK_SHARE = 0.55;

/** Initial pixels per SVG unit, used until ShelterMap measures the map. */
export const DEFAULT_PLATE_SCALE = 2.2;

/** Callout dimensions in SVG units for a map rendered at `scale` pixels per unit. */
export function calloutType(scale: number) {
  const px = scale > 0 ? scale : DEFAULT_PLATE_SCALE;
  const clamped = Math.min(
    Math.max(1 / px, MIN_UNITS_PER_PX),
    MAX_UNITS_PER_PX,
  );
  const unit = Math.max(clamped, MIN_TITLE_PX / (TITLE_PX * px));
  return {
    unit,
    title: TITLE_PX * unit,
    metadata: META_PX * unit,
    halo: HALO_PX * unit,
    /** Reserve the full column for layout; short labels can render narrower. */
    width: Math.min(BLOCK_PX * unit, MAP_WIDTH * MAX_BLOCK_SHARE),
    floor: MIN_BLOCK_PX * unit,
    leading: LEADING,
    padX: PAD_X_PX * unit,
    padY: PAD_Y_PX * unit,
    padYTight: PAD_Y_TIGHT_PX * unit,
    lineGap: LINE_GAP_PX * unit,
    speciesGap: SPECIES_GAP_PX * unit,
    radius: RADIUS_PX * unit,
    ring: RING_PX * unit,
    shadowY: SHADOW_Y_PX * unit,
    shadowBlur: SHADOW_BLUR_PX * unit,
    bleed: BLEED_PX * unit,
    labelGap: LABEL_GAP_PX * unit,
    leaderGap: LEADER_GAP_PX * unit,
    logoChip: LOGO_CHIP_PX * unit,
    logoGap: LOGO_GAP_PX * unit,
  };
}

// Do not draw a leader for minor adjustments at the map edge.
const LEADER_SLACK = 3;
const LEADER_WIDTH = 0.5;
const FRAME_MARGIN = 2;

/** Marker or region label, with a leader when displaced from its natural position. */
export function MapCallout({
  x,
  y,
  reach,
  title,
  metadata,
  note,
  species,
  logo,
  action,
  scale = DEFAULT_PLATE_SCALE,
  avoid,
  rectKey = "",
  onRect,
  earlierCallouts,
}: {
  x: number;
  y: number;
  reach: number;
  title: string;
  /** Omit metadata, note, species and action for a compact title-only label. */
  metadata?: string;
  /** Optional second metadata line, such as the shelters covering an empty region. */
  note?: string;
  /** Species counts for an individual shelter. */
  species?: { species: Species; count: number }[];
  /** The shelter's own mark, over the title, when the card is about one
   *  shelter. Recognising a mark is quicker than reading a name. */
  logo?: ShelterLogo;
  /** An explicit touch choice; passive hover annotations omit it. */
  action?: {
    label: string;
    onClick: () => void;
    onFocusChange?: (focused: boolean) => void;
  };
  /** Pixels per SVG unit, measured by ShelterMap. */
  scale?: number;
  /** Marker rectangles to avoid when choosing a side. Staying inside the map takes priority. */
  avoid?: readonly CalloutRect[];
  /** Stable identifier for the map to track simultaneous callouts. */
  rectKey?: string;
  /** Reports bounds before paint, or null on removal. Keep the callback identity stable. */
  onRect?: (key: string, rect: CalloutRect | null) => void;
  /** Earlier persistent spotlight labels. The one-way ordering keeps layout
   * stable while each label measures and reports its actual height. */
  earlierCallouts?: readonly CalloutRect[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const type = calloutType(scale);
  const [height, setHeight] = useState(type.floor);

  // Measure the unconstrained content so labels can shrink as well as grow.
  // Measuring the h-full wrapper would prevent shrinking.
  // Use a content key for species because callers may recreate the array.
  const speciesKey = species
    ?.map((entry) => `${entry.species}:${entry.count}`)
    .join(",");
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const needed = Math.max(node.scrollHeight, type.floor);
    if (needed !== height) setHeight(needed);
  }, [title, metadata, note, speciesKey, logo?.url, action?.label, type.floor, height]);

  const dense = !metadata && !note && !species?.length && !logo && !action;
  const padY = dense ? type.padYTight : type.padY;

  // Use the same padded box for placement, leader endpoints and overlap reports.
  const boxWidth = type.width;
  const boxHeight = height + padY * 2;
  const { labelGap, leaderGap } = type;

  // Choose a side that fits the frame, then prefer less overlap with markers.
  // Ties go right.
  const rightX = x + reach + labelGap;
  const leftX = x - reach - labelGap - boxWidth;
  const naturalY = y - boxHeight / 2;
  const clampX = (value: number) =>
    Math.min(Math.max(value, FRAME_MARGIN), MAP_WIDTH - boxWidth - FRAME_MARGIN);
  const boundedY = Math.min(
    Math.max(naturalY, FRAME_MARGIN),
    MAP_HEIGHT - boxHeight - FRAME_MARGIN,
  );
  const rightFits = rightX + boxWidth <= MAP_WIDTH - FRAME_MARGIN;
  const leftFits = leftX >= FRAME_MARGIN;
  // Compare overlap at the actual, clamped positions.
  const hides = (boxX: number) =>
    coveredArea(
      { x: clampX(boxX), y: boundedY, width: boxWidth, height: boxHeight },
      avoid ?? [],
    );
  const onRight = rightFits && (!leftFits || hides(rightX) <= hides(leftX));
  const naturalX = onRight ? rightX : leftX;
  const blockX = clampX(naturalX);
  // Preserve the quieter side, then separate persistent labels vertically.
  // Only earlier labels reserve space, so reports cannot move one another
  // back and forth as their rendered heights settle.
  const blockY = earlierCallouts?.length
    ? avoidCalloutOverlap(
        { x: blockX, y: boundedY, width: boxWidth, height: boxHeight },
        earlierCallouts,
        { height: MAP_HEIGHT, margin: FRAME_MARGIN, gap: type.unit * 8 },
      ).y
    : boundedY;

  const pad = type.bleed;

  const displaced =
    Math.hypot(blockX - naturalX, blockY - naturalY) > LEADER_SLACK;
  // Stop the leader just outside the edge facing the marker.
  const leaderX = onRight
    ? blockX - leaderGap
    : blockX + boxWidth + leaderGap;
  const leaderY = blockY + boxHeight / 2;
  const dx = leaderX - x;
  const dy = leaderY - y;
  const span = Math.hypot(dx, dy) || 1;

  // Report position separately from content measurement: a label can move
  // without changing its text. Layout effects update the reserved area before paint.
  useLayoutEffect(() => {
    if (!onRect) return;
    onRect(rectKey, { x: blockX, y: blockY, width: boxWidth, height: boxHeight });
    return () => onRect(rectKey, null);
  }, [onRect, rectKey, blockX, blockY, boxWidth, boxHeight]);

  return (
    // Only callouts with an action contain a focusable control.
    <g
      aria-hidden={action ? undefined : true}
      data-map-callout
      className={cn(
        // Use duration-0 for reduced motion; see ui/dialog.tsx for the animation override.
        "pointer-events-none animate-in fade-in duration-150 motion-reduce:duration-0",
        onRight ? "slide-in-from-left-0.5" : "slide-in-from-right-0.5",
      )}
    >
      {displaced && (
        <line
          data-map-leader
          // From the marker's own edge, so the mark is never drawn through.
          x1={x + (dx / span) * reach}
          y1={y + (dy / span) * reach}
          x2={leaderX}
          y2={leaderY}
          strokeWidth={LEADER_WIDTH}
          strokeLinecap="round"
          className="stroke-foreground opacity-55"
        />
      )}
      <foreignObject
        x={blockX - pad}
        y={blockY - pad}
        width={boxWidth + pad * 2}
        height={boxHeight + pad * 2}
      >
        {/* Align the chip with its leader while leaving room for the shadow. */}
        <div
          className={cn("flex h-full w-full", !onRight && "justify-end")}
          style={{ padding: pad }}
        >
          <div
            data-callout-chip
            className={cn(
              "flex flex-col justify-center",
              // An opaque surface keeps contrast independent of the terrain underneath.
              "rounded-ui bg-popover text-popover-foreground",
              // Keep the outline in both themes; omit the drop shadow in dark mode.
              "shadow-[var(--callout-ring),var(--callout-lift)] dark:shadow-[var(--callout-ring)]",
              "w-fit max-w-full",
              !onRight && "text-right",
            )}
            style={
              {
                borderRadius: type.radius,
                paddingBlock: padY,
                paddingInline: type.padX,
                "--callout-ring": `0 0 0 ${type.ring.toFixed(3)}px var(--border)`,
                "--callout-lift": `0 ${type.shadowY.toFixed(3)}px ${type.shadowBlur.toFixed(3)}px rgb(0 0 0 / ${SHADOW_ALPHA})`,
              } as CSSProperties
            }
          >
            <div ref={contentRef} className="w-full">
              {logo && (
                // The same chip rule the shelter cards follow: a mark whose
                // ink fails on this surface gets a plate of the other tone,
                // and the negative margin keeps the mark itself flush with the
                // title whether a chip is drawn or not.
                <CalloutLogo logo={logo} type={type} alignEnd={!onRight} />
              )}
              <span
                data-callout-title
                className="block w-full break-words font-semibold"
                style={{ fontSize: type.title, lineHeight: type.leading }}
              >
                {title}
              </span>
              {metadata && (
                <span
                  data-callout-metadata
                  className="block w-full break-words text-muted-foreground"
                  style={{
                    fontSize: type.metadata,
                    lineHeight: type.leading,
                    marginTop: type.lineGap,
                  }}
                >
                  {metadata}
                </span>
              )}
              {note && (
                <span
                  data-callout-note
                  className="block w-full break-words text-muted-foreground"
                  style={{
                    fontSize: type.metadata,
                    lineHeight: type.leading,
                    marginTop: type.lineGap,
                  }}
                >
                  {note}
                </span>
              )}
              {species && species.length > 0 && (
                <span
                  data-callout-species
                  className={cn(
                    "flex w-full flex-wrap items-center text-muted-foreground tabular-nums",
                    !onRight && "justify-end",
                  )}
                  style={{
                    fontSize: type.metadata,
                    lineHeight: type.leading,
                    marginTop: type.speciesGap,
                    columnGap: type.metadata * 0.9,
                    rowGap: type.metadata * 0.35,
                  }}
                >
                  {species.map((entry) => {
                    const Icon = SPECIES_ICONS[entry.species];
                    return (
                      <span
                        key={entry.species}
                        data-callout-species-entry={entry.species}
                        className="inline-flex shrink-0 items-center"
                        style={{ gap: type.metadata * 0.35 }}
                      >
                        <Icon size={type.metadata} aria-hidden />
                        {entry.count}
                      </span>
                    );
                  })}
                </span>
              )}
              {/* Last, under every fact the card carries. It stood between the
                  count and the species line once, which split one shelter's
                  facts in two around a control. The facts are what the press
                  is decided on, so they are read first and the press comes
                  after them. */}
              {action && (
                <button
                  type="button"
                  data-map-action
                  aria-label={`${action.label}: ${title}`}
                  onClick={action.onClick}
                  onFocus={() => action.onFocusChange?.(true)}
                  onBlur={() => action.onFocusChange?.(false)}
                  className="pointer-events-auto mt-2 block w-full rounded-ui bg-primary px-2 text-center font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ minHeight: 44 / scale, fontSize: type.metadata, lineHeight: type.leading }}
                >
                  {action.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

const ORIGIN_RING_RADIUS = 5;
const ORIGIN_RING_STROKE = 1;
const ORIGIN_RING_DASH = 2;
const ORIGIN_DOT_RADIUS = 1.75;

/** Outer edge of the origin ring, where the distance line starts. */
export const ORIGIN_REACH = ORIGIN_RING_RADIUS + ORIGIN_RING_STROKE / 2;

/** Shared dash pattern for the origin ring and distance line. */
export const ORIGIN_DASH = `${ORIGIN_RING_DASH} ${ORIGIN_RING_DASH}`;

// Dashed, so it reads as "you" rather than as one more shelter.
export function Origin({ at }: { at: LatLon }) {
  const { x, y } = project(at);
  return (
    <g aria-hidden className="pointer-events-none">
      <circle
        cx={x}
        cy={y}
        r={ORIGIN_RING_RADIUS}
        strokeWidth={ORIGIN_RING_STROKE}
        strokeDasharray={ORIGIN_DASH}
        className="fill-none stroke-foreground opacity-70"
      />
      <circle cx={x} cy={y} r={ORIGIN_DOT_RADIUS} className="fill-foreground" />
    </g>
  );
}


/** A shelter's mark over a card's title, sized in the units the card is set
 *  in so it is the same size on screen at every plate width, as the type is.
 *  markBox is the pixel box the shelter cards draw the mark in. */
function CalloutLogo({
  logo,
  type,
  alignEnd,
}: {
  logo: ShelterLogo;
  type: ReturnType<typeof calloutType>;
  alignEnd: boolean;
}) {
  const box = markBox(logo, "sm");
  const radius = type.radius * 0.6;
  return (
    <span
      data-callout-logo
      className={cn("flex w-fit", alignEnd && "ml-auto", logoChipClassName(logo))}
      style={{
        padding: type.logoChip,
        marginTop: -type.logoChip,
        marginInline: -type.logoChip,
        marginBottom: type.logoGap - type.logoChip,
        borderRadius: radius,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.url}
        srcSet={logo.srcSet}
        sizes={logo.srcSet ? `${box.width}px` : undefined}
        alt=""
        decoding="async"
        width={logo.width}
        height={logo.height}
        style={{
          width: box.width * type.unit,
          height: box.height * type.unit,
          borderRadius: logo.opaque ? radius : undefined,
        }}
      />
    </span>
  );
}

// Clear space between the origin ring and its name, in screen pixels.
const ORIGIN_NAME_GAP_PX = 3;

/** Text set straight on the plate with the page drawn under the letters, so
 *  it reads over a region fill, a border or the relief alike: the origin's
 *  name, the ring's distance and the distance on the dashed line to a town
 *  (shelter-map-links.tsx). A stroke under the fill, not the blurred halo the
 *  annotation carries: a line runs straight through the last of those, and a
 *  stroke knocks the dashes out from behind the letterforms where a shadow
 *  would only veil them. */
export function PlateLabel({
  x,
  y,
  anchor,
  size,
  halo,
  className,
  children,
  ...data
}: {
  x: number;
  y: number;
  anchor: NamePlacement["anchor"];
  size: number;
  halo: number;
  className?: string;
  children: string;
} & { [key: `data-${string}`]: string | number }) {
  return (
    <text
      {...data}
      aria-hidden
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontSize={size}
      stroke="var(--background)"
      strokeWidth={halo * 2}
      strokeLinejoin="round"
      className={cn("pointer-events-none [paint-order:stroke]", className)}
    >
      {children}
    </text>
  );
}

/** Where the origin's name stands on a plate drawn at `scale`, and the box it
 *  takes (placeOriginName in map-names.ts). A pure answer, so the map can
 *  memoize it and hand the box to the plate's own type without a render to
 *  report it in. */
export function originNameAt(
  at: LatLon,
  text: string,
  scale: number,
  avoid: readonly CalloutRect[],
) {
  const { x, y } = project(at);
  const type = calloutType(scale);
  return placeOriginName(
    text,
    x,
    y,
    ORIGIN_REACH + ORIGIN_NAME_GAP_PX * type.unit,
    type.metadata,
    avoid,
    FRAME_MARGIN,
  );
}

/** The origin's name beside its ring: the town the visitor typed, or their
 *  own location. The plate carries no key, so the mark says what it is where
 *  it stands. */
export function OriginName({
  spot: { text, x, y, anchor },
  scale,
}: {
  spot: NamePlacement;
  scale: number;
}) {
  const type = calloutType(scale);
  return (
    <PlateLabel
      data-map-origin-name=""
      x={x}
      y={y}
      anchor={anchor}
      size={type.metadata}
      halo={type.halo}
      className="fill-foreground font-semibold"
    >
      {text}
    </PlateLabel>
  );
}

// Where on the ring its distance is written: the top of the circle if that is
// on the plate, else the first of the other compass points that is.
const RING_LABEL_ANGLES = [-90, 90, 0, 180, -45, -135, 45, 135];

/** How far "do N km" reaches from the origin, drawn under the markers while a
 *  distance pick is asked about or standing. The same straight-line distance
 *  the list sorts by, so a shelter inside the ring is one the pick takes. The
 *  plate's x axis is squeezed to match its y (lib/geo.ts), so a distance is a
 *  circle on it.
 *
 *  The ring writes its own distance on its line, in its own green, so a
 *  dashed circle on the map says what it is without a key under the plate.
 *  A ring wider than the whole plate has no point on the plate to write it
 *  on, and then the pressed chip beside the search field is what says it. */
export function DistanceRing({
  at,
  km,
  scale,
}: {
  at: LatLon;
  km: number;
  scale: number;
}) {
  const { x, y } = project(at);
  const r = km / KM_PER_MAP_UNIT;
  const type = calloutType(scale);
  const text = `${km} km`;
  const spot = RING_LABEL_ANGLES.map((degrees): NamePlacement => {
    const radians = (degrees * Math.PI) / 180;
    return {
      text,
      x: x + r * Math.cos(radians),
      y: y + r * Math.sin(radians),
      anchor: "middle",
    };
  }).find((candidate) => outsideFrame(labelBox(candidate, type.metadata), FRAME_MARGIN) === 0);
  return (
    <>
      <circle
        data-distance-ring={km}
        aria-hidden
        cx={x}
        cy={y}
        r={r}
        strokeWidth={0.9}
        strokeDasharray={ORIGIN_DASH}
        className="pointer-events-none fill-brand-strong/6 stroke-brand-strong"
      />
      {spot && (
        <PlateLabel
          data-distance-ring-label={km}
          x={spot.x}
          y={spot.y}
          anchor="middle"
          size={type.metadata}
          halo={type.halo}
          className="fill-brand-strong font-semibold"
        >
          {text}
        </PlateLabel>
      )}
    </>
  );
}
