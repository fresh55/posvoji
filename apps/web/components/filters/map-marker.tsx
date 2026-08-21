"use client";

import { memo, useEffect, useState } from "react";
import { PawPrint } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { Locale } from "@/lib/i18n";
import { animalCount, shelterCount } from "@/lib/labels";
import {
  clusterDiscs,
  clusterHitWedges,
  type ClusterDisc,
  discFitsGlyph,
  dominantShelterIndex,
  mapStateName,
  markerGeometry,
  markerRadius,
  MARKER_STROKE_WIDTH,
  MAX_CLUSTER_DISCS,
  satelliteDiscs,
  satelliteHitCircles,
  type ShelterPin,
  selectionState,
  townCount,
  townIsLive,
  townLabel,
  townSelectableValues,
  type Town,
} from "@/lib/map-layout";
// Type-only, so this never becomes a runtime import: shelter-map.tsx imports
// Marker from this file, and a value import back would make the two modules
// circular. Both types are erased at compile time either way.
import type { MapPick, RegionMoveKey } from "./shelter-map";
import { cn } from "@/lib/utils";

// The hollow disc a shelter with nothing listed draws: just over half the
// radius the coin would have taken, no fill, foreground at 45%. The map legend
// repeats this mark at legend size, and what it repeats is EmptyMarkerGlyph
// below rather than these three numbers, so a lookalike painted from other
// classes can never drift from the real one.
//
// 0.54 rather than the 0.5 it was, so the mark keeps the absolute size it had
// before the smallest radius step dropped from 5 to 4.7: at 0.5 it would have
// come out 2.125 units where it used to be 2.275, and this disc carries no
// count to encode. Its whole message is "nothing listed here", so it has no
// reason to shrink along with a scale it does not take part in. 0.54 puts it
// at 2.295, within a rounding error of where it was.
const EMPTY_MARKER_RADIUS_SCALE = 0.54;
const EMPTY_MARKER_STROKE_WIDTH = 0.7;
const EMPTY_MARKER_CLASS = "fill-none stroke-foreground/45";

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
// Everything the plate draws small enough to smudge measures itself against
// the same width, so the paws, the plate's furniture and the marker layer all
// leave at once rather than at three widths nobody chose together.
export const PLATE_TOO_SMALL = "@max-[512px]/map-stage:hidden";

/** The same threshold as a plate scale, in pixels to the user unit: the 1.5
 *  the arithmetic above arrives at. A Tailwind class has to be a literal for
 *  the scanner to find it, so the one gate that cannot be made in CSS (see
 *  plateWide in shelter-map.tsx) reads the measured scale against this instead
 *  of guessing the stage's padding back off a measured width. */
export const PLATE_MIN_SCALE = 1.5;

const GLYPH_TOO_SMALL = PLATE_TOO_SMALL;

// The coin's focus ring, and how far outside the marker it sits. town.reach is
// everything the marker draws, satellites included, so the ring never crosses
// a mark of its own town's.
//
// 2.1 wide, which is what the regions' focus-visible stroke runs at, and for
// the same reason: keyboard focus has to be the single heaviest line on the
// plate whatever it lands on. A selected region strokes 1.8 at its heaviest
// and a coin 0.9, so 2.1 outranks every other stroke here as well.
const FOCUS_RING_GAP = 2.2;
const FOCUS_RING =
  "fill-none stroke-foreground [stroke-width:0] group-focus-visible/pin:[stroke-width:2.1]";

// The ring the one mark a coin has been drilled into wears, and how far
// outside that mark it sits. Half the coin's gap, because the marks inside one
// coin sit against each other: a full-width gap would draw one disc's ring
// across its neighbour.
//
// The same ink and the same 2.1 as the coin's own ring, because it says the
// same thing, and it is drawn instead of that ring rather than inside it.
// Keyboard focus is one place on the plate; two rings at the heaviest weight
// would be two answers to where that place is.
//
// No focus-visible gate either, unlike the coin's. A coin can be focused by a
// click, so its ring waits to be sure the keyboard asked; a wedge is only ever
// reached by pressing Enter on a coin that already holds keyboard focus, so
// the state that draws this ring is the state that earns it.
const WEDGE_FOCUS_RING_GAP = 1.1;
const WEDGE_FOCUS_RING = "fill-none stroke-foreground [stroke-width:2.1]";

