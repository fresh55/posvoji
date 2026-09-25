"use client";

import type { TargetAndTransition, Transition, Variants } from "motion/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo, type ReactNode } from "react";
import type { CoatColorCategory, CoatLength } from "@posvoji/schema";
import {
  CountRoll,
  DEAD_OPTION_CLASS,
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
import { DRAW_IN } from "@/components/filters/drawn-glyph";
import type { SectionCollapse } from "@/components/filters/filter-section-header";
import { UnansweredNote } from "@/components/filters/unanswered-note";
import {
  useFilterCardGestures,
  useFilterCardHover,
  useOneShotCelebration,
  useResetStagger,
  waitThen,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import {
  FILTER_METADATA,
  groupLabel,
  TWO_TONED,
  type CoatColorFacet,
  type FilterOption,
  type SpeciesFilter,
  type Unanswered,
} from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import type { SpeciesTab } from "@/lib/species";
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
 * Picking a colour turns the swatch into the animal wearing it: the disc grows
 * the ears of the species tab the visitor is on. That is the section's one
 * gesture and it says what was chosen without a legend. See EARS.
 *
 * The row keeps the brand fill every other chosen card wears. Painting the row
 * in its own colour was the other way to read "fill", and it does not survive
 * the set: white and cream have no ground that shows against the panel, the
 * label would need a measured ink per colour, and multicolour has no single
 * ground at all. The green says chosen, the swatch says which.
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
// Every coordinate this file writes into a path, to two places.
const p2 = (n: number) => n.toFixed(2);
const at = (angle: number, r: number) =>
  `${p2(CENTRE + r * Math.cos(angle))} ${p2(CENTRE + r * Math.sin(angle))}`;

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

// Every swatch is this disc, in both layouts: 19 of the box's 24 units. The
// sheet's tile used to draw a smaller dot inside a ring of its own until a
// pick flooded it, and a dot resting inside a ring is the mark of a selected
// radio button, on ten tiles whose real control is the tick box in the
// corner. The same critique redrew the coat length glyph below. At rest a
// swatch is only its colour.
const DISC_RADIUS = 9.5;

/**
 * A picked swatch stays bigger than the ones around it.
 *
 * The ring alone carried the whole chosen state, and a 1.6px stroke is a
 * thin thing to hang it on in a grid of ten. Size is read before colour
 * and before outline, so the chosen colours are simply the large ones.
 */
const PICKED_SCALE = 1.07;

/**
 * A colour the current narrowing has no animal of stays in its own cell, in
 * its own colour, at a little over half its size.
 *
 * Faded instead, as the sheet's tile used to draw it, Črna went grey beside
 * Siva and Oranžna went peach, and the palette has no label under a swatch to
 * say which colour it was. Size is already this control's grammar: a picked
 * colour is the large one, so one nobody can pick is the small one.
 */
const DEAD_SCALE = 0.6;
// A shade more than FilterCardHoverLift's 1.05 and -1, because this mark is
// the 36px swatch rather than a 20px glyph in a 30px well. The speed is the
// panel's, shared as FILTER_HOVER_SPRING.
const HOVER_SCALE = 1.06;
const HOVER_LIFT = -1.5;

/**
 * The animal a picked colour becomes.
 *
 * A disc is a paint chip, and a paint chip says "a colour" where this filter
 * means a coat. Picked, the swatch grows the ears of the species tab the
 * visitor is on, so Črna is a black cat on Mačke and a black dog on Psi, and
 * the chosen colours are the ones that turned into animals. A change of shape
 * is read before the outline and before the size.
 *
 * This replaced a pick borrowed from Velikost: each colour squashed and
 * shoved its neighbours by the weight of its lightness, which is the paws'
 * idea rather than a colour's, and at 36px the difference between the
 * heaviest and the lightest landing was too small to see.
 *
 * Keyed by the tab, so Ostale draws the rabbit its own tab draws
 * (species-glyph.tsx) and a new tab fails to compile here. Vse has to draw
 * something and draws the cat: most of the catalogue is cats (363 of 491
 * animals on 23 September 2026).
 */
type EarKind = SpeciesTab;

const earKindOf = (species: SpeciesFilter): EarKind =>
  species === "all" ? "cat" : species;

/** Tucked behind the head, the tips showing under a pointer, and up. */
type EarState = "stowed" | "peeking" | "up";

type EarSide = "left" | "right";
const EAR_SIDES: readonly EarSide[] = ["left", "right"];

// The right ear is the left one in a mirror, so every table below describes
// one ear. A turn written for the left ear turns the right one the opposite
// way, which is what a pair of ears does.
const MIRROR = "translate(24 0) scale(-1 1)";

/**
 * A pointed ear: a triangle with bowed sides and a rounded tip, standing on
 * the middle of its base and pointing up its own y axis.
 */
function pointedEar(width: number, height: number): string {
  const w = width / 2;
  return `M${p2(-w)} 0C${p2(-w * 0.72)} ${p2(-height * 0.45)} ${p2(-w * 0.44)} ${p2(-height * 0.85)} ${p2(-w * 0.16)} ${p2(-height * 0.98)}Q0 ${p2(-height * 1.06)} ${p2(w * 0.16)} ${p2(-height * 0.98)}C${p2(w * 0.44)} ${p2(-height * 0.85)} ${p2(w * 0.72)} ${p2(-height * 0.45)} ${p2(w)} 0Z`;
}

/** A long ear with a round tip, the same way up. */
function longEar(width: number, height: number): string {
  const w = width / 2;
  return `M${p2(-w)} 0C${p2(-w * 1.24)} ${p2(-height * 0.55)} ${p2(-w * 0.84)} ${p2(-height)} 0 ${p2(-height)}C${p2(w * 0.84)} ${p2(-height)} ${p2(w * 1.24)} ${p2(-height * 0.55)} ${p2(w)} 0Z`;
}

/** Stands an ear's base on the head, `radius` out along `angle` degrees. */
function earAt(angle: number, radius: number, turn: number): string {
  return `translate(${at((angle * Math.PI) / 180, radius)}) rotate(${turn})`;
}

/**
 * A long floppy ear, drawn about the point where it folds over the crown: out
 * over the top of the head and down the side of the face to below the cheek,
 * a spaniel's ear, lying in front of the face.
 *
 * The dog is the hard one at 36px. Round lobes standing off the sides of the
 * disc printed as a mouse or a bear, the same lobes tucked behind the head as
 * a seal, pointed ears hanging past the cheeks as an owl, and ears flopped
 * outward as a teddy bear. A short ear drawn as a line over the face read as
 * a helmet. What reads as a dog is a long ear in front of the face that
 * frames it, together with DOG_NOSE: the nose is what makes a round head with
 * hanging ears a face at all.
 */
const DOG_EAR =
  "M-0.3 0C-3.4 -0.4 -6 1 -7 3.6C-8 6.4 -8.2 10.2 -7.4 12.6C-6.8 14.4 -5 14.8 -4.1 13.4C-3.2 12 -3.3 9.2 -3 7C-2.7 4.8 -1.8 2.6 0.4 1.4Z";

/**
 * The dog's nose, low on the face. The cat has none: its pointed ears make a
 * face of the disc on their own, and a nose on the cat was one more mark in a
 * 36px drawing.
 */
const DOG_NOSE =
  "M10.5 14.6h3c.5 0 .7.5.4.9l-1.5 1.6c-.2.2-.6.2-.8 0l-1.5-1.6c-.3-.4-.1-.9.4-.9Z";

// A nose is dark, except on a coat too dark to show it, where it is drawn in
// the light ink the ear lines use there.
const LIGHT_NOSE_ON = new Set<CoatColorFacet>(["black", "brown", "grey"]);

/**
 * The light edge a dark nose wears on a two-toned coat.
 *
 * The nose sits on the line where the two colours meet. On Črno-bela its dark
 * half vanished into the black half of the face, and what was left on the
 * white half read as a notch in the split. Stroked under the fill, so only its
 * outer half shows, the edge gives the nose back its shape on the dark side
 * and is lost against the white one.
 */
const NOSE_HALO = 1.3;

/**
 * The long coat. When Dolga dlaka is picked beside a colour, the animals the
 * colours became grow it: a cat's or a rabbit's cheeks puff out into a ruff,
 * and a dog's long ears grow a feathered fringe. It is the one place the two
 * halves of Videz meet in a drawing.
 *
 * Only for Dolga. A medium coat is most of the catalogue's coats and draws
 * nothing a short one does not.
 *
 * Both are the silhouette itself, rounded lobes that widen the head at the
 * cheeks and carry the ears' ends down, rather than marks drawn on it. The
 * ruff started as three thin tufts per cheek, which at 36px and on the
 * phone's 26px tile read as a cat's whiskers, and the dog's fringe was four
 * strands that barely showed at 1x. Measured at 36px against other
 * alternatives: tufted tips on a cat's ears were too small to see, a ruff on
 * a dog is hidden behind its ears, and a cat with both tips and ruff was busy.
 */
function cheekRuff(): { shape: string; edge: string } {
  // The left cheek's; the right is its mirror, like the ears. Three lobes
  // between 122 and 200 degrees, each leaving the head just inside its edge
  // and bulging about two units past it.
  const from = 122;
  const to = 200;
  const lobes = 3;
  const step = (to - from) / lobes;
  const rad = (a: number) => (a * Math.PI) / 180;
  const valley = DISC_RADIUS - 0.2;
  const bulge = DISC_RADIUS + 2.9;
  let scallops = "";
  for (let i = 0; i < lobes; i++) {
    const start = from + i * step;
    const end = start + step;
    scallops += `C${at(rad(start + step * 0.05), bulge)} ${at(rad(end - step * 0.05), bulge)} ${at(rad(end), valley)}`;
  }
  // Drawn over the head, and closed along an arc just inside the disc's
  // hairline, so the hairline stops where the ruff starts and head and fur
  // are one outline. Behind the head, the hairline ran across the join and
  // the lobes read as something stuck to a disc.
  const inner = DISC_RADIUS - 0.7;
  return {
    shape: `M${at(rad(from), inner)}L${at(rad(from), valley)}${scallops}L${at(rad(to), inner)}A${inner} ${inner} 0 0 0 ${at(rad(from), inner)}Z`,
    // Only the outer edge is inked: the closing arc lies on the face.
    edge: `M${at(rad(from), valley)}${scallops}`,
  };
}

const CHEEK_RUFF = cheekRuff();

// The long coat on a dog's ear, in the ear's own frame: two rounded lobes
// that carry the ear's end down and a little out, the way a spaniel's ear
// feathers. The top edge is tucked up inside the ear, which is drawn over it.
const DOG_FRINGE =
  "M-7.3 10.8C-8.4 12.3 -8.8 14.8 -8.3 16.2C-7.9 17.4 -6.6 17.7 -5.9 16.5C-5.4 17.7 -3.9 17.9 -3.3 16.7C-2.8 15.6 -3 13.6 -3.4 12.2Z";

type EarFur =
  /** Over the head at the cheeks. `edge` is the part of its outline inked. */
  | { at: "cheek"; shape: string; edge: string }
  /** Hanging off the ear and moving with it, under the ear's own edge. */
  | { at: "ear"; shape: string };

type EarPose = { y?: number; rotate?: number; scale?: number; opacity?: number };

type Ear = {
  /** The left ear as a closed shape, drawn about its pivot. */
  shape: string;
  /**
   * Whether the ear's edge is inked. A pointed or long ear stands against the
   * page and its silhouette is enough; a floppy one lies on the head in the
   * head's own colour and needs its edge drawn.
   */
  inked?: boolean;
  /** A mark on the face that comes with this animal's ears. */
  nose?: string;
  /** What this animal grows for a long coat. */
  fur: EarFur;
  /** Where the pivot sits on the head, and which way the ear points. */
  place: string;
  /**
   * In front of the face or behind it. A pointed or long ear slides out from
   * behind the disc; a floppy ear hangs over the face, which is where a dog's
   * ear is.
   */
  inFront: boolean;
  pose: Record<EarState, EarPose>;
  /**
   * How the ear comes up. The species is in the spring as much as in the
   * shape: a cat's ear snaps up, a rabbit's shoots up and wobbles, a dog's
   * flops and swings.
   */
  spring: Transition;
};

// A stowed ear slides down its own axis until its tip is under the edge of
// the disc, so it is hidden behind the head. Peeking, the tip clears the edge
// by about a unit and a half.
const EARS: Record<EarKind, Ear> = {
  cat: {
    shape: pointedEar(8.4, 8.2),
    fur: { at: "cheek", ...CHEEK_RUFF },
    place: earAt(-128, 6.6, -38),
    inFront: false,
    pose: { stowed: { y: 6.6 }, peeking: { y: 3.8 }, up: { y: 0 } },
    spring: { type: "spring", stiffness: 520, damping: 22 },
  },
  dog: {
    shape: DOG_EAR,
    inked: true,
    nose: DOG_NOSE,
    fur: { at: "ear", shape: DOG_FRINGE },
    place: "translate(8.6 3.4)",
    inFront: true,
    // Stowed turned in over the face only a little further than the peek, so
    // the ear comes up through a short arc. From -80 degrees the swing
    // overshot 21 degrees outward while the spring carried the ear's size
    // past 1.18, and the ears came up as a pair of wings 64px across, 7px
    // past the palette's 50px cell, crossing the neighbours' on a switch to
    // Psi.
    pose: {
      stowed: { rotate: -45, scale: 0.3, opacity: 0 },
      peeking: { rotate: -25, scale: 0.75, opacity: 1 },
      up: { rotate: 0, scale: 1, opacity: 1 },
    },
    // The flop is the rotation's. The ear's size grows in on a spring of its
    // own that does not overshoot.
    spring: {
      type: "spring",
      stiffness: 320,
      damping: 14,
      scale: { type: "spring", stiffness: 320, damping: 36 },
    },
  },
  // A rabbit's ears, shorter than a rabbit's ear wants to be. Any taller and
  // the tips of a picked swatch on the second row reach the count under the
  // first.
  other: {
    shape: longEar(3.9, 7),
    fur: { at: "cheek", ...CHEEK_RUFF },
    place: earAt(-106, 7.4, -20),
    inFront: false,
    pose: { stowed: { y: 6.2 }, peeking: { y: 3.6 }, up: { y: 0 } },
    spring: { type: "spring", stiffness: 600, damping: 19 },
  },
};

type SwatchKey = keyof typeof SWATCHES;

/**
 * The colour each ear is painted, left then right: the patch of the coat it
 * grows out of. Črno-bela's black half is on the left, so its left ear is
 * black and its right one white, which is what makes it a tuxedo. Večbarvna's
 * white wedge is on the left and its black one on the right.
 */
function earCoats(colour: CoatColorFacet): readonly [SwatchKey, SwatchKey] {
  if (colour === "multicolour") return ["white", "black"];
  const pair = twoTonedOf(colour);
  if (pair) return [pair, "white"];
  const solid: SwatchKey = colour in SWATCHES ? (colour as SwatchKey) : "grey";
  return [solid, solid];
}

/**
 * The line a floppy ear is drawn with, per coat it lies on: light on the dark
 * coats and dark on the light ones. It cannot be SWATCH_EDGE, which on the
 * dark panel is white at 40% and vanishes against a white coat.
 */
const EAR_INK: Record<SwatchKey, string> = {
  black: "rgb(255 255 255 / 0.5)",
  brown: "rgb(255 255 255 / 0.45)",
  grey: "rgb(255 255 255 / 0.55)",
  orange: "rgb(40 30 20 / 0.38)",
  cream: "rgb(40 30 20 / 0.38)",
  white: "rgb(40 30 20 / 0.38)",
};

/**
 * Why a swatch moves on its own: it has just been picked, or another one has
 * and this one, picked already, turns its ear on that side towards it. A
 * string rather than an object, so the memoised swatch can compare it.
 */
type EarBeat = "picked" | EarSide | null;

// Once the ears are up, each species plays the gesture its tab plays: the cat
// flicks an ear, the dog tilts its head while its ears swing, the rabbit hops.
// Tweens, because each is a keyframe list.
const CAT_FLICK: Pose = {
  animate: { rotate: [0, -24, 7, 0] },
  transition: { duration: 0.3, delay: 0.62, times: [0, 0.3, 0.65, 1], ease: "easeInOut" },
};
const DOG_TILT: Pose = {
  animate: { rotate: [0, -9, 3, 0] },
  transition: { duration: 0.62, delay: 0.38, times: [0, 0.35, 0.7, 1], ease: "easeInOut" },
};
// The rabbit's hop and its ears trailing it share one clock.
const RABBIT_BEAT: Transition = {
  duration: 0.42,
  delay: 0.42,
  times: [0, 0.45, 0.8, 1],
  ease: "easeInOut",
};
const RABBIT_EARS_TRAIL: Pose = {
  animate: { rotate: [0, 10, -4, 0] },
  transition: RABBIT_BEAT,
};
// Three and a half units is 5px on the palette's 36px swatch.
const RABBIT_HOP: Pose = {
  animate: { y: [0, -3.4, 0, 0], scaleY: [1, 1, 0.92, 1] },
  transition: RABBIT_BEAT,
};
const EAR_STILL: Pose = { animate: { rotate: 0 }, transition: { duration: 0.2 } };
const SWATCH_STILL: Pose = {
  animate: { rotate: 0, y: 0, scaleY: 1 },
  transition: { duration: 0.2 },
};

// The neighbours' answer, in place of the shove the old pick sent through the
// grid: every colour already picked turns the ear nearer the new one towards
// it, a beat after it lands, the far ones a little later. A dog's floppy ear
// turns less.
const NOTICE_DELAY = 0.2;
const NOTICE_STEP = 0.06;
const EAR_NOTICE = [0, -16, 0];
const DOG_EAR_NOTICE = [0, -9, 0];
// How long an ear still turning from its own beat takes to come straight
// before it notices (waitThen's settle). At 0.12s it comes back no faster than
// the flick or the rabbit's trail it cuts short.
const NOTICE_SETTLE = 0.12;

export function earBeat(
  kind: EarKind,
  side: EarSide,
  beat: EarBeat,
  noticeDelay: number,
): Pose {
  if (beat === "picked") {
    if (kind === "cat" && side === "right") return CAT_FLICK;
    if (kind === "other") return RABBIT_EARS_TRAIL;
  }
  if (beat === side) {
    const notice = waitThen(noticeDelay, kind === "dog" ? DOG_EAR_NOTICE : EAR_NOTICE, {
      duration: 0.26,
      times: [0, 0.35, 1],
      ease: "easeInOut",
      settle: NOTICE_SETTLE,
    });
    return { animate: { rotate: notice.keyframes }, transition: notice.transition };
  }
  return EAR_STILL;
}

function swatchBeat(kind: EarKind, beat: EarBeat): Pose {
  if (beat !== "picked") return SWATCH_STILL;
  if (kind === "dog") return DOG_TILT;
  if (kind === "other") return RABBIT_HOP;
  return SWATCH_STILL;
}

/**
 * How long a pick holds its beat open, because the beat snaps to rest when
 * the hold clears. The longest are the dog's tilt (0.38 + 0.62s) and the
 * farthest neighbour's notice across ten swatches (0.2 + 9 * 0.06 + 0.26s).
 */
const EAR_BEAT_MS = 1050;
// The tick lands once the ears are up, not while they are still coming.
const EAR_CHECK_DELAY = 0.3;

// Motion owns transform-origin, so the origins are spelled as originX and
// originY rather than as a CSS value it would write over. view-box, because an
// ear's pivot is the origin of the frame its placement puts it in, and a
// fill-box origin would move with the ear's own shape.
const PIVOT = { transformBox: "view-box", originX: 0, originY: 0 } as const;
const CENTRE_ORIGIN = { transformBox: "view-box", originX: 0.5, originY: 0.5 } as const;
// A hop lands on the swatch's feet.
const FOOT_ORIGIN = { transformBox: "view-box", originX: 0.5, originY: 1 } as const;

/**
 * What a leaving ear needs that its last render could not know.
 *
 * A reset asks for its delay in the same render that unpicks the colours, and
 * that render is the one that takes the ears away, so the delay reaches them
 * through AnimatePresence's custom rather than through their own props.
 */
type EarExit = { delay: number; instant: boolean };

const INSTANT: Transition = { duration: 0 };

/** The transition asked for, or none at all under reduced motion. */
const timed = ({ instant }: EarExit, transition: Transition): Transition =>
  instant ? INSTANT : transition;

const tuck = (exit: EarExit): Transition =>
  timed(exit, { duration: 0.17, ease: "easeIn", delay: exit.delay });

function poseVariants(ear: Ear): Variants {
  return {
    stowed: (exit: EarExit) => ({ ...ear.pose.stowed, transition: tuck(exit) }),
    peeking: (exit: EarExit) => ({
      ...ear.pose.peeking,
      transition: timed(exit, FILTER_HOVER_SPRING),
    }),
    up: (exit: EarExit) => ({ ...ear.pose.up, transition: timed(exit, ear.spring) }),
  };
}

const POSE_VARIANTS = Object.fromEntries(
  Object.entries(EARS).map(([kind, ear]) => [kind, poseVariants(ear)]),
) as Record<EarKind, Variants>;

// A floppy ear's line draws itself down the ear as the ear comes up, with the
// same draw the coat strands use. The opacity is the switch: a pathLength of
// 0 with a round cap still paints a dot.
const INK_VARIANTS: Variants = {
  stowed: (exit: EarExit) => ({ pathLength: 0, opacity: 0, transition: tuck(exit) }),
  peeking: (exit: EarExit) => ({
    pathLength: 0.6,
    opacity: 1,
    transition: timed(exit, DRAW_IN(0.2, 0)),
  }),
  up: (exit: EarExit) => ({
    pathLength: 1,
    opacity: 1,
    transition: timed(exit, DRAW_IN(0.3, 0.03)),
  }),
};

// The nose arrives once the ears have come down round the face, and only for
// a pick: under a pointer the ears are only half out, and a nose on a disc
// with no face yet is a dot.
const NOSE_VARIANTS: Variants = {
  stowed: (exit: EarExit) => ({ scale: 0, opacity: 0, transition: tuck(exit) }),
  peeking: (exit: EarExit) => ({ scale: 0, opacity: 0, transition: tuck(exit) }),
  up: (exit: EarExit) => ({
    scale: 1,
    opacity: 1,
    transition: timed(exit, { type: "spring", stiffness: 520, damping: 18, delay: 0.18 }),
  }),
};
const NOSE_ORIGIN = { transformBox: "fill-box", originX: 0.5, originY: 0.5 } as const;

// The long coat arrives after the ears, and leaves with them. A ruff puffs
// out over the cheeks, from the disc's centre, with a spring that overshoots,
// which is what fur does when it is shaken out; a fringe grows down off the
// ear from its top edge. The ruff starts only a little inside its place: it
// is drawn over the face, and from further in it would sweep across it.
type FurState = "flat" | "fluffed";

// Always drawn with the ears and only fluffed out on a pick, rather than
// mounted when Dolga is pressed: under the section's presence a node mounted
// later plays its entrance already finished.
const furStateOf = (longCoat: boolean, state: EarState): FurState =>
  longCoat && state === "up" ? "fluffed" : "flat";

function furVariants(
  flat: TargetAndTransition,
  fluffed: TargetAndTransition,
  spring: Transition,
): Variants {
  return {
    flat: (exit: EarExit) => ({ ...flat, transition: tuck(exit) }),
    fluffed: (exit: EarExit) => ({ ...fluffed, transition: timed(exit, spring) }),
  };
}

const FRINGE_ORIGIN = { transformBox: "fill-box", originX: 0.5, originY: 0 } as const;

const FUR: Record<
  EarFur["at"],
  { variants: Variants; origin: typeof CENTRE_ORIGIN | typeof FRINGE_ORIGIN }
> = {
  cheek: {
    variants: furVariants(
      { scale: 0.94, opacity: 0 },
      { scale: 1, opacity: 1 },
      { type: "spring", stiffness: 380, damping: 13, delay: 0.12 },
    ),
    origin: CENTRE_ORIGIN,
  },
  // The fringe waits for the ear to swing down. Grown during the swing it
  // hung off the end of an ear still turned outward and took the ear's reach
  // to the edge of the palette's cell. It overshoots less than the ruff: it
  // grows toward the count under the swatch.
  ear: {
    variants: furVariants(
      { scaleY: 0, opacity: 0 },
      { scaleY: 1, opacity: 1 },
      { type: "spring", stiffness: 380, damping: 20, delay: 0.3 },
    ),
    origin: FRINGE_ORIGIN,
  },
};

/**
 * The ring a picked swatch wore, now drawn round the whole animal.
 *
 * The same silhouette is stroked twice under the fills: in the page's own
 * ground out to OUTLINE_GAP, which keeps daylight between the animal and its
 * outline, and in brand green OUTLINE_RING wide beyond that. Each stroke is
 * centred on the edge, so its inner half is under the animal and only the
 * outer half shows. The ground is --background because the sidebar is
 * lg:bg-background (animal-grid.tsx); the sheet's tile turns green instead and
 * draws no outline.
 */
const OUTLINE_GAP = 1.9;
const OUTLINE_RING = 1.4;

type OutlinePaint = "ring" | "gap";
// Ring first, so the gap is drawn over it.
const OUTLINE_PAINTS: readonly OutlinePaint[] = ["ring", "gap"];

function outlineVariants(width: number): Variants {
  return {
    off: (exit: EarExit) => ({
      strokeWidth: 0,
      transition: timed(exit, { duration: 0.15, ease: "easeOut", delay: exit.delay }),
    }),
    // It follows the ears out rather than arriving with them.
    on: (exit: EarExit) => ({
      strokeWidth: width,
      transition: timed(exit, { duration: 0.26, delay: 0.12, ease: "easeOut" }),
    }),
  };
}

const OUTLINE: Record<OutlinePaint, { stroke: string; variants: Variants }> = {
  ring: {
    stroke: "var(--brand-strong)",
    variants: outlineVariants(2 * (OUTLINE_GAP + OUTLINE_RING)),
  },
  gap: { stroke: "var(--background)", variants: outlineVariants(2 * OUTLINE_GAP) },
};

/**
 * How big the body sits. A pick gets there through a squash and an
 * overshoot, the one landing every colour shares now; a reset waits its turn.
 */
function bodyPose(
  beat: EarBeat,
  rest: number,
  exit: EarExit,
): { scale: number | number[]; transition: Transition } {
  if (beat === "picked") {
    return {
      scale: [1, 0.93, 1.12, rest],
      transition: timed(exit, { duration: 0.42, times: [0, 0.22, 0.58, 1], ease: "easeOut" }),
    };
  }
  return {
    scale: rest,
    transition: timed(
      exit,
      rest > 1 ? FILTER_HOVER_SPRING : { duration: 0.18, ease: "easeOut", delay: exit.delay },
    ),
  };
}

type EarPairProps = {
  kind: EarKind;
  state: EarState;
  beat: EarBeat;
  noticeDelay: number;
  exit: EarExit;
  /** Dolga dlaka is picked, so a picked animal grows its long coat. */
  longCoat: boolean;
};

/** What one ear's paint callback is asked to draw. */
type EarPart = "ear" | "fur";

/**
 * Both ears, in one paint.
 *
 * The palette draws its ears three times over, as the outline's two strokes
 * and as the coat, and every copy has to move exactly with the others or the
 * outline slides off the ear it is drawn round. One component handed the same
 * state is how three copies stay one ear.
 */
function EarPair({
  kind,
  state,
  beat,
  noticeDelay,
  exit,
  longCoat,
  from = "stowed",
  children,
}: EarPairProps & {
  /** Where the ears start when this copy mounts. */
  from?: EarState;
  children: (side: EarSide, part: EarPart) => ReactNode;
}) {
  const ear = EARS[kind];
  const fur = FUR[ear.fur.at];
  const coat = (side: EarSide) => (
    <m.g
      style={fur.origin}
      variants={fur.variants}
      custom={exit}
      initial="flat"
      animate={furStateOf(longCoat, state)}
      exit="flat"
    >
      {children(side, "fur")}
    </m.g>
  );

  return (
    <>
      {EAR_SIDES.map((side) => {
        const flick = earBeat(kind, side, beat, noticeDelay);
        return (
          <g key={side} transform={side === "right" ? MIRROR : undefined}>
            <g transform={ear.place}>
              <m.g
                style={PIVOT}
                variants={POSE_VARIANTS[kind]}
                custom={exit}
                initial={from}
                animate={state}
                exit="stowed"
              >
                {/* Its own group, because the beat and the pose would
                    otherwise write one transform: a flick arriving while the
                    ear is still springing up would cut the spring off. */}
                <m.g style={PIVOT} animate={flick.animate} transition={flick.transition}>
                  {/* Under the ear, which covers the fringe's top edge. A
                      ruff grows on the cheeks instead: see CheekFur. */}
                  {ear.fur.at === "ear" && coat(side)}
                  {children(side, "ear")}
                </m.g>
              </m.g>
            </g>
          </g>
        );
      })}
    </>
  );
}

/**
 * Both cheeks' ruff, in one paint, puffing out with the long coat.
 *
 * Its own component rather than a part of EarPair, because a ruff is drawn
 * over the head while the ears it comes with are drawn behind it. Like the
 * ears, the outline and the coat each draw a copy, and one component is how
 * the two copies stay one ruff.
 */
function CheekFur({
  state,
  exit,
  longCoat,
  children,
}: Pick<EarPairProps, "state" | "exit" | "longCoat"> & {
  children: (side: EarSide) => ReactNode;
}) {
  const fur = FUR.cheek;

  return (
    <>
      {EAR_SIDES.map((side) => (
        <g key={side} transform={side === "right" ? MIRROR : undefined}>
          <m.g
            style={fur.origin}
            variants={fur.variants}
            custom={exit}
            initial="flat"
            animate={furStateOf(longCoat, state)}
            exit="flat"
          >
            {children(side)}
          </m.g>
        </g>
      ))}
    </>
  );
}

/** A ruff in the coat's own colours, over the edge of the head. */
function CheekCoat({
  colour,
  ruff,
  ...pair
}: EarPairProps & {
  colour: CoatColorFacet;
  ruff: { shape: string; edge: string };
}) {
  const coats = EAR_COATS[colour];

  return (
    <g data-ruff="">
      <CheekFur {...pair}>
        {(side) => (
          <>
            <path d={ruff.shape} fill={SWATCHES[coats[side === "left" ? 0 : 1]]} />
            <path
              d={ruff.edge}
              fill="none"
              stroke={SWATCH_EDGE}
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </CheekFur>
    </g>
  );
}

/** The ears in the coat's own colours. */
function EarCoat({ colour, ...pair }: EarPairProps & { colour: CoatColorFacet }) {
  const ear = EARS[pair.kind];
  const coats = EAR_COATS[colour];
  // The nose sits on the split of a two-toned coat. See NOSE_HALO.
  const halo = twoTonedOf(colour) !== undefined;

  return (
    <g data-ears={pair.kind} data-long-coat={pair.longCoat ? "" : undefined}>
      <EarPair {...pair}>
        {(side, part) => {
          const coat = coats[side === "left" ? 0 : 1];
          if (part === "fur") {
            // A fringe hangs in front of the face and takes the ink its ear
            // is edged in.
            return (
              <path
                d={ear.fur.shape}
                fill={SWATCHES[coat]}
                stroke={ear.inked ? EAR_INK[coat] : SWATCH_EDGE}
                strokeWidth={ear.inked ? 1.1 : 1}
                strokeLinejoin="round"
              />
            );
          }
          if (!ear.inked) {
            return (
              <path
                d={ear.shape}
                fill={SWATCHES[coat]}
                stroke={SWATCH_EDGE}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            );
          }
          return (
            <>
              <path d={ear.shape} fill={SWATCHES[coat]} />
              <m.path
                d={ear.shape}
                fill="none"
                stroke={EAR_INK[coat]}
                strokeWidth={1.1}
                strokeLinejoin="round"
                variants={INK_VARIANTS}
                custom={pair.exit}
                initial="stowed"
                animate={pair.state}
                exit="stowed"
              />
            </>
          );
        }}
      </EarPair>
      {ear.nose && (
        <m.path
          d={ear.nose}
          data-nose=""
          fill={LIGHT_NOSE_ON.has(colour) ? EAR_INK.black : SWATCHES.black}
          stroke={halo ? EAR_INK.black : undefined}
          strokeWidth={halo ? NOSE_HALO : undefined}
          strokeLinejoin="round"
          paintOrder="stroke"
          style={NOSE_ORIGIN}
          variants={NOSE_VARIANTS}
          custom={pair.exit}
          initial="stowed"
          animate={pair.state}
          exit="stowed"
        />
      )}
    </g>
  );
}

/**
 * One of the outline's two strokes: round the disc, both ears and whatever
 * long coat the animal wears. It mounts with the pick, and its copies of the
 * ears start from wherever the coat's ears were, peeking under the pointer
 * that clicked or stowed.
 */
function EarOutline({
  paint,
  ...pair
}: EarPairProps & { paint: OutlinePaint; from: EarState }) {
  const ear = EARS[pair.kind];
  const { stroke, variants } = OUTLINE[paint];

  return (
    <m.g
      fill="none"
      stroke={stroke}
      strokeLinejoin="round"
      variants={variants}
      custom={pair.exit}
      initial="off"
      animate="on"
      exit="off"
    >
      <circle cx={CENTRE} cy={CENTRE} r={DISC_RADIUS} />
      {ear.fur.at === "cheek" && (
        <CheekFur {...pair}>{() => <path d={ear.fur.shape} />}</CheekFur>
      )}
      <EarPair {...pair}>
        {(_side, part) => <path d={part === "fur" ? ear.fur.shape : ear.shape} />}
      </EarPair>
    </m.g>
  );
}

/**
 * A colour, as the palette and the sheet's tiles both draw it: a disc at rest,
 * and the animal wearing it once it is picked.
 *
 * The ears exist only while they are showing, and the outline only once the
 * colour is picked. Each ear is two motion nodes in up to three layers, and
 * the palette and the sheet are both mounted below lg, so drawing them hidden
 * at rest would be idle motion nodes on every colour nobody has touched.
 *
 * Each presence says initial={false}: the ears of a colour already picked when
 * the section opens are simply there, and only a pick or a pointer brings them
 * up. The boundary is also what lets them come up at all. The splash this
 * palette used to throw mounted on demand under the same parents and played
 * its entrance already finished until it had a presence of its own.
 *
 * Memoised, and every prop is a primitive for it: the palette re-renders all
 * ten swatches whenever the pointer crosses one.
 */
const CoatColorSwatch = memo(function CoatColorSwatch({
  colour,
  kind,
  checked,
  dead = false,
  peeking,
  beat,
  noticeDelay = 0,
  resetDelay,
  outlined,
  longCoat,
  className,
}: {
  colour: CoatColorFacet;
  kind: EarKind;
  checked: boolean;
  /**
   * No animal in the current narrowing has this colour: drawn small, and it
   * grows no ears under a pointer. See DEAD_SCALE.
   */
  dead?: boolean;
  /** Dolga dlaka is picked, so this colour's animal grows a long coat. */
  longCoat: boolean;
  /** A pointer or keyboard focus is on it: the tips of the ears show. */
  peeking: boolean;
  beat: EarBeat;
  /** When a colour picked earlier turns its ear, for the beats that do. */
  noticeDelay?: number;
  /** Holds this swatch back so a reset empties the section in order. */
  resetDelay: number;
  /**
   * The palette's swatch: picked, it rests larger than the others and wears
   * an outline round the animal. The sheet's tile turns green instead, which
   * is the chosen state every sheet tile wears.
   */
  outlined: boolean;
  className: string;
}) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const ear = EARS[kind];
  // A dead colour is never checked, and a pointer left on it when it died
  // does not bring its ears out either.
  const state: EarState = checked ? "up" : peeking && !dead ? "peeking" : "stowed";
  const shown = state !== "stowed";
  const exit: EarExit = { delay: resetDelay, instant: shouldReduceMotion };
  const moving = shouldReduceMotion ? null : beat;
  const pair: EarPairProps = { kind, state, beat: moving, noticeDelay, exit, longCoat };
  const whole = swatchBeat(kind, moving);
  const rest = checked && outlined ? PICKED_SCALE : dead ? DEAD_SCALE : 1;
  const body = bodyPose(moving, rest, exit);
  const faces = FACES[colour];

  return (
    <svg viewBox="0 0 24 24" data-swatch={colour} className={className} aria-hidden>
      <m.g
        style={kind === "other" ? FOOT_ORIGIN : CENTRE_ORIGIN}
        initial={false}
        animate={whole.animate}
        transition={whole.transition}
      >
        <m.g
          style={CENTRE_ORIGIN}
          initial={false}
          animate={{ scale: body.scale }}
          transition={body.transition}
        >
          <AnimatePresence initial={false} custom={exit}>
            {outlined &&
              checked &&
              OUTLINE_PAINTS.map((paint) => (
                <EarOutline
                  key={`${paint}-${kind}`}
                  paint={paint}
                  from={peeking ? "peeking" : "stowed"}
                  {...pair}
                />
              ))}
          </AnimatePresence>
          {/* Both presences stay mounted whichever way the ears are drawn, so
              switching from Mačke to Psi sends the cat's ears down behind the
              head while the dog's come up in front of it. */}
          <AnimatePresence initial={false} custom={exit}>
            {shown && !ear.inFront && <EarCoat key={kind} colour={colour} {...pair} />}
          </AnimatePresence>
          {faces ? (
            faces.map(({ d, fill }) => <path key={d} d={d} fill={fill} />)
          ) : (
            <circle cx={CENTRE} cy={CENTRE} r={DISC_RADIUS} fill={DISC[colour]} />
          )}
          {/* The white face has no edge of its own against the panel, so the
              disc is closed by a hairline; for the dark colours it is the
              fill again and changes nothing. */}
          <circle
            cx={CENTRE}
            cy={CENTRE}
            r={DISC_RADIUS}
            fill="none"
            stroke={SWATCH_EDGE}
            strokeWidth={faces ? 1.2 : 1}
          />
          {/* Over the face and its hairline: a dog's ears, which hang in
              front of the face, and a ruff, which carries the head's outline
              out, so the hairline has to stop where the ruff starts. */}
          <AnimatePresence initial={false} custom={exit}>
            {shown && ear.inFront && <EarCoat key={kind} colour={colour} {...pair} />}
            {shown && ear.fur.at === "cheek" && (
              <CheekCoat key={`${kind}-cheeks`} colour={colour} ruff={ear.fur} {...pair} />
            )}
          </AnimatePresence>
        </m.g>
      </m.g>
    </svg>
  );
});

const RIPPLE_OPACITY = 0.45;
const RIPPLE_SCALE = 1.45;
const RIPPLE_DURATION = 0.42;
const CELEBRATION_MS = 700;
// Dolžina dlake's tick. Barva's waits for its ears: EAR_CHECK_DELAY.
const CHECK_DELAY = 0.18;

/**
 * Everything a colour swatch is, worked out once.
 *
 * Every one of these is a pure function of the facet, and there are ten
 * facets, so computing them per swatch per render was rebuilding the same
 * path strings on every keystroke of filtering, twice over below lg where both
 * layouts are mounted. The tables are the authoritative option list from
 * FILTER_METADATA rather than a second enumeration, so a new colour cannot be
 * added to the filter and forgotten here.
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

/** The one radius any swatch is drawn at now, in every layout. */
const FACES = byFacet((colour) => facesOf(colour, DISC_RADIUS));
const DISC = byFacet(discFill);
const EAR_COATS = byFacet(earCoats);

// The body the coat sits on. One arc, the same in all four glyphs, so the
// only thing that differs between them is what hangs off it.
//
// It spans most of the box and sits high in it, and it starts left of
// centre because the strands lean right, so the longest coat's tips still
// end inside the box. The glyph used to hang a 15-unit arc low in a 20px
// box, and the three coats printed 14x4, 14x7 and 16x10px, half the ink of
// every other icon in the panel; Kratka, the answer for most of the
// catalogue, read as a strip of lashes.
const EDGE_LEFT = 2.2;
const EDGE_RIGHT = 18.2;
const EDGE_ENDS_Y = 7.6;
const EDGE_TOP_Y = 4.2;
// The control point sits midway between the ends, which is what keeps edgeX
// below a straight line.
const EDGE_MID = (EDGE_LEFT + EDGE_RIGHT) / 2;
const COAT_EDGE = `M${EDGE_LEFT} ${EDGE_ENDS_Y}Q${EDGE_MID} ${EDGE_TOP_Y} ${EDGE_RIGHT} ${EDGE_ENDS_Y}`;
// Drawn at 24px, one unit to the pixel, as Spol's glyphs are, and a shade
// under Spol's 2 so the four strands keep the daylight between them.
const COAT_STROKE = 1.8;

// Where each strand leaves the body, along that arc, and how long it runs
// against the coat's own length. One row per strand rather than two
// index-parallel arrays, so the pairing is in the data instead of in a
// comment: the middle two run longest, which is what gives the coat a soft
// crown rather than a hem cut straight across.
//
// Four strands, not five. Five across the 16 units the edge spans leave
// about a pixel of daylight between neighbours at 24px and the coat prints
// as a smudge.
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

// The arc's highest point, at its middle.
const EDGE_APEX = (EDGE_ENDS_Y + EDGE_TOP_Y) / 2;

// Where a strand leaves the arc: clear of the arc's own stroke, so it starts
// in the coat and not inside the line it hangs from.
const rootY = (t: number) => edgeY(t) + 0.35;

// How much of its fall a strand's tip ends below its root. The rest of the
// fall goes into the bend.
const TIP_DROP = 0.94;

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
  const y = rootY(t);
  const drift = fall * LEAN;
  return `M${p2(x)} ${p2(y)}C${p2(x + drift * 0.04)} ${p2(y + fall * 0.45)} ${p2(x + drift * 0.35)} ${p2(y + fall * 0.8)} ${p2(x + drift)} ${p2(y + fall * TIP_DROP)}`;
}

/** The strands of a coat that falls `fall`, and where its lowest tip ends. */
function hangingCoat(fall: number): Pick<Coat, "strands" | "hem"> {
  return {
    strands: STRANDS.map(({ t, crown }) => strandPath(t, fall * crown)),
    hem: Math.max(
      ...STRANDS.map(({ t, crown }) => rootY(t) + fall * crown * TIP_DROP),
    ),
  };
}

/**
 * How a coat that has strands answers a pointer. Brez dlake has none, so it
 * has no motion of its own and the table below leaves this off.
 *
 * Each gesture was measured at the size it is drawn, as the distance a
 * strand's tip travels, and one that moved the tips less than about a pixel
 * was taken out rather than kept for the table's symmetry. That took
 * Kratka's lean, and the draught that used to stir the other rows when one
 * was picked: at this size it moved their tips 0.15 to 1.1px, and with only
 * Dolga's reaching a pixel it no longer said anything about the rows as a
 * family.
 */
type CoatMotion = {
  /**
   * The spring the coat settles on after a lean or a press. This is the
   * paw's idea in Velikost: the three answers differ in a physical property,
   * so the spring carries it, and a long coat keeps swinging after a short
   * one has stopped.
   */
  spring: { stiffness: number; damping: number; mass: number };
  /**
   * How far the coat leans when a pointer reaches for the card, in degrees.
   * Skew rather than rotation, about the root line, so the coat moves and the
   * body it grows out of does not. Absent for Kratka, whose 3.5 degrees moved
   * the tips 0.3px.
   */
  sway?: number;
  /**
   * How flat the coat goes while the card is held down, as a scale toward
   * the root line. The press is the one gesture a phone gets: hover never
   * fires there, so without it the whole section is still on touch until the
   * coat grows. A long coat has more to squash, so it flattens further, and
   * even Kratka's tips drop more than a pixel.
   */
  press: number;
};

type Coat = {
  strands: string[];
  /** How low the coat reaches in the 24-box: its lowest tip, or the arc. */
  hem: number;
  /** How long the coat takes to grow in. Longer hair takes longer. */
  grow: number;
  motion?: CoatMotion;
};

// 6, 9.5 and 13 units of fall in the 24-box, in even steps, because the fall
// is the only thing these three answers differ in and the column has to read
// as a ramp.
const COAT: Record<CoatLength, Coat> = {
  // No strands, so no sway group is drawn and there is nothing to give
  // motion to. The body edge still draws itself; see CoatLengthGlyph.
  hairless: { strands: [], hem: EDGE_ENDS_Y, grow: 0.3 },
  short: {
    ...hangingCoat(6),
    grow: 0.28,
    motion: {
      spring: { stiffness: 520, damping: 22, mass: 0.4 },
      press: 0.78,
    },
  },
  medium: {
    ...hangingCoat(9.5),
    grow: 0.37,
    motion: {
      spring: { stiffness: 360, damping: 16, mass: 0.6 },
      sway: 6.5,
      press: 0.76,
    },
  },
  long: {
    ...hangingCoat(13),
    grow: 0.46,
    motion: {
      spring: { stiffness: 250, damping: 12, mass: 0.85 },
      sway: 10,
      press: 0.66,
    },
  },
};

// Left to right, so the coat grows as a wave along the body rather than all
// four strands at once.
const GROW_STAGGER = 0.05;

const PRESS_DURATION = 0.1;

/**
 * The origin the coat turns about: the top of the strands' own bounding box,
 * which is the highest of the four roots. The roots sit on an arc rather than
 * a line, so the outer two shear by about 0.13 view-box units at the longest
 * coat's lean, 0.13px at 24px.
 *
 * fill-box rather than a measured point in the view box, so the four lengths
 * share one rule and none of them needs a number kept in step with the
 * geometry above. That makes the pivot content-dependent: the group holds
 * the strands and nothing else, and anything added inside it moves it.
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
  /** A click has just landed on this card and the pointer has not left. */
  settled: boolean;
  pressed: boolean;
  /** This card has just been picked and its gesture is still playing. */
  celebrating: boolean;
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
      // A coat with no lean of its own stays where it is.
      return {
        animate: { skewX: motion.sway ? -motion.sway : 0, scaleY: 1 },
        transition: { type: "spring", ...motion.spring },
      };
    case "rest":
      return {
        animate: { skewX: 0, scaleY: 1 },
        transition: { type: "spring", ...motion.spring },
      };
  }
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

  const pose =
    shouldReduceMotion || !motion
      ? STILL
      : coatPose(pressed ? "pressing" : hovered ? "reaching" : "rest", motion);

  return (
    <svg
      viewBox="0 0 24 24"
      data-coat-glyph={length}
      className={className}
      fill="none"
      strokeWidth={COAT_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={COAT_EDGE} className="text-muted-foreground" stroke="currentColor" />
      {/* Brez dlake has no coat to grow, so the body itself is what draws on
          the way in. Without it the one option whose answer is "nothing"
          would be the one option that does nothing when picked. It stays
          outside the group below: that pivots on the strands' bounding box,
          and the body must not lean with a coat it does not have. */}
      {!motion && (
        <m.path d={COAT_EDGE} stroke="var(--brand-strong)" {...drawing(0)} />
      )}
      {motion && (
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
  unanswered?: Unanswered;
};

/**
 * Barva's tile on the phone: the swatch on a line of its own, the label and
 * its count on one line under it.
 *
 * In the standard tile, label over count, ten colours stood 83px tall and
 * took 492px of a sheet that shows 388 at 390x844 and 189 at 320x568, so a
 * fifth of the sheet's scroll went to one part of one section. One line for
 * the label and the count brings the tile to about 60px, and the two columns
 * keep their order, so each solid colour still stands beside its two-toned
 * twin.
 *
 * content-start for the reason the standard tile is justify-start: a row
 * stretches to its tallest tile, and a stack centred in it would move each
 * tile's swatch by half of whatever it lacked. items-baseline keeps the count
 * on the label's baseline, though the label carries a margin of its own.
 */
const COMPACT_TILE_CLASS = `${DEAD_OPTION_CLASS} min-h-[3.75rem] flex-row flex-wrap content-start items-baseline justify-center gap-x-1.5 gap-y-0.5 px-1.5 py-1.5 text-center`;

/**
 * One list for both halves of Videz. They differ in what goes in the icon
 * well, what the hint says and how long the icon's gesture runs, and writing
 * them twice is how the two sub-sections drifted apart in the first place.
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
  unanswered,
  tracksPress = false,
  compactTiles = false,
  holdMs,
  checkDelay,
}: CoatCardsProps & {
  group: "coatColor" | "coatLength";
  hint?: string;
  /** How long a pick holds its gesture open; its tail snaps to rest after. */
  holdMs: number;
  /** When the tick lands, which is once the icon's gesture has. */
  checkDelay: number;
  /**
   * Whether this section's icon answers a held pointer. Off by default: the
   * colour swatch has no press gesture, and registering the handlers anyway
   * put two renders of a ten-tile grid behind every tap on it.
   */
  tracksPress?: boolean;
  /**
   * The sheet's tile with its label and count on one line under the icon,
   * for a section with too many answers for the standard tile. See
   * COMPACT_TILE_CLASS.
   */
  compactTiles?: boolean;
  renderIcon: (card: {
    value: string;
    checked: boolean;
    dead: boolean;
    /**
     * One object rather than four positional booleans. Dolžina dlake needs
     * to know whether the pointer is on the card, and a fourth bare boolean
     * beside checked and dead is a swap waiting to happen.
     */
    motion: CoatIconMotion;
  }) => ReactNode;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(holdMs);
  const { beginReset, resetDelay: resetDelayOf } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue,
    settledValue,
    settle,
    pressedValue,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures({ press: tracksPress });
  const label = groupLabel(group, locale);
  const compact = compactTiles && layout === "sheet";

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
      footer={<UnansweredNote tally={unanswered} />}
    >
      {options.map(({ value, label: option }, index) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const dead = isDeadOption(count, checked);
        const celebrating = celebration?.value === value && checked;
        const resetDelay = resetDelayOf(index);
        const gestures = gestureHandlers(value);
        const motion: CoatIconMotion = {
          hovered: hoveredValue === value,
          settled: settledValue === value,
          pressed: pressedValue === value,
          celebrating,
          resetDelay,
        };
        const well = (
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
        );

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
              settle(value);
              onToggle(value);
            }}
            className={filterCardVariants({
              layout,
              selected: checked,
              className: cn(
                "flex",
                compact ? COMPACT_TILE_CLASS : filterCardLayoutClass(layout),
              ),
            })}
          >
            <FilterCardMark
              layout={layout}
              checked={checked}
              appearDelay={checkDelay}
            />
            {/* The well takes a line of its own, so the label and the count
                share the next one. */}
            {compact ? (
              <span className="flex basis-full justify-center">{well}</span>
            ) : (
              well
            )}
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
export function CoatColorChipSwatch({
  value,
  className = "size-3.5",
}: {
  value: string;
  className?: string;
}) {
  const colour = colourOf(value);

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {FACES[colour]?.map(({ d, fill }) => (
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
 * The coat at chip size, for the active-filters row and the animal's facts.
 *
 * Both drew the facet's scissors, which is also Sterilizacija's mark, so a row
 * holding "Dolga dlaka" and "Sterilizacija" showed one picture for two
 * unrelated facts. This is the section's own drawing, held still: the body's
 * arc and the strands that fall from it, which is the one thing the four
 * answers differ in.
 */
export function CoatLengthMark({
  value = "long",
  className = "size-3.5",
}: {
  /** Absent for a folded run of lengths, which shows the longest. */
  value?: string;
  className?: string;
}) {
  const coat = Object.hasOwn(COAT, value) ? COAT[value as CoatLength] : COAT.long;
  // The list draws every glyph against one datum, the arc at the same height,
  // which is what lets the column read as a ramp and leaves a short coat in
  // the top of its box. A mark stands alone beside a line of text, so it is
  // centred on its own drawing instead. Kratka's sat 1.8px high in its pill.
  const lift = CENTRE - (EDGE_APEX + coat.hem) / 2;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform={`translate(0 ${p2(lift)})`}>
        <path d={COAT_EDGE} />
        {coat.strands.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Several colours, overlapped: the animal's own colours on its fact pill, and
 * the colours a folded run of pills stands for in the active-filter row.
 *
 * Capped at three. coatColors holds up to six, and six 14px discs is wider
 * than the words beside them; the pill's text names every one regardless, so
 * the swatches are there to be recognised rather than counted.
 *
 * `dense` fits the three into the 18px box every pill's mark takes, so the
 * folded pill's label still starts where the others do: 10px discs 4px apart.
 * A colour joining the run drops in; the ones already there when the stack
 * mounts do not.
 */
export function CoatColorDots({
  values,
  dense = false,
}: {
  values: readonly string[];
  dense?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <span className={cn("flex shrink-0", dense ? "-space-x-1.5" : "-space-x-1")}>
      <AnimatePresence initial={false}>
        {values.slice(0, 3).map((value) => (
          <m.span
            key={value}
            className="flex"
            initial={{ y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 520, damping: 20 }
            }
          >
            <CoatColorChipSwatch
              value={value}
              className={dense ? "size-2.5" : "size-3.5"}
            />
          </m.span>
        ))}
      </AnimatePresence>
    </span>
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
  unanswered,
  kind,
  longCoat,
}: CoatCardsProps & { kind: EarKind; longCoat: boolean }) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(EAR_BEAT_MS);
  const { beginReset, resetDelay: resetDelayOf } = useResetStagger(
    selected.length,
    options.length,
  );
  // hoveredValue already answers the keyboard: the hook sets it on focus too,
  // gated on :focus-visible. A second piece of focus state here overrode that
  // gate, because a later onFocus prop wins over the one the hook spreads in,
  // and a swatch stayed lifted and named after a mouse click.
  //
  // settledValue is the swatch a click last landed on: its ear tips stay down
  // until the pointer or focus leaves (useFilterCardHover says why).
  const {
    hoveredValue,
    settledValue,
    settle,
    handlers: hoverHandlers,
  } = useFilterCardHover();
  const label = groupLabel("coatColor", locale);

  // Which swatch was just picked, so the colours already picked know which
  // way to turn an ear. Read once per render rather than per swatch.
  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebration?.value,
  );

  const touchedOption = options.find(({ value }) => value === hoveredValue);
  // Naming the chosen colours here too was the first draft, and it bought
  // nothing: a chosen swatch is already an animal in its outline, and the
  // swatch is the colour. So the line has one job when idle, which is the
  // rule nobody can see.
  const readout = touchedOption
    ? `${touchedOption.label} · ${animalCount(counts.get(touchedOption.value) ?? 0, locale)}`
    : COLOUR_HINT[locale];

  return (
    <FilterCardSection
      label={label}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        // Ears go down one after another rather than all at once, which is
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
        <>
          <p
            aria-live="polite"
            className="mt-2 min-h-4 truncate text-2xs leading-4 text-muted-foreground"
          >
            {readout}
          </p>
          <UnansweredNote tally={unanswered} />
        </>
      }
    >
      {/* One child of the section's own column: the palette is a grid inside
          it rather than beside it, so the heading, the reset and the fold all
          stay exactly what every other section has. */}
      <div className="grid grid-cols-4 gap-2">
        {options.map(({ value, label: option }, index) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          // A dead colour keeps its cell rather than dropping out: the rest
          // closing up behind it split the solid and two-toned pairs across
          // rows. It is disabled, so no pointer or focus reaches it; the
          // guard is for a pointer that was already on it when it died.
          const dead = isDeadOption(count, checked);
          const celebrating = celebration?.value === value && checked;
          const hovered = hoveredValue === value && !dead;
          // A colour picked earlier hears the new one land and turns the ear
          // on its side, later the further away it is.
          const beat: EarBeat = celebrating
            ? "picked"
            : checked && celebrationIndex >= 0
              ? index < celebrationIndex
                ? "right"
                : "left"
              : null;
          // Only a turning ear reads the delay (earBeat), so every other
          // swatch is handed the default. Computed for all of them, it moved
          // with celebrationIndex on every pick and was the one prop that
          // made each unpicked swatch, ears and all, draw again in the
          // press's own render when nothing about it had changed.
          const noticeDelay =
            beat === "left" || beat === "right"
              ? NOTICE_DELAY + Math.abs(index - celebrationIndex) * NOTICE_STEP
              : undefined;

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
                settle(value);
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
              {/* The lift every other section's icon answers a pointer with,
                  which the palette lost when its rows became a grid. Keyboard
                  focus gets it too: useFilterCardHover sets hoveredValue on a
                  focus-visible focus. An explicit resting pose, not
                  initial={false}: Motion cascades that to descendants, and
                  the ears are descendants. */}
              <m.span
                className="grid size-9 place-items-center"
                initial={{ y: 0, scale: 1 }}
                animate={{
                  y: hovered ? HOVER_LIFT : 0,
                  scale: hovered ? HOVER_SCALE : 1,
                }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : FILTER_HOVER_SPRING
                }
              >
                <CoatColorSwatch
                  colour={colourOf(value)}
                  kind={kind}
                  checked={checked}
                  dead={dead}
                  peeking={hovered && settledValue !== value}
                  beat={beat}
                  noticeDelay={noticeDelay}
                  resetDelay={resetDelayOf(index)}
                  outlined
                  longCoat={longCoat}
                  className="size-9 overflow-visible"
                />
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

export function CoatColorCards({
  species,
  longCoat,
  ...props
}: CoatCardsProps & {
  /** The tab the visitor is on, which decides whose ears a colour grows. */
  species: SpeciesFilter;
  /** Dolga dlaka is picked, so picked colours grow a long coat. */
  longCoat: boolean;
}) {
  const { locale } = useI18n();
  const kind = earKindOf(species);

  if (props.layout === "sidebar") {
    return <CoatColorPalette {...props} kind={kind} longCoat={longCoat} />;
  }

  return (
    <CoatCards
      {...props}
      group="coatColor"
      hint={COLOUR_HINT[locale]}
      holdMs={EAR_BEAT_MS}
      checkDelay={EAR_CHECK_DELAY}
      compactTiles
      renderIcon={({ value, checked, dead, motion }) => (
        <CoatColorSwatch
          colour={colourOf(value)}
          kind={kind}
          checked={checked}
          // A dead option keeps its full ink everywhere else in the filters,
          // and a swatch is the one icon where that reads as available. Its
          // count says 0 and its tick box is not drawn, and the swatch draws
          // small in its own colour, as it does in the palette.
          dead={dead}
          peeking={motion.hovered && !motion.settled}
          beat={motion.celebrating ? "picked" : null}
          resetDelay={motion.resetDelay}
          outlined={false}
          longCoat={longCoat}
          // Bigger than the 20px glyph the other sections put in this well.
          // A swatch is the answer itself rather than a picture of it, and
          // the sheet is the only layout that still draws one in a tile.
          className="size-6.5 overflow-visible"
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
      holdMs={CELEBRATION_MS}
      checkDelay={CHECK_DELAY}
      // Length needs no explanation beyond its labels.
      // The coat is the one icon here that answers a held pointer.
      tracksPress
      renderIcon={({ value, checked, dead, motion }) => (
        <CoatLengthGlyph
          length={lengthOf(value)}
          checked={checked}
          {...motion}
          className={cn("size-6", dead && "opacity-75")}
        />
      )}
    />
  );
}
