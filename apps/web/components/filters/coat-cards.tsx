"use client";

import type { TargetAndTransition, Transition } from "motion/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { CoatColorCategory, CoatLength } from "@posvoji/schema";
import {
  CountRoll,
  FILTER_CONTROL_CLASS,
  FILTER_HOVER_SPRING,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardRipple,
  FilterCardSection,
  FilterCardTail,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import type { SectionCollapse } from "@/components/filters/filter-section-header";
import {
  useFilterCardGestures,
  useFilterCardHover,
  useOneShotCelebration,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import {
  FILTER_METADATA,
  groupLabel,
  TWO_TONED,
  type CoatColorFacet,
  type FilterOption,
} from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Colour is the one filter whose options can be shown rather than described,
 * so the swatch is the icon this section draws in the well every other section
 * puts a glyph in. It started as a 16px dot wedged in front of the label,
 * smaller than the tick box beside it, which put the least informative thing
 * on the row above the most informative one and left the section reading as a
 * checkbox list next to Energija's drawn glyphs.
 *
 * Picking a colour floods it: the dot grows until it fills its own ring. That
 * is the section's one gesture and it says what was chosen without a legend.
 *
 * The row keeps the brand fill every other chosen card wears. Painting the row
 * in its own colour was the other way to read "fill", and it does not survive
 * the set: white and cream have no ground that shows against the panel, the
 * label would need a measured ink per colour, and multicolour has no single
 * ground at all. The green says chosen, the flooded swatch says which.
 */
/**
 * The swatch colours, built in OKLCH from the catalogue's own photos.
 *
 * These were stock Material hues picked by eye, and two of them were pure
 * neutrals: #8b8b8b and #ffffff. Sampling the cached photo of all 452
 * classified animals (the central box, per-channel median, aggregated in
 * OKLab) puts every category's hue between 59 and 75 degrees. That warm band
 * includes the white and the grey animals, so most of it is the room — indoor
 * light on wood and straw — rather than the coat, but it is the band this
 * catalogue's animals are actually seen in, and a cold grey chip sat outside
 * it and outside the site's stone palette with it.
 *
 * So the hue comes from the sample and the lightness and chroma are a
 * decision: a swatch is a label, and the median brown animal photographs at
 * chroma 0.057, which as a 36px chip is mud. Each is drawn at the value that
 * reads as its own name, spread far enough apart to tell at that size
 * (closest pair cream/white, 0.118 in OKLab).
 *
 * Brown is the one the sample could not settle. It reports 70 degrees, but so
 * do the white and grey animals, so that figure is the room's cast; taken
 * literally it drew an olive chip under the word Rjava. Swept 42 to 72 and
 * set at 54, which is brown before it turns khaki.
 */
const SWATCHES: Record<Exclude<CoatColorCategory, "multicolour" | `${string}-white`>, string> = {
  // L 0.30, C 0.016, H 55. Warm, not the neutral charcoal it was.
  black: "#342c26",
  // L 0.47, C 0.070, H 54.
  brown: "#795034",
  // L 0.63, C 0.010, H 70. Barely chromatic, which is what keeps it grey
  // while letting it belong to the set.
  grey: "#8d8883",
  // L 0.71, C 0.145, H 60. The most chromatic coat in the catalogue by a
  // distance, and the swatch says so.
  orange: "#e28933",
  // L 0.865, C 0.050, H 74.
  cream: "#e7ceaf",
  // L 0.975, C 0.006, H 72. Off-white on purpose: no animal is #ffffff, and
  // pure white had no body of its own on the light panel.
  white: "#f9f6f2",
};

/**
 * The hairline every swatch wears.
 *
 * Each colour carried its own edge at first, a darker step of itself for the
 * pale ones and the fill again for the rest. That is a light-mode rule: on
 * the dark panel #292524 stands on a near-black ground, and Črna printed as a
 * hole in the grid with nothing to say where it ended. One token instead,
 * which is already the boundary-of-a-control tier and already flips with the
 * theme, so the swatch that needs an edge has one in both modes and the ones
 * that do not wear a hairline nobody looks at.
 */
const SWATCH_EDGE = "var(--control-border)";

/**
 * The one thing about Barva a reader cannot see: a mostly-black cat with a
 * white bib is filed black. Both surfaces say it, the palette as its idle
 * readout and the sheet as its section hint, so it is written once.
 */
const COLOUR_HINT: Record<Locale, string> = {
  sl: "Manjših lis pri barvi ne upoštevamo.",
  en: "Small markings do not change the colour.",
};

const CENTRE = 12;
const at = (angle: number, r: number) =>
  `${(CENTRE + r * Math.cos(angle)).toFixed(2)} ${(CENTRE + r * Math.sin(angle)).toFixed(2)}`;

/**
 * Multicolour is three wedges and not a conic gradient. The gradient was
 * unreadable at the 16px the dot used to be: three hues blended round a circle
 * that small print as one muddy brown. Three hard wedges at 17px read as three
 * colours, which is the whole claim the option makes.
 *
 * Black, orange and white out of the palette: the tortie and calico coats
 * that are most of what Večbarvna actually holds.
 */
function wedgeFaces(r: number): { d: string; fill: string }[] {
  const fills = [SWATCHES.black, SWATCHES.orange, SWATCHES.white];
  const third = (2 * Math.PI) / 3;
  return fills.map((fill, i) => {
    const from = -Math.PI / 2 + i * third;
    return {
      d: `M${CENTRE} ${CENTRE} ${at(from, r)}A${r} ${r} 0 0 1 ${at(from + third, r)}Z`,
      fill,
    };
  });
}

/**
 * A two-toned swatch is the colour and white, split down the middle.
 *
 * Halves rather than thirds, because the claim is different: Večbarvna says
 * "several colours, none of them in charge" and Črno-bela says "these two,
 * in about that much". Two clean halves also stay legible at the 14px the
 * chip draws, where a third of a disc does not.
 */
function halfFaces(colour: string, r: number): { d: string; fill: string }[] {
  const top = `${CENTRE} ${CENTRE - r}`;
  const bottom = `${CENTRE} ${CENTRE + r}`;
  return [
    { d: `M${top}A${r} ${r} 0 0 0 ${bottom}Z`, fill: colour },
    { d: `M${top}A${r} ${r} 0 0 1 ${bottom}Z`, fill: SWATCHES.white },
  ];
}

/** The plain colour that pairs with white, or undefined for the rest. */
function twoTonedOf(
  value: CoatColorFacet,
): (typeof TWO_TONED)[number] | undefined {
  return TWO_TONED.find((colour) => value === `${colour}-white`);
}

/**
 * What a swatch is made of: one disc, or a set of painted faces.
 *
 * Undefined for the plain colours keeps the animated single disc, which can
 * grow by its own radius; anything made of paths has to be scaled instead.
 * Callers branch on that, not on the value.
 */
function facesOf(
  value: CoatColorFacet,
  r: number,
): { d: string; fill: string }[] | undefined {
  if (value === "multicolour") return wedgeFaces(r);
  const pair = twoTonedOf(value);
  return pair ? halfFaces(SWATCHES[pair], r) : undefined;
}

/** The plain colour a swatch paints, for the values that are one disc. */
function discFill(value: CoatColorFacet): string {
  return value in SWATCHES
    ? SWATCHES[value as keyof typeof SWATCHES]
    : SWATCHES.grey;
}

// 11px across at rest and 17px flooded. The first pass rested at 7.2px, where
// the white disc vanished into the panel and multicolour's three wedges were
// 3px apiece and printed as one dark arrowhead. 11px is the smallest the
// wedges stay three colours at, and the growth to 17 is still the loudest
// thing that happens on the row.
const REST_RADIUS = 5.5;
const FULL_RADIUS = 8.5;
const RING_RADIUS = 8.5;
// The flood is the whole point of the gesture, so it is the slowest thing on
// the card and lands under its own weight rather than easing out.
const FLOOD_SPRING = { type: "spring", stiffness: 300, damping: 22 } as const;
const FLOOD_OUT = { duration: 0.16, ease: "easeOut" } as const;
// The palette's disc, and the ring a picked one wears outside it. 1.1 units of
// daylight between them at the 36px the grid draws, which is the gap that
// stops the ring reading as a rim on the swatch itself.
const DISC_RADIUS = 9.5;
const PICK_RING_RADIUS = 11.4;
// Where the squash bottoms out, so the ring leaves as the disc comes back up.
const RING_DELAY = 0.09;

/**
 * A picked swatch stays bigger than the ones around it.
 *
 * The ring alone carried the whole chosen state, and a 1.6px stroke is a
 * thin thing to hang it on in a grid of seven. Size is read before colour
 * and before outline, so the chosen colours are simply the large ones.
 */
const PICKED_SCALE = 1.07;
// A shade more than FilterCardHoverLift's 1.05 and -1, because this mark is
// the 36px swatch rather than a 20px glyph in a 30px well. The speed is the
// panel's, shared as FILTER_HOVER_SPRING.
const HOVER_SCALE = 1.06;
const HOVER_LIFT = -1.5;

/**
 * How heavy each colour lands.
 *
 * Energija gives every level its own tempo, and doing the same here needed
 * something a colour actually has. Lightness is it: Črna at L 0.30 is the
 * heaviest thing in the grid and Bela at L 0.975 the lightest, so black
 * lands with a deep squash and settles slowly, and white lands quick and
 * bounces. Nobody will name the rule, but picking black and picking white in
 * turn feels like handling two different objects, which is the whole point.
 *
 * Keyed off the designed lightness rather than re-derived from the hex: the
 * value is already a decision recorded in SWATCHES above.
 */
const SOLID_WEIGHT = {
  black: 0.30,
  brown: 0.47,
  grey: 0.63,
  orange: 0.71,
  multicolour: 0.75,
  cream: 0.865,
  white: 0.975,
} as const satisfies Record<Exclude<CoatColorFacet, `${string}-white`>, number>;

/**
 * A two-toned swatch is half its colour and half white, so it lands halfway
 * between the two. Črno-bela dips and settles noticeably lighter than Črna,
 * which is the truthful answer and also the useful one: the two sit next to
 * each other in the grid and now feel different to press.
 */
const WEIGHT: Record<CoatColorFacet, number> = {
  ...SOLID_WEIGHT,
  // Object.fromEntries widens its keys to string, which is the one place this
  // needs telling. CoatColorFacet is built from TWO_TONED, so the set of keys
  // being produced here cannot drift from the set being claimed.
  ...(Object.fromEntries(
    TWO_TONED.map((colour) => [
      `${colour}-white`,
      (SOLID_WEIGHT[colour] + SOLID_WEIGHT.white) / 2,
    ]),
  ) as Record<`${(typeof TWO_TONED)[number]}-white`, number>),
};

type Landing = {
  spring: { type: "spring"; stiffness: number; damping: number };
  squash: number;
  overshoot: number;
  rippleScale: number;
  rippleDuration: number;
};

function landingOf(colour: CoatColorFacet): Landing {
  const light = WEIGHT[colour];
  const heavy = 1 - light;
  return {
    // Light colours are stiffer and less damped: quicker, and they bounce.
    spring: {
      type: "spring",
      stiffness: Math.round(420 + light * 260),
      damping: +(26 - light * 10).toFixed(1),
    },
    squash: +(1 - (0.06 + 0.1 * heavy)).toFixed(3),
    overshoot: +(PICKED_SCALE + 0.04 + 0.1 * heavy).toFixed(3),
    // A heavy colour throws a wider, slower splash. It has to clear the
    // selection ring to be seen at all: at 1.35 it expanded to exactly where
    // the ring lands and the two sat on top of each other, so the splash
    // read as nothing happening.
    rippleScale: +(1.75 + 0.35 * heavy).toFixed(2),
    rippleDuration: +(0.34 + 0.22 * heavy).toFixed(2),
  };
}

/**
 * The splash a pick throws, in the colour that threw it.
 *
 * Brand green for every swatch made the seven picks identical, and the one
 * thing the gesture could say for free is which colour just landed. Pale
 * colours throw a quiet splash, which is the right amount for a pale colour.
 * Multicolour throws its orange wedge, the only one of its three with enough
 * presence on both panels.
 */
function rippleColour(colour: CoatColorFacet): string {
  if (colour === "multicolour") return SWATCHES.orange;
  // A two-toned pick splashes in its own colour, not in the white half.
  const pair = twoTonedOf(colour);
  if (pair) return SWATCHES[pair];
  // Bela would splash white on the light panel, which is nothing at all. Grey
  // is the neighbouring step of the same ramp, so the splash still reads as
  // the pale end of the palette rather than as the selection green.
  //
  // The mirror case, Črna splashing on the dark panel, is left alone: it is
  // the colour whose ring and size change most, so the gesture lands without
  // it, and the only fixes are a second mode-aware token or a colour that is
  // not the swatch's.
  if (colour === "white") return SWATCHES.grey;
  return discFill(colour);
}

/**
 * How far a painted swatch turns when it is picked.
 *
 * Far enough that the swatch lands on itself, so the spin is unmistakable
 * while it runs and the resting state is identical to the one before it.
 * Večbarvna's three wedges repeat every third of a turn. A two-toned pair
 * looks like it should repeat at a half, and does not: half a turn swaps the
 * colour and the white, so a chosen Črno-bela sat mirrored against every
 * unchosen one beside it. Two colours only come back at a whole turn.
 *
 * A plain disc has no boundary, and turning one is work nobody can see.
 */
function turnOf(colour: CoatColorFacet): number {
  if (colour === "multicolour") return 120;
  return twoTonedOf(colour) ? 360 : 0;
}

/**
 * What the swatches that were not picked do about it.
 *
 * Energija leans its neighbours away from the card that fired; a grid can do
 * the same in two axes. A pick shoves the swatches around it outward along
 * the line from the one that landed, hardest next door and dying off with
 * distance, and the heavy colours shove harder: Črna moves the grid and Bela
 * barely disturbs it. It is the same weight that drives the squash, so the
 * whole gesture is one idea rather than two.
 *
 * Small on purpose. These are 36px discs on a 50px pitch, and anything past
 * about 2px reads as the grid coming apart rather than as recoil.
 */
const GRID_COLUMNS = 4;
const NUDGE_MAX = 2.4;
const NUDGE_DECAY = 0.55;
const NUDGE_RECOIL = 0.35;
const NUDGE_DURATION = 0.32;
const NUDGE_TIMES = [0, 0.3, 0.62, 1];
const NUDGE_STEP_DELAY = 0.035;

/** Where a swatch sits in the grid, so the shove has a direction. */
function cellAt(index: number): { col: number; row: number } {
  return { col: index % GRID_COLUMNS, row: Math.floor(index / GRID_COLUMNS) };
}

type Nudge = { x: number[]; y: number[]; delay: number } | null;

function nudgeFrom(
  index: number,
  sourceIndex: number,
  sourceColour: CoatColorFacet,
): Nudge {
  if (sourceIndex < 0 || index === sourceIndex) return null;
  const here = cellAt(index);
  const from = cellAt(sourceIndex);
  const dx = here.col - from.col;
  const dy = here.row - from.row;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return null;
  // A floor under the weight, so the palest colours still move the grid a
  // little. On a bare (1 - weight) Bela came out at 0.06px, which rounds to
  // nothing: the lightest colour did not disturb its neighbours at all,
  // which reads as the effect being broken rather than as Bela being light.
  // 0.65px to 1.86px across the set, still plainly two different weights.
  const push = 0.25 + 0.75 * (1 - WEIGHT[sourceColour]);
  const amplitude = NUDGE_MAX * push * NUDGE_DECAY ** (distance - 1);
  if (amplitude < 0.1) return null;
  const ux = (dx / distance) * amplitude;
  const uy = (dy / distance) * amplitude;
  return {
    x: [0, ux, -ux * NUDGE_RECOIL, 0],
    y: [0, uy, -uy * NUDGE_RECOIL, 0],
    // The shove radiates: the far swatches are reached a beat after the near
    // ones, rather than the whole grid twitching at once.
    delay: (distance - 1) * NUDGE_STEP_DELAY,
  };
}

const RIPPLE_OPACITY = 0.45;
const RIPPLE_SCALE = 1.45;
const RIPPLE_DURATION = 0.42;
const CELEBRATION_MS = 700;
// The tick lands as the flood settles, not while the disc is still growing.
const CHECK_DELAY = 0.18;

/**
 * Everything a colour swatch is, worked out once.
 *
 * Every one of these is a pure function of the facet, and there are ten
 * facets, so computing them per swatch per render was rebuilding the same
 * path strings and spring objects on every keystroke of filtering, twice
 * over below lg where both layouts are mounted. The tables are the
 * authoritative option list from FILTER_METADATA rather than a second
 * enumeration, so a new colour cannot be added to the filter and forgotten
 * here.
 */
const FACETS = FILTER_METADATA.coatColor.map(({ value }) => value);
const FACET_VALUES = new Set<string>(FACETS);

const byFacet = <T,>(make: (colour: CoatColorFacet) => T) =>
  Object.fromEntries(FACETS.map((colour) => [colour, make(colour)])) as Record<
    CoatColorFacet,
    T
  >;

function colourOf(value: string): CoatColorFacet {
  return FACET_VALUES.has(value) ? (value as CoatColorFacet) : "grey";
}

/** The two radii any swatch is ever drawn at: the sheet tile and the grid. */
const TILE_FACES = byFacet((colour) => facesOf(colour, FULL_RADIUS));
const PALETTE_FACES = byFacet((colour) => facesOf(colour, DISC_RADIUS));
const LANDING = byFacet(landingOf);
const TURN = byFacet(turnOf);
const RIPPLE = byFacet(rippleColour);
const DISC = byFacet(discFill);

function CoatSwatch({
  colour,
  checked,
  className,
}: {
  colour: CoatColorFacet;
  checked: boolean;
  className: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : checked
      ? FLOOD_SPRING
      : FLOOD_OUT;

  const faces = TILE_FACES[colour];
  if (faces) {
    return (
      <svg
        viewBox="0 0 24 24"
        data-swatch={colour}
        className={className}
        aria-hidden
      >
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          stroke={SWATCH_EDGE}
          strokeWidth="1.4"
        />
        {/* A painted face has no radius to grow, so this half of the gesture
            is a scale. transform-box is spelled out: the initial value
            differs between the SVG attribute and the CSS property, and
            without it a group scales about the viewport origin rather than
            the disc. */}
        <m.g
          style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
          initial={false}
          animate={{ scale: checked ? 1 : REST_RADIUS / FULL_RADIUS }}
          transition={transition}
        >
          {faces.map(({ d, fill }) => (
            <path key={d} d={d} fill={fill} />
          ))}
          {/* The white face has no edge of its own against the panel, so the
              disc is closed by a hairline. non-scaling-stroke keeps it 1.4px
              at both ends of the flood instead of thinning with the group. */}
          <circle
            cx="12"
            cy="12"
            r={FULL_RADIUS}
            fill="none"
            stroke={SWATCH_EDGE}
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
        </m.g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      data-swatch={colour}
      className={className}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r={RING_RADIUS}
        fill="none"
        stroke={SWATCH_EDGE}
        strokeWidth="1.4"
      />
      {/* r rather than a scale: a circle carries its own radius, and animating
          it keeps the disc concentric with the ring without a transform box to
          reason about.

          The disc carries the edge too. A resting white dot is white on the
          panel's own white and was simply not there; stroking the disc gives
          it a boundary at every radius, and for the dark colours the stroke is
          the fill again and changes nothing. */}
      <m.circle
        cx="12"
        cy="12"
        fill={DISC[colour]}
        stroke={SWATCH_EDGE}
        strokeWidth="1"
        initial={false}
        animate={{ r: checked ? FULL_RADIUS : REST_RADIUS }}
        transition={transition}
      />
    </svg>
  );
}

// The body the coat sits on. One arc, the same in all four glyphs, so the
// only thing that differs between them is what hangs off it.
const EDGE_LEFT = 4.4;
const EDGE_RIGHT = 19.6;
const EDGE_ENDS_Y = 10.3;
const EDGE_TOP_Y = 7.4;
// The control point is the box centre, which is also what edgeY below assumes.
const COAT_EDGE = `M${EDGE_LEFT} ${EDGE_ENDS_Y}Q${CENTRE} ${EDGE_TOP_Y} ${EDGE_RIGHT} ${EDGE_ENDS_Y}`;

// Where each strand leaves the body, along that arc, and how long it runs
// against the coat's own length. One row per strand rather than two
// index-parallel arrays, so the pairing is in the data instead of in a
// comment: the middle two run longest, which is what gives the coat a soft
// crown rather than a hem cut straight across.
//
// Four strands, not five. Five across the 16 units the edge spans leaves
// 1.3px of daylight between neighbours at 20px and the coat prints as a
// smudge.
const STRANDS: readonly { t: number; crown: number }[] = [
  { t: 0.15, crown: 0.82 },
  { t: 0.38, crown: 1 },
  { t: 0.62, crown: 1 },
  { t: 0.85, crown: 0.86 },
];

// How far the tip swings forward against how far the strand falls. Hair that
// drops straight down is a comb; this is what makes it lie.
const LEAN = 0.45;

const edgeX = (t: number) => EDGE_LEFT + (EDGE_RIGHT - EDGE_LEFT) * t;

const edgeY = (t: number) =>
  (1 - t) ** 2 * EDGE_ENDS_Y + 2 * (1 - t) * t * EDGE_TOP_Y + t ** 2 * EDGE_ENDS_Y;

/**
 * One strand, falling `fall` from the arc at `t`. It leaves the body upright
 * and bends over as it runs out, which is the shape that reads as hair rather
 * than as a tooth of a comb.
 *
 * Written root first, because Motion draws a path from its start: the coat
 * grows out of the animal rather than towards it.
 */
function strandPath(t: number, fall: number): string {
  const x = edgeX(t);
  // Clear of the arc's own stroke, so the strand starts in the coat and not
  // inside the line it hangs from.
  const y = edgeY(t) + 0.35;
  const drift = fall * LEAN;
  const p = (n: number) => n.toFixed(2);
  return `M${p(x)} ${p(y)}C${p(x + drift * 0.04)} ${p(y + fall * 0.45)} ${p(x + drift * 0.35)} ${p(y + fall * 0.8)} ${p(x + drift)} ${p(y + fall * 0.94)}`;
}

const strandsFalling = (fall: number): string[] =>
  STRANDS.map(({ t, crown }) => strandPath(t, fall * crown));

/**
 * How a coat that has strands answers a pointer. Brez dlake has none, so it
 * has no motion of its own and the table below leaves this off rather than
 * carrying four numbers nothing can read.
 */
type CoatMotion = {
  /**
   * How far the coat leans when a pointer reaches for the card, in degrees,
   * and the spring it settles on. This is the paw's idea in Velikost: the
   * three answers differ in a physical property, so the spring carries it and
   * a long coat swings further and keeps swinging after a short one has
   * stopped. Skew rather than rotation, about the root line, so the coat
   * moves and the body it grows out of does not.
   */
  sway: number;
  swaySpring: { stiffness: number; damping: number; mass: number };
  /**
   * How flat the coat goes while the card is held down. The press is the one
   * gesture a phone gets: hover never fires there, so without it the whole
   * section is still on touch until the coat grows. A long coat has more to
   * squash, so it flattens further.
   */
  press: number;
  /**
   * How far this coat stirs when a different length is picked, in degrees.
   * The paw's neighbour lean, and it earns its place the same way: the three
   * rows are one scale, so showing the others answer says they are a family,
   * and the size of each answer says again which is longest.
   */
  ruffle: number;
};

type Coat = {
  strands: string[];
  /** How long the coat takes to grow in. Longer hair takes longer. */
  grow: number;
  motion?: CoatMotion;
};

// 3.6, 7.2 and 10.6 units of fall in the 24-box: the whole range between the
// arc and the floor of the box, because the fall is the only thing these
// three answers differ in.
const COAT: Record<CoatLength, Coat> = {
  // No strands, so no sway group is drawn and there is nothing to give
  // motion to. The body edge still draws itself; see CoatLengthGlyph.
  hairless: { strands: [], grow: 0.3 },
  short: {
    strands: strandsFalling(3.6),
    grow: 0.28,
    motion: {
      sway: 3.5,
      swaySpring: { stiffness: 520, damping: 22, mass: 0.4 },
      press: 0.86,
      ruffle: 1.5,
    },
  },
  medium: {
    strands: strandsFalling(7.2),
    grow: 0.37,
    motion: {
      sway: 6.5,
      swaySpring: { stiffness: 360, damping: 16, mass: 0.6 },
      press: 0.76,
      ruffle: 3,
    },
  },
  long: {
    strands: strandsFalling(10.6),
    grow: 0.46,
    motion: {
      sway: 10,
      swaySpring: { stiffness: 250, damping: 12, mass: 0.85 },
      press: 0.66,
      ruffle: 5,
    },
  },
};

// Left to right, so the coat grows as a wave along the body rather than all
// four strands at once.
const GROW_STAGGER = 0.05;

const PRESS_DURATION = 0.1;
const RUFFLE_DURATION = 0.5;
// How far down the list the draught travels per row. The whole wave has to
// finish inside CELEBRATION_MS, because that is when `ruffling` goes false
// and any row still mid-keyframe snaps to rest: with four options the last
// one ends at 3 * 0.06 + 0.5 = 0.68s against 0.7s. Adding a fifth option, or
// shortening the celebration, has to move one of these three numbers.
const RUFFLE_STEP_DELAY = 0.06;

/**
 * Growing a strand in: the length is the gesture, the opacity only takes the
 * stroke away when there is none of it drawn yet.
 *
 * Both on one transition, which is what the energy glyphs do, faded the whole
 * strand up over the draw's own duration and the wash of colour arrived ahead
 * of the tip. The draws there run 0.2s, where the two are the same event; a
 * long coat runs 0.46 and they are not. Opacity is the switch and pathLength
 * is the animation.
 */
const DRAW_IN = (duration: number, delay: number) => ({
  pathLength: { duration, delay, ease: "easeOut" as const },
  opacity: { duration: 0.08, delay },
});

/**
 * The origin the coat turns about: the top of the strands' own bounding box,
 * which is the highest of the four roots. The roots sit on an arc rather than
 * a line, so the outer two shear by about 0.18 view-box units at the longest
 * coat's lean, which is under a sixth of a pixel at 20px.
 *
 * fill-box rather than a measured point in the view box, so the four lengths
 * share one rule and none of them needs a number kept in step with the
 * geometry above. That makes the pivot content-dependent: these groups hold
 * the strands and nothing else, and anything added inside one moves it.
 *
 * originY and not transformOrigin. Motion owns transform-origin on anything
 * it animates and writes its own 50% 50% over a plain CSS value in the same
 * style object, which pivots the skew at the middle of the coat and swings
 * the roots out of the body by half the lean. originY is the prop it reads.
 * No originX: neither skewX nor scaleY reads it.
 */
const SWAY_ORIGIN = {
  transformBox: "fill-box",
  originY: 0,
} as const;

/**
 * The per-card animation inputs the shared card loop hands a renderer. One
 * named group rather than five loose fields: they always travel together, and
 * a run of same-typed booleans and numbers in a parameter list is a swap
 * nobody's compiler catches.
 */
export type CoatIconMotion = {
  hovered: boolean;
  pressed: boolean;
  /** Another option in this section has just been picked. */
  ruffling: boolean;
  /** How many rows away the picked one is. */
  neighbourDistance: number;
  /** Holds this card's icon back so a reset empties the section in order. */
  resetDelay: number;
};

/** The shape size-paw-cards and energy-cards give their own pose helpers. */
type Pose = { animate: TargetAndTransition; transition: Transition };

/**
 * What the coat is doing, as one of three answers the pointer can ask for.
 *
 * Both transforms ride one group and both pivot on the root line, so the coat
 * can lean and flatten without the body it grows out of moving: skewX about
 * that line leaves the roots where they are, and scaleY toward it lays the
 * coat down on the skin.
 *
 * Spelled as a switch the way Velikost spells its paw poses, because the
 * alternative is nested ternaries over two properties and a transition, and
 * that is where the paw's own poses were before they were pulled out.
 */
type CoatPose = "pressing" | "reaching" | "rest";

function coatPose(pose: CoatPose, motion: CoatMotion): Pose {
  switch (pose) {
    case "pressing":
      return {
        animate: { skewX: 0, scaleY: motion.press },
        transition: { duration: PRESS_DURATION, ease: "easeOut" },
      };
    case "reaching":
      return {
        animate: { skewX: -motion.sway, scaleY: 1 },
        transition: { type: "spring", ...motion.swaySpring },
      };
    case "rest":
      return {
        animate: { skewX: 0, scaleY: 1 },
        transition: { type: "spring", ...motion.swaySpring },
      };
  }
}

/**
 * The draught a card feels when a different length is picked, on its own
 * group.
 *
 * Its own, and not folded into coatPose, because the two would then write
 * skewX on one element: crossing a ruffling row with the pointer would swap a
 * keyframe array for a scalar, and Motion restarts a key whose previous value
 * was an array, so the draught would replay from zero and then be cut off
 * when the celebration window closes. Velikost avoids the same collision the
 * same way, by animating its neighbour lean and its hover lift on different
 * elements.
 *
 * `distance` and not a delay: the shared card loop knows where a row sits and
 * this file knows how long a coat takes to stir, which is the split energy
 * and size already use.
 */
function rufflePose(motion: CoatMotion, distance: number): Pose {
  return {
    animate: { skewX: [0, -motion.ruffle, 0] },
    // Springs take two keyframes, so the draught out and back runs as a tween.
    transition: {
      duration: RUFFLE_DURATION,
      delay: distance * RUFFLE_STEP_DELAY,
      ease: "easeInOut",
    },
  };
}

const STILL: Pose = {
  animate: { skewX: 0, scaleY: 1 },
  transition: { duration: 0 },
};

/**
 * An option outside the table would otherwise draw an empty well. The modal
 * coat stands in, the way energy falls back to its middle tempo and colour to
 * grey; FILTER_METADATA.coatLength is exactly the four keys of COAT today, so
 * this is the narrowing from the shared renderIcon's `value: string` rather
 * than a guard against bad data.
 */
function lengthOf(value: string): CoatLength {
  return value in COAT ? (value as CoatLength) : "short";
}

/**
 * The coat length glyph: a body edge, and the coat hanging off it.
 *
 * This section had no icon at all, so its labels started where the colour
 * labels did and the two halves of Videz did not line up.
 *
 * What was here before drew the coat as a ring standing off a filled body
 * dot, sized 13, 16 and 20px for the three lengths. Concentric circles are
 * compared by diameter, which is the hardest comparison the eye makes, and at
 * the 20px the well gives them the three rings differed by three px and read
 * as one glyph drawn three times. Worse, a filled dot inside a thin ring is
 * the mark a selected radio button wears, so every row carried two
 * control-shaped things, one of them a lie: the section is multi-select and
 * the tick box on the other end of the row is the real control. And a ring
 * that grows says "bigger", which is the paw's sentence in Velikost two
 * sections up.
 *
 * So the quantity moved off the radius and onto a length measured from a
 * datum every row shares. The body edge is one shallow arc, drawn identically
 * in all four glyphs, and the coat is four strands hanging off it. Short,
 * medium and long differ in how far the strands fall, and the rows stack into
 * a ramp the column can be read down without a legend. Brez dlake is the same
 * arc with nothing on it, which is legible precisely because the rows above
 * it show what would be there.
 *
 * Five other framings were drawn at 20px and measured against this one. A
 * filled coat band with a wavy top printed as a solid brick, its outline as
 * an empty rectangle, and an arc of coat standing off an arc of back as a
 * pair of eyebrows: at this size a wave along an edge is below the threshold
 * where it reads at all, and only discrete strokes survive. Strands standing
 * up off a ground line printed as grass, which is what strands standing up
 * off a ground line are. Hanging them instead is what makes them hair, and
 * the lean is what keeps them from printing as the rake the first attempt at
 * this glyph found: strands dropped straight down from the arc read as a comb.
 */
function CoatLengthGlyph({
  length,
  checked,
  className,
  hovered,
  pressed,
  ruffling,
  neighbourDistance,
  resetDelay,
}: {
  length: CoatLength;
  checked: boolean;
  className: string;
} & CoatIconMotion) {
  const shouldReduceMotion = useReducedMotion();
  const coat = COAT[length];
  const motion = coat.motion;
  // Taking a coat off is quick, and on a reset it waits its turn so the
  // section empties one row at a time rather than going blank at once. Every
  // other section staggers its reset; this one was leaving all at the same
  // instant because the delay stopped at the icon well's halo and never
  // reached the coat inside it.
  const retract = { duration: 0.12, delay: resetDelay, ease: "easeOut" } as const;

  // One rule for every drawn stroke: opacity is the switch, pathLength is the
  // gesture, and the retract waits its turn on a reset.
  const drawing = (delay: number) => ({
    initial: false as const,
    animate: { pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 },
    transition: shouldReduceMotion
      ? { duration: 0 }
      : checked
        ? DRAW_IN(coat.grow, delay)
        : retract,
  });

  const still = shouldReduceMotion || !motion;
  const pose =
    still || !motion
      ? STILL
      : coatPose(pressed ? "pressing" : hovered ? "reaching" : "rest", motion);
  const draught =
    still || !motion || !ruffling ? STILL : rufflePose(motion, neighbourDistance);

  return (
    <svg
      viewBox="0 0 24 24"
      data-coat-glyph={length}
      className={className}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={COAT_EDGE} className="text-muted-foreground" stroke="currentColor" />
      {/* Brez dlake has no coat to grow, so the body itself is what draws on
          the way in. Without it the one option whose answer is "nothing"
          would be the one option that does nothing when picked. It stays
          outside the groups below: those pivot on the strands' bounding box,
          and the body must not lean with a coat it does not have. */}
      {!motion && (
        <m.path d={COAT_EDGE} stroke="var(--brand-strong)" {...drawing(0)} />
      )}
      {motion && (
        <m.g
          style={SWAY_ORIGIN}
          initial={false}
          animate={draught.animate}
          transition={draught.transition}
        >
          <m.g
            style={SWAY_ORIGIN}
            initial={false}
            animate={pose.animate}
            transition={pose.transition}
          >
            <g className="text-muted-foreground" stroke="currentColor">
              {coat.strands.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            {/* The accent copy draws itself the way the energy glyphs do, and
                here that is the fact: picking a length is the coat growing to
                it, root first, one strand behind the next. */}
            <g stroke="var(--brand-strong)">
              {coat.strands.map((d, index) => (
                <m.path key={d} d={d} {...drawing(index * GROW_STAGGER)} />
              ))}
            </g>
          </m.g>
        </m.g>
      )}
    </svg>
  );
}

type CoatCardsProps = {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout: FilterCardLayout;
  collapse?: SectionCollapse;
};

/**
 * One list for both halves of Videz. They differ only in what goes in the
 * icon well and what the hint says, and writing them twice is how the two
 * sub-sections drifted apart in the first place.
 */
function CoatCards({
  group,
  hint,
  renderIcon,
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout,
  collapse,
  tracksPress = false,
}: CoatCardsProps & {
  group: "coatColor" | "coatLength";
  hint?: string;
  /**
   * One object rather than four positional booleans. Dolžina dlake needs to
   * know whether the pointer is on the card, and a fourth bare boolean beside
   * checked and dead is a swap waiting to happen.
   */
  /**
   * Whether this section's icon answers a held pointer. Off by default: the
   * colour swatch has no press gesture, and registering the handlers anyway
   * put two renders of a ten-tile grid behind every tap on it.
   */
  tracksPress?: boolean;
  renderIcon: (card: {
    value: string;
    checked: boolean;
    dead: boolean;
    motion: CoatIconMotion;
  }) => ReactNode;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(CELEBRATION_MS);
  const { beginReset, resetDelay: resetDelayOf } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue,
    pressedValue,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures({ press: tracksPress });
  const label = groupLabel(group, locale);

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebration?.value,
  );

  return (
    <FilterCardSection
      label={label}
      hint={hint}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={(locale === "sl" ? "Ponastavi: " : "Reset: ") + label}
      layout={layout}
      collapse={collapse}
      // Three across at 320px would break "Večbarvna" and "Brez dlake" over
      // two lines apiece; two keeps every label on one.
      sheetColumns="grid-cols-2"
      tone="part"
    >
      {options.map(({ value, label: option }, index) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const dead = isDeadOption(count, checked);
        const celebrating = celebration?.value === value && checked;
        const resetDelay = resetDelayOf(index);
        const gestures = gestureHandlers(value);
        // The cards that did not change feel the draught. How far away they
        // are is this loop's business; how long that takes belongs to the
        // glyph, which is the split energy and size already use.
        const motion: CoatIconMotion = {
          hovered: hoveredValue === value,
          pressed: pressedValue === value,
          ruffling: celebrationIndex >= 0 && !celebrating,
          neighbourDistance: Math.abs(index - celebrationIndex),
          resetDelay,
        };

        return (
          <button
            key={value}
            type="button"
            aria-pressed={checked}
            aria-label={`${option}, ${animalCount(count, locale)}`}
            disabled={dead}
            {...gestures}
            onClick={() => {
              if (checked) clearCelebration();
              else celebrate(value);
              releasePress(value);
              onToggle(value);
            }}
            className={filterCardVariants({
              layout,
              selected: checked,
              className: cn("flex", filterCardLayoutClass(layout)),
            })}
          >
            <FilterCardMark
              layout={layout}
              checked={checked}
              appearDelay={CHECK_DELAY}
            />
            <FilterCardIconWell
              layout={layout}
              checked={checked}
              exitDelay={resetDelay}
            >
              {celebrating && !shouldReduceMotion ? (
                <FilterCardRipple
                  key={`ring-${celebration?.id}`}
                  layout={layout}
                  opacity={RIPPLE_OPACITY}
                  scale={RIPPLE_SCALE}
                  duration={RIPPLE_DURATION}
                />
              ) : null}
              <FilterCardHoverLift hovered={motion.hovered}>
                {renderIcon({ value, checked, dead, motion })}
              </FilterCardHoverLift>
            </FilterCardIconWell>
            <FilterCardTail
              layout={layout}
              label={option}
              checked={checked}
              renderCount={(className) => (
                <CountRoll value={count} className={className} />
              )}
            />
          </button>
        );
      })}
    </FilterCardSection>
  );
}

/**
 * The swatch at chip size, for the active-filters row.
 *
 * A chip for Črna drew the facet's palette icon, the same mark Rjava and
 * Bela drew, so the one row that summarises what is on said "a colour filter
 * is set" three times instead of saying which. Every other facet's chip
 * already carries its own value's mark; this is colour's.
 *
 * Its own component rather than a filterValueGlyph entry, because that
 * function returns Lucide icons and a swatch is a filled disc in a fixed
 * colour, not a stroked glyph in currentColor.
 */
export function CoatColorChipSwatch({ value }: { value: string }) {
  const colour = colourOf(value);

  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
      {PALETTE_FACES[colour]?.map(({ d, fill }) => (
        <path key={d} d={d} fill={fill} />
      )) ?? <circle cx="12" cy="12" r={DISC_RADIUS} fill={DISC[colour]} />}
      <circle
        cx="12"
        cy="12"
        r={DISC_RADIUS}
        fill="none"
        stroke={SWATCH_EDGE}
        strokeWidth="1.4"
      />
    </svg>
  );
}

/**
 * The animal's own colours, for the fact pill that lists them.
 *
 * Capped at three. coatColors holds up to six, and six 14px discs is wider
 * than the words beside them; the pill's text names every one regardless, so
 * the swatches are there to be recognised rather than counted.
 */
export function CoatColorDots({ values }: { values: readonly string[] }) {
  return (
    <span className="flex shrink-0 -space-x-1">
      {values.slice(0, 3).map((value) => (
        <CoatColorChipSwatch key={value} value={value} />
      ))}
    </span>
  );
}

/** The swatch as the palette draws it: a disc, and a ring once it is picked. */
function PaletteSwatch({
  colour,
  checked,
  celebrating,
  resetDelay,
}: {
  colour: CoatColorFacet;
  checked: boolean;
  /** True for the one swatch whose pick is still playing. */
  celebrating: boolean;
  /** Holds this swatch's ring back so a reset winks them out in order. */
  resetDelay: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const landing = LANDING[colour];
  // The ring waits for the squash. On PICK_SPRING with no delay it was fully
  // out by 45ms, before the disc had finished dipping, so the sequence read
  // as a ring that had always been there over a swatch that twitched. Held
  // back, it sweeps out as the disc rebounds, which is one gesture.
  const ring = shouldReduceMotion
    ? { duration: 0 }
    : checked
      ? { ...landing.spring, delay: RING_DELAY }
      : { ...FLOOD_OUT, delay: resetDelay };

  const paletteFaces = PALETTE_FACES[colour];

  // The whole swatch, ring included, carries the chosen size. Celebrating, it
  // gets there through a squash and an overshoot instead of straight.
  const playing = celebrating && !shouldReduceMotion;
  const bodyScale = playing
    ? [1, landing.squash, landing.overshoot, PICKED_SCALE]
    : checked
      ? PICKED_SCALE
      : 1;

  return (
    <svg
      viewBox="0 0 24 24"
      data-swatch={colour}
      className="size-9 overflow-visible"
      aria-hidden
    >
      <m.g
        style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
        initial={false}
        animate={{ scale: bodyScale }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : celebrating
              ? { duration: 0.42, times: [0, 0.22, 0.55, 1], ease: "easeOut" }
              : checked
                ? landing.spring
                : { duration: 0.18, ease: "easeOut" }
        }
      >
        {paletteFaces ? (
          <>
            {/* Picked, the faces turn to their own next boundary, so the
                motion is unmistakable and the resting state is identical to
                the one before it. See turnOf. */}
            <m.g
              style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
              initial={false}
              animate={{ rotate: checked ? TURN[colour] : 0 }}
              transition={
                shouldReduceMotion ? { duration: 0 } : landing.spring
              }
            >
              {paletteFaces.map(({ d, fill }) => (
                <path key={d} d={d} fill={fill} />
              ))}
            </m.g>
            <circle
              cx="12"
              cy="12"
              r={DISC_RADIUS}
              fill="none"
              stroke={SWATCH_EDGE}
              strokeWidth="1.2"
            />
          </>
        ) : (
          <circle
            cx="12"
            cy="12"
            r={DISC_RADIUS}
            fill={DISC[colour]}
            stroke={SWATCH_EDGE}
            strokeWidth="1"
          />
        )}
        {/* The ring springs out of the disc it belongs to rather than fading
            in over it, so a pick is something that happens rather than a
            class that was always going to be there. It is the brand green
            every other chosen card wears, kept off the colour itself. */}
        <m.circle
          cx="12"
          cy="12"
          fill="none"
          stroke="var(--brand-strong)"
          strokeWidth="1.4"
          initial={false}
          animate={{
            r: checked ? PICK_RING_RADIUS : DISC_RADIUS,
            opacity: checked ? 1 : 0,
          }}
          transition={ring}
        />
      </m.g>
    </svg>
  );
}

/**
 * Colour in the sidebar is a palette, not a list.
 *
 * Seven named rows spent 280px of a 224px column saying in words what each
 * swatch was already showing, and the swatch was the smallest thing on the
 * row. As a grid the same seven answers take 112px and the colour is the
 * whole control.
 *
 * What the rows carried and a grid does not is the name, so the line under
 * the grid carries it instead: it names whatever the pointer or the keyboard
 * is on, names what is chosen once something is, and otherwise says the one
 * thing the swatches cannot, which is that a mostly-black cat with a white
 * bib counts as black. One line, always present, so nothing below it moves.
 *
 * The sheet keeps labelled tiles. A palette leans on hover for its names and
 * a phone has no hover, and the sheet has the width to print them.
 */
function CoatColorPalette({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout,
  collapse,
}: CoatCardsProps) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(CELEBRATION_MS);
  const { beginReset, resetDelay: resetDelayOf } = useResetStagger(
    selected.length,
    options.length,
  );
  // hoveredValue already answers the keyboard: the hook sets it on focus too,
  // gated on :focus-visible. A second piece of focus state here overrode that
  // gate, because a later onFocus prop wins over the one the hook spreads in,
  // and a swatch stayed lifted and named after a mouse click.
  const { hoveredValue, handlers: hoverHandlers } = useFilterCardHover();
  const label = groupLabel("coatColor", locale);

  // Which swatch fired, so the rest of the grid knows where the shove came
  // from. Read once per render rather than per swatch.
  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebration?.value,
  );
  const celebrationColour =
    celebrationIndex >= 0
      ? colourOf(options[celebrationIndex].value)
      : "grey";

  const touchedOption = options.find(({ value }) => value === hoveredValue);
  // Naming the chosen colours here too was the first draft, and it bought
  // nothing: a chosen swatch is already wearing its ring, and the swatch is
  // the colour. So the line has one job when idle, which is the rule nobody
  // can see.
  const readout = touchedOption
    ? `${touchedOption.label} · ${animalCount(counts.get(touchedOption.value) ?? 0, locale)}`
    : COLOUR_HINT[locale];

  return (
    <FilterCardSection
      label={label}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        // Rings wink out one after another rather than all at once, which is
        // what Energija's reset does and what makes clearing a section read
        // as one gesture instead of a frame drop.
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={(locale === "sl" ? "Ponastavi: " : "Reset: ") + label}
      layout={layout}
      collapse={collapse}
      tone="part"
      footer={
        // One line, held open, so Dolžina dlake below does not move as the
        // pointer crosses the grid. aria-live, because for a keyboard reader
        // this line is the only place the swatch under focus is named.
        <p
          aria-live="polite"
          className="mt-2 min-h-4 truncate text-2xs leading-4 text-muted-foreground"
        >
          {readout}
        </p>
      }
    >
      {/* One child of the section's own column: the palette is a grid inside
          it rather than beside it, so the heading, the reset and the fold all
          stay exactly what every other section has. */}
      <div className="grid grid-cols-4 gap-2">
        {options.map(({ value, label: option }, index) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const dead = isDeadOption(count, checked);
          const celebrating = celebration?.value === value && checked;
          const colour = colourOf(value);
          const landing = LANDING[colour];
          const hovered = hoveredValue === value;
          const resetDelay = resetDelayOf(index);
          const nudge =
            celebration && !shouldReduceMotion
              ? nudgeFrom(index, celebrationIndex, celebrationColour)
              : null;

          return (
            <button
              key={value}
              type="button"
              aria-pressed={checked}
              aria-label={`${option}, ${animalCount(count, locale)}`}
              disabled={dead}
              {...hoverHandlers(value)}
              onClick={() => {
                if (checked) clearCelebration();
                else celebrate(value);
                onToggle(value);
              }}
              // The same press, focus and dead-option answers a filter card
              // gives, spelled once in filter-card.tsx. Hand-written here it
              // had already drifted three ways in a day: 0.97 against the
              // card's 0.98, no focus-visible border, and opacity-40 over a
              // dead swatch where DEAD_OPTION_CLASS deliberately keeps the
              // full ink. Only the grid geometry is this control's own.
              className={cn(
                FILTER_CONTROL_CLASS,
                "grid justify-items-center gap-0.5 py-1",
              )}
            >
              {/* Two wrappers, because two things move this swatch and they
                  overlap in time: the shove a neighbour's pick sends, and
                  the lift the pointer gives. Folded onto one element they
                  would have to share a transition, and a spring and a
                  four-step keyframe list are not the same animation. */}
              <m.span
                className="relative grid size-9 place-items-center"
                initial={{ x: 0, y: 0 }}
                animate={nudge ? { x: nudge.x, y: nudge.y } : { x: 0, y: 0 }}
                transition={
                  nudge
                    ? {
                        duration: NUDGE_DURATION,
                        times: NUDGE_TIMES,
                        delay: nudge.delay,
                        ease: "easeOut",
                      }
                    : { duration: 0.16 }
                }
              >
              {/* The lift every other section's icon answers a pointer with,
                  which the palette lost when its rows became a grid. Keyboard
                  focus gets it too: useFilterCardHover sets hoveredValue on a
                  focus-visible focus. An explicit resting pose, not
                  initial={false}: Motion cascades that to descendants, and
                  the splash below is a child. */}
              <m.span
                className="grid place-items-center"
                initial={{ y: 0, scale: 1 }}
                animate={{
                  y: hovered ? HOVER_LIFT : 0,
                  scale: hovered ? HOVER_SCALE : 1,
                }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : FILTER_HOVER_SPRING
                }
              >
                {/* Its own presence boundary, with initial back on.
                    CollapsibleBody wraps every filter section in
                    <AnimatePresence initial={false}> so a fold does not
                    replay its contents, and that flag reaches every motion
                    child below it: this splash mounted already finished, at
                    opacity 0 and full scale, in the first frame after every
                    pick. Measured, not guessed - see the frame probe. A
                    nested AnimatePresence that says initial re-enables mount
                    animations for its own subtree and nothing else. */}
                <AnimatePresence initial>
                {celebrating && !shouldReduceMotion ? (
                  <m.span
                    key={`ring-${celebration?.id}`}
                    className="pointer-events-none absolute size-9 rounded-full border-2"
                    style={{ borderColor: RIPPLE[colour] }}
                    // Keyframes, not initial-to-animate. A mount animation
                    // here played instantly: the splash was at opacity 0 and
                    // full scale in the first frame after every pick, on
                    // every colour. A keyframe list always runs from its
                    // first entry, so it cannot be short-circuited by what an
                    // ancestor says about initial.
                    animate={{
                      opacity: [RIPPLE_OPACITY, 0],
                      scale: [0.9, landing.rippleScale],
                    }}
                    transition={{
                      duration: landing.rippleDuration,
                      ease: "easeOut",
                    }}
                  />
                ) : null}
                </AnimatePresence>
                <PaletteSwatch
                  colour={colour}
                  checked={checked}
                  celebrating={celebrating}
                  resetDelay={resetDelay}
                />
              </m.span>
              </m.span>
              <CountRoll
                value={count}
                className={cn(
                  "text-2xs tabular-nums",
                  checked
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              />
            </button>
          );
        })}
      </div>
    </FilterCardSection>
  );
}

export function CoatColorCards(props: CoatCardsProps) {
  const { locale } = useI18n();

  if (props.layout === "sidebar") return <CoatColorPalette {...props} />;

  return (
    <CoatCards
      {...props}
      group="coatColor"
      hint={COLOUR_HINT[locale]}
      renderIcon={({ value, checked, dead }) => (
        <CoatSwatch
          colour={colourOf(value)}
          checked={checked}
          className={cn(
            // Bigger than the 20px glyph the other sections put in this well.
            // A swatch is the answer itself rather than a picture of it, and
            // the sheet is the only layout that still draws one in a tile.
            "size-6.5 transition-opacity duration-200",
            // A dead option keeps its full ink everywhere else in the filters,
            // and a swatch is the one icon where that reads as available. Its
            // count says 0 and its tick box is not drawn; the colour steps
            // back without going grey.
            dead && "opacity-60",
          )}
        />
      )}
    />
  );
}

export function CoatLengthCards(props: CoatCardsProps) {
  return (
    <CoatCards
      {...props}
      group="coatLength"
      // Length needs no explanation beyond its labels.
      // The coat is the one icon here that answers a held pointer.
      tracksPress
      renderIcon={({ value, checked, dead, motion }) => (
        <CoatLengthGlyph
          length={lengthOf(value)}
          checked={checked}
          {...motion}
          className={cn("size-5", dead && "opacity-75")}
        />
      )}
    />
  );
}