// What the coin says when it is asked rather than looked at: the same facts the
// annotation carries, in the same order and out of the same helpers, so the
// screen reader and the plate cannot describe one town two ways. A town with
// nothing to pick says so rather than counting out the nought it has.
function markerLabel(
  town: Town,
  locale: Locale,
  noAnimalsListed: string,
): string {
  const name = townLabel(town);
  if (townSelectableValues(town).length === 0) {
    return `${name}: ${noAnimalsListed}`;
  }
  const animals = animalCount(townCount(town), locale);
  return town.shelters.length > 1
    ? `${name}: ${shelterCount(town.shelters.length, locale)}, ${animals}`
    : `${name}: ${animals}`;
}

// What one mark inside a shared coin says while the keyboard is standing on
// it. The same two facts its annotation carries, out of the same helpers and
// in the same order, so drilling into a wedge tells a screen reader exactly
// what hovering it shows anyone else. An off-site mark says it has nothing
// listed rather than counting out the nought it has, which is the sentence the
// callout writes over it too.
function wedgeLabel(
  shelter: ShelterPin,
  locale: Locale,
  noAnimalsListed: string,
): string {
  const animals =
    shelter.selectable === false
      ? noAnimalsListed
      : animalCount(shelter.count, locale);
  return `${shelter.label}: ${animals}`;
}

