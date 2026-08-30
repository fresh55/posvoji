"use client";

import { memo, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n-provider";
import { animalCount, shelterCount } from "@/lib/labels";
import {
  DENSITY_STEPS,
  mapStateName,
  type MapStateName,
  type RegionStats,
} from "@/lib/map-layout";
import { REGION_PATHS, type RegionShape } from "@/lib/map-regions";
import { cn } from "@/lib/utils";
import { commitKey, MAP_MORPH } from "./map-marker";
import type { MapPick, RegionMoveKey } from "./shelter-map-contracts";

/** What an empty region says under "no shelters here": who answers for the
 *  municipalities inside it. Undefined when the coverage table holds nothing
 *  for that region, which leaves the annotation exactly as it was.
 *
 *  Named once because two places have to say it and must not drift: the
 *  annotation a pointer raises, and the region's own aria-label, which is the
 *  only way a screen reader ever gets at a hover. */
export function coveredByLine(
  names: string[] | undefined,
  t: ReturnType<typeof useI18n>["t"],
): string | undefined {
  if (!names?.length) return undefined;
  // The verb agrees with how many shelters are named, and Slovenian counts a
  // dual, so the sentence is picked here rather than interpolated into one
  // form that would be wrong for two thirds of the cases.
  const key =
    names.length === 1
      ? "regionCoveredBy"
      : names.length === 2
        ? "regionCoveredByTwo"
        : "regionCoveredByMany";
  // The same middot the map's other metadata pairs are joined by.
  return t(key, { shelters: names.join(" · ") });
}

// The stroke is what draws the country. It runs on inert regions too, so an
// empty region still reads as part of the silhouette rather than as a hole.
const REGION_STROKE = "stroke-foreground/30";

/** What a legend hover asks of one region: wear the hover look, fade back, or
 *  nothing. */
type DensityFocus = "match" | "dim";

// Only an idle live region answers the legend. A selection is an answer the
// visitor already gave, and dimming or lighting it would overwrite it.
export function regionDensityFocus(
  stats: RegionStats,
  highlightedDensity: number | null | undefined,
): DensityFocus | undefined {
  if (highlightedDensity == null || !stats.live || stats.state !== false) {
    return undefined;
  }
  return stats.density === highlightedDensity ? "match" : "dim";
}

// Enough to push the rest of the ramp behind the step being asked about, not
// so much that the country loses its shape.
const DENSITY_DIM = 0.4;

// --map-density and --map-density-hover are alphas, not colours. The colour is
// --map-density-fill, which the theme owns and every step shares; only the
// alpha moves with the ranking.
function densityStyle(density: number, dimmed = false): CSSProperties {
  const next = Math.min(density + 1, DENSITY_STEPS.length - 1);
  return {
    // Only the resting value dims. The hover value stays whole, so a pointer
    // still lifts a dimmed region out and beats the legend.
    "--map-density": dimmed
      ? DENSITY_STEPS[density] * DENSITY_DIM
      : DENSITY_STEPS[density],
    "--map-density-hover": DENSITY_STEPS[next],
  } as CSSProperties;
}

// The three a live region can wear. An inert one leaves before this table is
// reached, and has no look to pick: it draws the one branch below.
type LiveRegionState = Exclude<MapStateName, "inert">;

// Selection and density share one hue and differ in commitment: density is
// --map-density-fill, a muted green laid on at the ramp's alpha, and a
// selected region is the saturated selection green with its own stroke. They
// were both foreground alpha once, which made a busy region and a chosen one
// the same picture, and a grey ramp under a green selection made the map read
// as a statistics plate. A region highlighted from the list wears its own
// hover look at rest, rather than fighting a real hover for the same
// declaration. Keyed by region state so the JSX picks a class string instead
// of nesting a nine-way ternary.
const REGION_LOOK: Record<
  LiveRegionState,
  { rest: string; highlighted: string }
> = {
  selected: {
    // fill is --map-selected-fill, not --filter-accent-border: the accent
    // token sits in the same luminance band as the density ramp's darkest
    // step (1.09:1 on light, 1.15:1 on dark, both under the ramp's own
    // smallest step), so on dark the chosen region could composite darker
    // than the busiest one and colour alone told nobody which region was
    // picked. The dedicated token is tuned to keep the family's hue while
    // clearing 1.35:1 against that step in both themes; see its definition in
    // globals.css for the composite math.
    //
    // Stroke weight carries the rest of the answer, because it is the one
    // channel every vision deficiency and every phone still reads: 1.5 at
    // rest is already heavier than any other region ever draws (idle tops out
    // at 1 on hover), and 1.8 on hover/highlighted keeps it the heaviest line
    // on the plate even against an idle region's own hover step.
    rest: "fill-[var(--map-selected-fill)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.9] [stroke-width:1.5] hover:[fill-opacity:1] hover:[stroke-width:1.8]",
    highlighted:
      "fill-[var(--map-selected-fill)] stroke-[var(--filter-accent-strong)] [fill-opacity:1] [stroke-width:1.8]",
  },
  // No fill utility here: the fill is the hatch pattern, set as an attribute,
  // and a Tailwind fill class would win over it. The stroke carries most of the
  // hover answer, because a fill-opacity step across thin lines on a pale
  // ground barely moves; the opacity step is kept as well, since it lifts the
  // ground the lines sit on.
  mixed: {
    rest: "stroke-[var(--filter-accent-strong)] [fill-opacity:0.85] [stroke-width:0.8] hover:[fill-opacity:1] hover:[stroke-width:1.3]",
    highlighted:
      "stroke-[var(--filter-accent-strong)] [fill-opacity:1] [stroke-width:1.3]",
  },
  idle: {
    rest: cn(
      "fill-[var(--map-density-fill)] [fill-opacity:var(--map-density)] [stroke-width:0.6] hover:[fill-opacity:var(--map-density-hover)] hover:[stroke-width:1]",
      REGION_STROKE,
      "hover:stroke-foreground/45",
    ),
    highlighted:
      "fill-[var(--map-density-fill)] [fill-opacity:var(--map-density-hover)] [stroke-width:1] stroke-foreground/45",
  },
};

// Empty regions remain visible and answer a hover with their name and "no
// shelters", but nothing more: no click, no tab stop. Every other mark on this
// map says something when asked, and a region that said nothing read as a
// broken map rather than as an empty one.
//
// Memoized: every hover anywhere on the map sets state in ShelterMap, which
// re-renders its whole tree, and there are up to twelve of these on screen at
// once. Only the region actually under the pointer (or newly wearing a
// highlight, or a density-legend match) has anything to redraw; memo is what
// stops the other eleven from doing the same work for nothing. It only pays
// off because ShelterMap hoists every handler below to one identity shared by
// every region, instead of building a fresh closure per region on every
// render — see the handleRegion* callbacks and the comment above them.
// Exported so a render-count test can spy on Region.type (the function
// React.memo wraps) without instrumenting the component itself: nothing else
// in the app needs this outside shelter-map.tsx.
export const Region = memo(function Region({
  region,
  stats,
  onPick,
  tabIndex,
  elementRef,
  onFocus,
  onBlur,
  onMoveFocus,
  onPointerEnter,
  onPointerLeave,
  highlighted,
  densityFocus,
  coveredBy,
  armedNote,
  hatchId,
}: {
  region: RegionShape;
  stats: RegionStats;
  /** The map's own click callback, unadapted: this component already has
   *  region and stats as its own props, so it builds the MapPick itself
   *  rather than being handed a wrapper that would need a fresh identity on
   *  every render. */
  onPick: (values: string[], from: MapPick) => void;
  tabIndex: 0 | -1;
  /** Takes the region's id rather than closing over it, so one function
   *  covers every region: see the note on Region above for why that matters. */
  elementRef: (regionId: number, element: SVGPathElement | null) => void;
  onFocus: (regionId: number) => void;
  onBlur: (regionId: number) => void;
  onMoveFocus: (regionId: number, key: RegionMoveKey) => void;
  onPointerEnter: (regionId: number, stats: RegionStats) => void;
  onPointerLeave: (regionId: number, stats: RegionStats) => void;
  /** A shelter in this region is hovered in the list, so it wears the same
   *  look pointer hover would give it. */
  highlighted: boolean;
  /** The legend is pointing at a density step: "match" means this region is on
   *  it, "dim" means it is not. Undefined when no step is hovered. */
  densityFocus?: DensityFocus;
  /** Shelters answering for the municipalities inside this region. Only an
   *  inert region has anything to do with them: they are what its label says
   *  after "no shelters here", so a screen reader hears what the annotation
   *  shows. */
  coveredBy?: string[];
  /** What the next press on this region will do to the filter, while a coarse
   *  tap has armed it and not yet committed. Undefined for every other region
   *  and on every pointer that can hover, which is where the first click is
   *  still the pick and there is no half-made press to describe.
   *
   *  It joins the label because the annotation carrying it on screen is
   *  aria-hidden, like every annotation on this plate: the label is the only
   *  way a screen reader ever hears what a hover or an arming says. */
  armedNote?: string;
  /** The map's hatch pattern, which the mixed state fills with. */
  hatchId: string;
}) {
  const { locale, messages, t } = useI18n();
  const d = REGION_PATHS.get(region.id) ?? "";
  // Computed before the branch so the branch is the state, rather than the
  // state being read twice from two different tests of the same fact.
  const stateName = mapStateName(stats.state, stats.live);

  if (stateName === "inert") {
    // The same sentence the annotation carries, from the same function: a
    // hover and a screen reader must not learn different things about the
    // same region.
    const covered = coveredByLine(coveredBy, t);
    return (
      <path
        d={d}
        // Named rather than hidden. It answers a hover now, and the message is
        // a fact about the country and not about the pointer: without it a
        // screen reader walks the map group and finds holes exactly where the
        // empty regions are. role="img" and not a button, because there is
        // nothing here to press; no tabIndex, so it never joins the tab order
        // the live regions share.
        role="img"
        aria-label={
          covered
            ? `${region.name}: ${messages.noSheltersInRegion}. ${covered}`
            : `${region.name}: ${messages.noSheltersInRegion}`
        }
        data-region-state="inert"
        // Pointer events are back on so the region can name itself, but only
        // hover is wired: no onClick, no keyboard. On touch a tap fires
        // pointerenter and the card appears, the same way it already does for
        // a live region, and the next tap elsewhere fires pointerleave and
        // takes it away. Nothing here is bespoke to touch.
        onPointerEnter={() => onPointerEnter(region.id, stats)}
        onPointerLeave={() => onPointerLeave(region.id, stats)}
        strokeLinejoin="round"
        className={cn(
          // cursor-help, matching the legend's density swatches: this answers
          // with information and does nothing else. cursor-pointer would
          // promise a click that never lands.
          "cursor-help transition-[fill] motion-reduce:transition-none",
          // The faintest acknowledgment there is: 4% to 7% neutral. The ramp's
          // own smallest step is 8 points (0.20 to 0.28), which is what a live
          // region moves by on hover, so this is under half of that and lands
          // 13 points below DENSITY_STEPS[0]. The surface confirms it heard the
          // pointer without ever reading as "a few animals here".
          "hover:fill-foreground/7",
          // Neutral foreground and not the ramp's green, on purpose: "no
          // shelters here" is a different statement from "few animals here",
          // and a faint tint would have said the second. A full step of the
          // ramp below DENSITY_STEPS[0] in weight, so an empty region cannot
          // be mistaken for the quietest live one either. It stays above
          // --map-abroad by more than it is worth arguing about: the land
          // across the border is untinted, this is not, and the country
          // outline settles the rest.
          "fill-foreground/4 [stroke-width:0.6]",
          // The stroke never moves. A live region thickens its border on
          // hover; an empty one must not, or the two would answer alike.
          REGION_STROKE,
        )}
      />
    );
  }

  // A list hover already asked for this region by name, so the legend never
  // fades it back.
  const dimmed = densityFocus === "dim" && !highlighted;
  const lit = highlighted || densityFocus === "match";

  return (
    <path
      ref={(element) => elementRef(region.id, element)}
      d={d}
      role="button"
      tabIndex={tabIndex}
      aria-pressed={stats.state}
      // The same three facts the annotation carries, and, while the region is
      // armed, the same fourth one: what the press after this will do. A
      // screen reader hears the sentence the eye is being shown, in the words
      // it is shown in.
      aria-label={
        armedNote
          ? `${region.name}: ${shelterCount(stats.values.length, locale)}, ${animalCount(stats.animals, locale)}. ${armedNote}.`
          : `${region.name}: ${shelterCount(stats.values.length, locale)}, ${animalCount(stats.animals, locale)}`
      }
      // Attribute and not a class, because a pattern reference cannot be
      // written as a Tailwind fill utility.
      fill={stateName === "mixed" ? `url(#${hatchId})` : undefined}
      data-region-state={stateName}
      // Only on this branch, which is the only one with a click to commit: an
      // empty region returns above and carries none. See commitKey.
      data-map-commit={commitKey("region", region.id)}
      data-region-density={stats.density}
      data-region-highlighted={highlighted || undefined}
      data-region-density-focus={densityFocus}
      strokeLinejoin="round"
      onClick={() =>
        onPick(stats.values, {
          kind: "group",
          label: region.name,
          values: stats.values,
        })
      }
      onFocus={() => onFocus(region.id)}
      onBlur={() => onBlur(region.id)}
      onPointerEnter={() => onPointerEnter(region.id, stats)}
      onPointerLeave={() => onPointerLeave(region.id, stats)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(stats.values, {
            kind: "group",
            label: region.name,
            values: stats.values,
          });
          return;
        }
        if (
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "Home" ||
          event.key === "End"
        ) {
          event.preventDefault();
          onMoveFocus(region.id, event.key);
        }
      }}
      style={
        stats.state === false ? densityStyle(stats.density, dimmed) : undefined
      }
      className={cn(
        // fill-opacity was already in the list and already animated a species
        // switch: --map-density changes on the same element that is already
        // mounted, so the browser has a value to interpolate from. What it did
        // not have was a timing of its own, and the 150ms default read as a
        // flicker rather than as the country rethinking itself. MAP_MORPH is
        // the same 300ms ease-out the marker radii spend, so the fills and the
        // coins settle together instead of in two waves.
        //
        // The hover step (fill-opacity to --map-density-hover, and the stroke
        // width) now runs at that timing too. It is the same declaration on the
        // same element, and a region answering a pointer in the same beat it
        // answers a species tab is one region, not two.
        "cursor-pointer outline-none transition-[fill,stroke,fill-opacity,stroke-width] motion-reduce:transition-none",
        MAP_MORPH,
        REGION_LOOK[stateName][lit ? "highlighted" : "rest"],
        // 2.1: the selected region's own hover/highlighted stroke now runs at
        // 1.8, so the old 1.75 focus ring would have tied it rather than
        // outranked it. Keyboard focus has to stay the single heaviest line
        // on the plate whatever state the region under it is in.
        "focus-visible:stroke-foreground focus-visible:[stroke-width:2.1]",
      )}
    />
  );
});