// Coins were pointer-only once, and the list was the whole keyboard story for
// picking one shelter out of a shared town. It is not any more. A wedge still
// has no tab stop of its own, but the coin's stop drills into one: Enter on a
// shared coin steps inside, the arrows walk the marks it holds, Enter or Space
// picks the mark standing under them, and Escape comes back out. Space at coin
// level still picks the town whole, so the group a click on the coin makes is
// never out of reach.
//
// Memoized: every hover anywhere on the map sets state in ShelterMap, which
// re-renders its whole tree, and every town on the plate mounts one of these.
// Only the marker actually under the pointer (or newly highlighted, or newly
// dimmed by a search) has anything to redraw; memo is what stops the rest
// from doing the same work for nothing. It only pays off because ShelterMap
// hands every marker the same handler identities and scopes
// hoveredShelterValue to the one town it names (null for the rest) rather
// than the raw state, which every marker would otherwise see change
// together. See shelter-map.tsx's handleTown* callbacks and the comment
// above where these props are built.
export const Marker = memo(function Marker({
  town,
  selected,
  onPick,
  onPointerEnter,
  onPointerLeave,
  onHoverShelter,
  hoveredShelterValue,
  highlighted,
  dimmed,
  tabIndex,
  elementRef,
  onFocus,
  onBlur,
  onMoveFocus,
}: {
  town: Town;
  selected: string[];
  /** The map's own click callback, unadapted: this component already has
   *  town as its own prop, so it builds the MapPick itself rather than being
   *  handed a wrapper that would need a fresh identity on every render. */
  onPick: (values: string[], from: MapPick) => void;
  /** Takes the town rather than closing over it, so one function covers
   *  every marker: see the note on Marker above for why that matters. */
  onPointerEnter: (town: Town) => void;
  onPointerLeave: (town: Town) => void;
  /** A mark inside a shared coin gained or lost the pointer, or the keyboard
   *  drilled onto one or off it. Null on leave. One callback for both, so the
   *  annotation and the list row cannot learn to answer a pointer and a
   *  keyboard two different ways. */
  onHoverShelter: (town: Town, value: string | null) => void;
  /** The shelter whose mark holds the pointer or the drilled keyboard, so only
   *  its disc leans in. Null for every town but the one that shelter belongs
   *  to: see the note above on why this is scoped rather than the raw hover
   *  state. */
  hoveredShelterValue: string | null;
  /** The shelter is hovered in the list, so its marker reveals the hit halo
   *  and strengthens its stroke, same as pointer hover would. */
  highlighted: boolean;
  /** The list search matches none of this town's shelters, so the marker
   *  fades back while the matches keep full strength. */
  dimmed?: boolean;
  /** 0 for the one coin holding the plate's shared tab stop, -1 for the rest.
   *  Taken only by a live marker: a town that is not a control is named for
   *  assistive tech and left out of the tab order, the way an empty region is. */
  tabIndex: 0 | -1;
  /** Takes the town rather than closing over it, so one function covers every
   *  marker: see the note on Marker above for why that matters. */
  elementRef: (town: Town, element: SVGGElement | null) => void;
  onFocus: (town: Town) => void;
  onBlur: (town: Town) => void;
  onMoveFocus: (town: Town, key: RegionMoveKey) => void;
}) {
  const { locale, messages } = useI18n();
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
  // it was aimed at instead of toggling the whole town. Empty for single,
  // overflow and dominated markers, which divide their target another way or
  // not at all.
  const wedges = clusterHitWedges(town);
  // Sized by each shelter's own count, so the discs order the same way the
  // coins do. Empty unless this is a town that still shares its coin.
  const discs = clusterDiscs(town);
  // One shelter holds this town, so it takes the coin at its own count's bin
  // and the rest ride the rim. Empty unless that is what the town is.
  const satellites = satelliteDiscs(town);
  const dominantIndex = dominantShelterIndex(town.shelters);
  const dominant =
    dominantIndex >= 0 ? town.shelters[dominantIndex] : undefined;
  // Every per-shelter target on the marker, in painting order: a cluster's
  // discs, or a dominated town's coin and satellites.
  const hits: ClusterDisc[] = dominant
    ? satelliteHitCircles(town)
    : discs.map((disc) => ({ ...disc, r: disc.r + MARKER_STROKE_WIDTH / 2 }));
  // Whether the marker's own marks answer for their shelters, which is when
  // the group must stop answering for the town as a whole.
  const wedged = hits.length > 0;
  // Where those same marks are actually drawn, in the same order and for the
  // same shelters as the targets above. The hit geometry is deliberately wider
  // than the picture, and in one case much wider (a dominated coin's target is
  // the whole town's hit radius), so a ring drawn on it would be a ring around
  // country rather than around a mark.
  const marks: ClusterDisc[] = dominant
    ? [
        { value: dominant.value, x: town.x, y: town.y, r: geometry.discRadius },
        ...satellites,
      ]
    : discs;

  /** Which mark the keyboard has drilled into, as an index into `marks`, or
   *  null at coin level. Read through the clamp below and never directly: the
   *  species tabs re-cut a coin under the visitor, a cluster can become a
   *  dominated town or overflow into a plain count disc, and an index into the
   *  marks that were there is not an index into the marks that are. */
  const [drilledIndex, setDrilledIndex] = useState<number | null>(null);
  const drilled =
    drilledIndex !== null && drilledIndex < marks.length ? drilledIndex : null;
  const drilledMark = drilled !== null ? marks[drilled] : undefined;
  const drilledShelter = drilledMark
    ? town.shelters.find((entry) => entry.value === drilledMark.value)
    : undefined;
  // The same test the pointer's own targets make: an off-site shelter is named
  // and never picked, whichever way the visitor arrived at it.
  const drilledPickable =
    drilledShelter !== undefined && live && drilledShelter.selectable !== false;

  // What the coin reports pressed. While the drill is open it answers for the
  // mark and not for the town, because that is what its name says as well. A
  // mark with nothing to pick presses nothing, and reports no pressed state at
  // all rather than a false one.
  const pressed = drilledShelter
    ? drilledPickable
      ? selected.includes(drilledShelter.value)
      : undefined
    : live
      ? state
      : undefined;

  // Wraps the raw onPick prop with the MapPick payload, the way this town's
  // click was always described: one shelter by value, several by the town's
  // own label. A local wrapper rather than an adapter built in shelter-map.tsx
  // is what lets that prop stay one shared function for every marker; see the
  // comment on Marker above.
  const pick = (values: string[]) => {
    onPick(
      values,
      values.length === 1
        ? { kind: "shelter", value: values[0] }
        : { kind: "group", label: townLabel(town), values },
    );
  };

  // Stepping onto a mark inside the coin, and stepping back off it. Both go
  // out through onHoverShelter, which is the pointer's own path: the
  // annotation names the shelter, its disc leans in and the list row tints,
  // because none of that ever asked which kind of pointing it was answering.
  const enterWedge = (index: number) => {
    setDrilledIndex(index);
    onHoverShelter(town, marks[index].value);
  };
  const leaveWedges = () => {
    setDrilledIndex(null);
    onHoverShelter(town, null);
  };

  // Escape, while a coin is drilled into, belongs to the coin and to nothing
  // else. It cannot be answered in onKeyDown below, and the reason is worth
  // writing down: the picker draws this map inside a Radix dialog, whose
  // dismissable layer listens for Escape on the document in the capture phase.
  // That runs before the event ever reaches a React handler on the marker, so
  // backing out of one coin closed the whole picker instead, which is the
  // opposite of backing out one level.
  //
  // The window sits one step earlier in the capture path than the document, so
  // a listener here goes first whatever order the two were registered in,
  // which a second document listener could not promise. It takes the press
  // outright: preventDefault alone would do, the layer checking
  // defaultPrevented before it dismisses, but a key that means "leave this
  // coin" has no business reaching anything else either.
  //
  // Only while drilled. At coin level Escape is the dialog's own and closes
  // the picker exactly as it always has.
  useEffect(() => {
    if (drilled === null) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setDrilledIndex(null);
      onHoverShelter(town, null);
    };
    window.addEventListener("keydown", handleEscape, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleEscape, { capture: true });
  }, [drilled, onHoverShelter, town]);

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
        onClick: pickable ? () => pick([value]) : undefined,
        onPointerEnter: () => onHoverShelter(town, value),
        onPointerLeave: () => onHoverShelter(town, null),
        className: cn(
          "fill-transparent stroke-none",
          pickable ? "cursor-pointer" : "cursor-default",
        ),
      },
    };
  };

  return (
    <g
      ref={(element) => elementRef(town, element)}
      // Named for assistive tech either way, and a control only when there is
      // something to press. Same division the regions keep: a live one is a
      // button that reports what it has, an inert one is an image that says
      // what it is. A marker was aria-hidden entirely once, which told a
      // screen reader nothing about where the shelters are.
      role={live ? "button" : "img"}
      // A drilled coin is standing on one of its marks, so it answers as that
      // shelter. The town's own name comes back the moment Escape does.
      aria-label={
        drilledShelter
          ? wedgeLabel(drilledShelter, locale, messages.noAnimalsListed)
          : markerLabel(town, locale, messages.noAnimalsListed)
      }
      aria-pressed={pressed}
      // Only a live marker joins the roving tab order. tabIndex and not
      // tabindex: React writes the attribute, and an undefined here is what
      // keeps an inert coin out of the tab order altogether.
      tabIndex={live ? tabIndex : undefined}
      data-marker-kind={
        !shared ? "single" : satellites.length > 0 ? "satellite" : "cluster"
      }
      data-marker-key={town.key}
      data-marker-live={live}
      data-marker-shelters={town.shelters.length}
      data-marker-state={mapStateName(state)}
      data-marker-info={info || undefined}
      data-marker-highlighted={highlighted || undefined}
      data-marker-dimmed={dimmed || undefined}
      data-marker-drilled={drilledMark?.value}
      onClick={wedged ? undefined : () => live && pick(values)}
      onPointerEnter={wedged ? undefined : () => onPointerEnter(town)}
      onPointerLeave={wedged ? undefined : () => onPointerLeave(town)}
      onFocus={() => onFocus(town)}
      onBlur={() => {
        // Focus leaving the coin closes the drill outright, so a coin the
        // visitor comes back to is always found at coin level. Nothing worth
        // keeping is thrown away: the marks are walked in painting order and
        // drilling in always starts at the first of them, so a remembered
        // wedge would save one keypress at the price of a coin that answers
        // differently depending on where the keyboard has been. It would also
        // have to survive the species tabs re-cutting the coin, which they do.
        if (drilledIndex !== null) leaveWedges();
        onBlur(town);
      }}
      // Two levels, and which one the coin is on decides what a key means.
      //
      // At coin level Enter and Space toggle what a click on the coin toggles,
      // except on a coin whose own marks answer for their shelters: there
      // Enter steps inside instead, because a shared coin never had one honest
      // answer to Enter. The town is not what was aimed at when the plate is
      // drawing three shelters, and a pointer has been able to say which of
      // them it meant all along. Space keeps the whole group, so the pick that
      // used to be Enter's is still one keypress away.
      //
      // Drilled, the coin belongs to the mark under the keyboard: the arrows
      // walk the marks, Enter and Space pick the one they are standing on,
      // Escape leaves without picking.
      onKeyDown={(event) => {
        if (!live) return;
        if (drilled !== null) {
          // Escape never arrives here. It is taken in the capture phase at the
          // window, one step ahead of the dialog that would otherwise close on
          // it; see the effect above.
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            // An off-site mark is named and nothing more, the same deal its
            // dot has with a click. Nothing happened, so the drill stays open.
            if (!drilledPickable) return;
            const value = marks[drilled].value;
            // Out first and then the pick: one shelter chosen is the end of
            // the drill, the way Escape is the end of it without one.
            leaveWedges();
            pick([value]);
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
            // Consumed here and never handed on to onMoveFocus. While the
            // drill is open the arrows belong to the marks inside this coin,
            // and a press that walked the plate as well would leave the
            // keyboard in two places at once.
            //
            // These wrap, where the plate's own arrows do not. A town has no
            // neighbour east of the eastern-most one, but the marks in a coin
            // are two or three things arranged around a single point, and
            // there is no edge to fall off. Home and End take the first and
            // the last of them, so the pair means inside a coin what it means
            // outside one.
            event.preventDefault();
            const forward =
              event.key === "ArrowRight" || event.key === "ArrowDown";
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? marks.length - 1
                  : (drilled + (forward ? 1 : -1) + marks.length) %
                    marks.length;
            enterWedge(next);
            return;
          }
          // Everything else leaves the coin as it found it. Tab in particular
          // has to: it blurs the coin, and blur is what closes the drill.
          return;
        }
        if (event.key === "Enter" && wedged) {
          event.preventDefault();
          enterWedge(0);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pick(values);
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
          onMoveFocus(town, event.key);
        }
      }}
      className={cn(
        "group/pin outline-none transition-opacity motion-reduce:transition-none",
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
      ) : dominant ? (
        <SatelliteMarker
          town={town}
          dominant={dominant}
          satellites={satellites}
          coinRadius={geometry.discRadius}
          selected={selected}
          live={live}
          highlighted={highlighted}
          hoveredShelterValue={hoveredShelterValue}
        />
      ) : town.shelters.length > MAX_CLUSTER_DISCS ? (
        <CountDisc
          town={town}
          discRadius={geometry.discRadius}
          state={state}
          live={live}
          highlighted={highlighted}
        />
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

      {/* One transparent circle per mark, painted last and in the order the
          marks are drawn, so the mark under the pointer is the one that
          answers and the top one wins where two overlap.

          For a cluster this covers what a wedge cannot: a wedge splits the
          target by direction, which is right out at the rim and wrong over the
          discs themselves, because a large disc reaches past the town centre
          into its neighbour's wedge. For a dominated town these circles are
          the whole division, the coin taking the target and each satellite
          covering itself. */}
      {hits.map((hit) => {
        const { pickable, props } = hitHandlers(hit.value);
        return (
          <circle
            key={hit.value}
            cx={hit.x}
            cy={hit.y}
            r={hit.r}
            data-disc-shelter={hit.value}
            data-disc-pickable={pickable || undefined}
            {...props}
          />
        );
      })}

      {/* Drawn after every mark and every target, so a focus ring can never
          end up behind the coin it is meant to be around. It carries no width
          until the group is focused from the keyboard, which is the only
          state that is allowed to put the heaviest line on the plate.

          It stands down while the coin is drilled into: the keyboard is on one
          mark then, and the ring below says which. */}
      {live && !drilledMark && (
        <circle
          data-marker-focus-ring=""
          cx={town.x}
          cy={town.y}
          r={town.reach + FOCUS_RING_GAP}
          className={cn("pointer-events-none", FOCUS_RING)}
        />
      )}

      {/* The same ring one step in: around the one mark the keyboard has
          drilled into, at the weight the coin's own ring would have taken. */}
      {live && drilledMark && (
        <circle
          data-wedge-focus-ring={drilledMark.value}
          cx={drilledMark.x}
          cy={drilledMark.y}
          r={drilledMark.r + WEDGE_FOCUS_RING_GAP}
          className={cn("pointer-events-none", WEDGE_FOCUS_RING)}
        />
      )}
    </g>
  );
});

function MarkerDisc({
  cx,
  cy,
  r,
  glyphScale,
  selected,
  live,
  discAttribute,
  shelterValue,
  markKind,
  highlighted,
  hoverScope = "group",
  emptyScale = EMPTY_MARKER_RADIUS_SCALE,
}: {
  cx: number;
  cy: number;
  r: number;
  glyphScale: number;
  selected: boolean;
  live: boolean;
  discAttribute?: string;
  shelterValue?: string;
  /** Which mark this is inside a dominated town, "coin" or "satellite".
   *  Absent on a lone marker and on a cluster disc, which the marker's own
   *  data-marker-kind already names. */
  markKind?: "coin" | "satellite";
  highlighted?: boolean;
  /** "group" leans in whenever the marker is hovered anywhere. "self" waits to
   *  be told, which is what a wedged cluster needs: one disc answers, not all
   *  of them. */
  hoverScope?: "group" | "self";
  /** What share of r the hollow "nothing listed" mark draws at. A coin is much
   *  larger than that mark should ever be, so it shrinks by the scale the
   *  legend teaches. A satellite is already sized as a small companion, so it
   *  passes 1 and draws the hollow mark at its own radius, which lands it
   *  within a rounding error of the size a lone empty marker draws. */
  emptyScale?: number;
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
        data-mark-kind={markKind}
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
          r={r * emptyScale}
          style={{
            strokeWidth: EMPTY_MARKER_STROKE_WIDTH,
            // See DISC_MORPH: the attributes above are the fallback, these are
            // what actually animate.
            r: r * emptyScale,
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
      data-mark-kind={markKind}
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

// What a mark answering for one shelter is told, whether it is a cluster disc,
// a dominated town's coin or one of its satellites. All three divide their
// marker per shelter and all three divide it the same way, so the bundle is
// written once.
function markProps(
  shelter: ShelterPin,
  {
    selected,
    live,
    highlighted,
    hoveredShelterValue,
  }: {
    selected: string[];
    live: boolean;
    highlighted: boolean;
    hoveredShelterValue: string | null;
  },
) {
  const picked = selected.includes(shelter.value);
  return {
    selected: picked,
    // An off-site shelter keeps its own mark whatever its town holds: the
    // mark, not the town, is what says "this one you can pick".
    live: live && shelter.selectable !== false,
    discAttribute: picked ? "selected" : "idle",
    shelterValue: shelter.value,
    // A list hover still names the town, so it lights every mark. A pointer on
    // one mark lights that one.
    highlighted: highlighted || hoveredShelterValue === shelter.value,
    hoverScope: "self" as const,
  };
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
      {...markProps(shelter, {
        selected,
        live,
        highlighted,
        hoveredShelterValue,
      })}
    />
  ));
}

// A town one shelter holds: the coin is that shelter's, drawn exactly as it
// would be if it stood alone in its town, and its companions ride the rim as
// small discs of their own. See satelliteDiscs in lib/map-layout.ts for why
// the coin stopped being divided.
//
// Every mark answers for itself, the same deal a cluster's discs have: its own
// selected fill, its own hover, its own hit circle, its own name in the
// callout. What changes is only which shelter each mark is sized by.
function SatelliteMarker({
  town,
  dominant,
  satellites,
  coinRadius,
  selected,
  live,
  highlighted,
  hoveredShelterValue,
}: {
  town: Town;
  dominant: ShelterPin;
  satellites: ClusterDisc[];
  coinRadius: number;
  selected: string[];
  live: boolean;
  highlighted: boolean;
  hoveredShelterValue: string | null;
}) {
  const mark = (shelter: ShelterPin) =>
    markProps(shelter, { selected, live, highlighted, hoveredShelterValue });

  return (
    <>
      {/* The paw at 1.15, which is the lone marker's scale and not the
          cluster's 1.3: this coin is a lone marker in every respect but the
          company it keeps. */}
      <MarkerDisc
        cx={town.x}
        cy={town.y}
        r={coinRadius}
        glyphScale={1.15}
        markKind="coin"
        {...mark(dominant)}
      />
      {/* satelliteDiscs already put the companions in slot order and returns
          the shelter each one stands for, so the shelter is looked up by
          value rather than paired back by index: one ordering, not two that
          have to silently agree. */}
      {satellites.map((disc) => {
        const shelter = town.shelters.find(
          (entry) => entry.value === disc.value,
        );
        if (!shelter) return null;
        return (
        <MarkerDisc
          key={shelter.value}
          cx={disc.x}
          cy={disc.y}
          r={disc.r}
          // A satellite this size only clears the glyph floor at the top of
          // its band, so most of them drop the paw the way any small disc
          // does. 1.3 is the cluster scale, because the ones that do keep it
          // are as small as a cluster's quietest disc.
          glyphScale={1.3}
          markKind="satellite"
          // The hollow mark draws at the satellite's own radius. See
          // MarkerDisc's emptyScale.
          emptyScale={1}
          {...mark(shelter)}
        />
        );
      })}
    </>
  );
}

// Past three shelters the discs stop being readable and stop being honest, so
// the marker says the number instead.
function CountDisc({
  town,
  discRadius,
  state,
  live,
  highlighted,
}: {
  town: Town;
  /** The coin, handed down from the marker that already measured it, the same
   *  way SatelliteMarker receives coinRadius. */
  discRadius: number;
  state: boolean | "mixed";
  live: boolean;
  highlighted: boolean;
}) {
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
