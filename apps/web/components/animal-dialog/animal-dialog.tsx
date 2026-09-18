"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, ExternalLink, XIcon } from "lucide-react";
import {
  LazyMotion,
  animate,
  domAnimation,
  m,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { DialogShareButton } from "@/components/animal-dialog/dialog-share-button";
import {
  PhotoBloom,
  bloomWillFly,
} from "@/components/animal-dialog/photo-bloom";
import { frontPrintOf } from "@/components/animal-dialog/photo-spread";
import { PhotoStage } from "@/components/animal-dialog/photo-stage";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { useI18n } from "@/components/i18n-provider";
import { PHONE_SHELL_QUERY } from "@/lib/viewport-queries";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ClientAnimal } from "@/lib/animal";
import { animalPath, clampPhotoIndex, photoFromSearch } from "@/lib/animal-path";
import { animalSubtitle } from "@/lib/labels";
import {
  getSearchSnapshot,
  getServerSearchSnapshot,
  subscribeToLocation,
} from "@/lib/location-search";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { cn } from "@/lib/utils";

/** Where a photo was standing on screen, in viewport coordinates. */
export type DialogPhotoRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Viewport coordinates of the card the dialog was opened from. The point is
 * what the zoom grows out of; the photo box is what the selected picture
 * travels from, and is absent when there was no card to measure.
 */
export type DialogOrigin = {
  x: number;
  y: number;
  photo?: DialogPhotoRect;
};

// Written fresh rather than layered on DialogContent: the default is a
// centered max-w-lg box, and this is a full-screen takeover on phones that
// only becomes a centered box from sm up. From sm the surface itself moves to
// the info card, because the photos have to spill out above it.
// The phone scrolls the whole dialog; from sm the shell stops scrolling and
// hands that job to the card, so the scrollbar belongs to the card it scrolls
// rather than hanging in the air beside the photos.
// motion-reduce:duration-0, not motion-reduce:animate-none: see the comment
// on DialogOverlay in ui/dialog.tsx for why the animate-none guard does not
// actually take effect on a data-open:/data-closed: element.
// phone-shell:overflow-x-hidden is policy, not the fix for any one layer: naming
// only the vertical axis leaves the other computing to auto, and on a phone
// the dialog is the viewport, so it never scrolls sideways. Decoration that
// overhangs still clips itself where it stands (photo-wash.tsx). Anything wide
// enough to need reading, a long URL or a table, has to wrap or scroll inside
// its own box, because this boundary will not offer it a scrollbar.
//
// Which layout is standing is a question about width and height, not width
// alone, so a phone held sideways gets the full-screen takeover it gets
// upright. phone-shell: and desktop-box: are that question as two names
// (globals.css), and they are exact complements: every rule in here is
// written once and cannot half-exist, where the pair of variants they replace
// had to be remembered together and a rule written as max-sm: alone was a
// landscape bug nothing would catch. PHONE_SHELL below is the same boundary
// for the places that have to ask rather than style.
const CONTENT_CLASS =
  "fixed inset-0 z-50 flex flex-col text-sm text-popover-foreground outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:duration-0 phone-shell:h-dvh phone-shell:overflow-x-hidden phone-shell:overflow-y-auto phone-shell:overscroll-contain phone-shell:bg-popover phone-shell:data-open:slide-in-from-bottom-4 phone-shell:data-closed:slide-out-to-bottom-4 desktop-box:inset-auto desktop-box:top-1/2 desktop-box:left-1/2 desktop-box:max-h-[92dvh] desktop-box:w-[calc(100vw-3rem)] desktop-box:max-w-3xl desktop-box:-translate-x-1/2 desktop-box:-translate-y-1/2 desktop-box:pt-2 desktop-box:data-open:zoom-in-95 desktop-box:data-closed:zoom-out-95";

// The card carries what used to be the dialog's own frame. The pull up under
// the photos is on the wrapper around it (CARD_FRAME_CLASS), so that the edge
// arrows can be measured from the card's own top edge. The wide top padding is
// the band the fan is allowed to hang into; the title row starts below it.
//
// sm:scroll-pt-20 is for the sticky title bar: this box is the scrollport from
// sm up, and focusing a pill near the top of a scrolled card scrolled it to
// the port's edge, which is under the bar. 80px is the 64px bar and a little
// air.
//
// scrollbar-thin because on Windows the classic 17px scrollbar sits inside the
// card's rounded corner, under the next arrow. The utility rather than the bare
// property (globals.css): it carries the thumb colour that was measured to read
// on both grounds, which a hand-written scrollbar-width does not.
const CARD_CLASS =
  "relative flex flex-1 flex-col gap-4 p-4 desktop-box:min-h-0 desktop-box:scroll-pt-20 desktop-box:overflow-y-auto desktop-box:rounded-ui desktop-box:border desktop-box:bg-popover desktop-box:bg-clip-padding desktop-box:p-6 desktop-box:pt-12 desktop-box:text-popover-foreground desktop-box:shadow-lg desktop-box:scrollbar-thin";

// Room for the close button on the photo, which is fixed to the top right of
// the phone shell while the whole card scrolls under it. At 390px it stood
// over the last two or three characters of two lines of a description, and
// the shelter's running text is the only thing in the card whose lines reach
// that far right: the pills wrap short of it and the boxes end in a border,
// not in a word. So the text keeps clear of the button's column instead of
// the card reserving 44px of its width everywhere, the same way max-w-prose
// already keeps it clear of the dialog's full width. 44px is the button, and
// the 8px it is inset by is the air between them.
//
// Here rather than in animal-facts.tsx because the button is the dialog's:
// the animal's own page draws the same paragraph with nothing over it.
const DESCRIPTION_GUTTER =
  "phone-shell:[&_[data-slot=animal-description]]:pe-11";

// The card and the two edge arrows, which are drawn half outside it. The
// arrows are absolute against this box, so it is the one that carries the pull
// up under the photos: its top edge is the card's top edge, which is what the
// arrows' offset is measured from.
//
// min-h-0 from sm up only, like the card's own. Below sm the body is
// min-h-full and this grows with its content, because there the dialog itself
// is the scrollport.
const CARD_FRAME_CLASS =
  "relative flex flex-1 flex-col desktop-box:-mt-4 desktop-box:min-h-0";

// Same round language as the photo chevrons, one level up: these walk the list
// of animals rather than the list of photos.
//
// Level with the name, not with the middle of the dialog. Centred on the box
// they were absolute against, they landed wherever that animal's text ended:
// in the gap under the subtitle on a short listing, in the middle of a
// paragraph on a wordy one, and at 768px the left arrow cleared the first
// identity pill by 3px. Measured from the card's own top instead: 48px of card
// padding (sm:pt-12) and half of the 32px title row is 64px, less half the
// circle. Written as a top offset and not as a transform, because the button's
// own press animation writes the translate variable.
//
// Opaque, unlike those chevrons: half of this button hangs outside the dialog
// and half of it sits on the card, so a translucent ground was two colours at
// once, which on dark reads as a seam down the middle of the circle. The
// popover ground is the card's own, and the dark overrides are there because
// the outline variant's own fill (dark:bg-input/30) is translucent too.
//
// pointer-coarse:size-11 for the tablet. iPad portrait is 768px, which is the
// sm layout, where these arrows are the only way to the next animal: the title
// row's pair is hidden from sm up and the page keys need a keyboard. A finger
// gets the 44px floor; a mouse keeps the smaller circle, and each size takes
// half of itself off the row's own middle so both stay centred on it.
//
// That middle is not the same number for the two pointers. The row is as tall
// as the tallest thing in it, which for a finger is the 44px share and close
// buttons: 48px of card padding and half of 44 is 70px, against 48 and half
// of 32 for a mouse. The travel is the same 24px either way, so NAV_SHIFT_MAX
// below is one number.
//
// --nav-shift is the rest of "level with the name": the name is in a sticky
// bar and the arrows are absolute against the frame, which does not scroll, so
// once the bar pinned the arrows stayed at 64px and straddled its bottom edge.
// The bar's top is the card's top plus its border, then sm:pt-6 and half of the
// 32px row, which puts the pinned name's centre at 40px. The frame carries the
// number (see syncNavShift) and the default keeps the class honest on its own,
// for the first paint and for the phone, where these are hidden anyway.
const ANIMAL_NAV_CLASS =
  "absolute top-[calc(4rem-1.125rem-var(--nav-shift,0px))] z-40 hidden size-9 rounded-full bg-popover shadow-xs desktop-box:inline-flex dark:bg-popover dark:hover:bg-muted pointer-coarse:top-[calc(4.375rem-1.375rem-var(--nav-shift,0px))] pointer-coarse:size-11";

// How far the title bar travels before it is pinned: 64px at rest less the
// 40px the pinned name sits at. The card's scroll past that moves the bar no
// further, so the arrows stop with it.
const NAV_SHIFT_MAX = 24;

// The same two steps for a phone, which has neither the edge arrows above nor
// the PageUp and PageDown keys they double for: without these the only way to
// the next animal is to close the dialog and find the next card. They ride the
// title row beside the share button rather than the edges of the screen, where
// the fan's own chevrons and the close button already are. No backdrop blur:
// they sit on the card's own ground, not over a photograph. size-11 is the
// 44px floor every other control on the phone layout is held to (the share
// button beside them does the same); icon-sm alone would be 32px.
//
// The plate is stated for dark as well, for the reason GALLERY_BUTTON_CLASS
// gives in photo-gallery.tsx: the outline variant carries its own dark fill
// and it outranks an unprefixed one from here. PHONE_SHARE_CLASS below already
// did this, by lending the variant's own dark pair rather than repeating the
// background; either way the point is that the dark half has to be written.
const PHONE_NAV_CLASS =
  "size-11 rounded-full bg-background/80 shadow-xs hover:bg-background dark:bg-background/80 dark:hover:bg-background desktop-box:hidden";

// The share button stands third in that row, and on the phone it was the only
// one of the three drawn as a bare glyph: two outlined circles and then an
// icon on nothing, which reads as a different kind of control rather than the
// third step of the same one. This lends it the arrows' dress below sm, where
// they are on screen; from sm the arrows are gone and the button keeps the
// quiet ghost it wears beside the close. The dark pair is the outline
// variant's own, because on dark that variant fills with input rather than
// with background, and half a shade in the wrong direction is what would give
// the row away.
const PHONE_SHARE_CLASS =
  "phone-shell:rounded-full phone-shell:border-border phone-shell:bg-background/80 phone-shell:shadow-xs phone-shell:hover:bg-background phone-shell:dark:border-input phone-shell:dark:bg-input/30 phone-shell:dark:hover:bg-input/50 ";

const DRAG_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.6,
} as const;

// Far enough that no ordinary scroll flick throws the dialog away.
const DRAG_CLOSE_PX = 140;

// How long the fan's front print may be kept back waiting for the bloom to
// say the print's turn has come. The copy says so 180ms after it is placed, so
// this only ever fires when the report is not coming at all.
const BLOOM_HOLD_MS = 800;

// The layout the dismiss gesture was designed for, and the one question the
// whole shell is gated on. It and DESKTOP_FAN_QUERY in fan-layout.ts are the
// two halves of one boundary, derived from it in lib/viewport-queries.ts so
// they cannot answer differently on the line between them.
const PHONE_SHELL = PHONE_SHELL_QUERY;

const REVEAL_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

const CONTENT_STAGGER = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04 } },
};

const CONTENT_ITEM = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: REVEAL_SPRING },
};

// The desktop box is centered, so the card's viewport center reads as an
// offset from the middle of the box the zoom grows out of.
function zoomOrigin(origin: DialogOrigin | undefined): string | undefined {
  if (!origin || typeof window === "undefined") return undefined;
  const x = Math.round(origin.x - window.innerWidth / 2);
  const y = Math.round(origin.y - window.innerHeight / 2);
  return `calc(50% + ${x}px) calc(50% + ${y}px)`;
}

export function AnimalDialog({
  animal,
  logos,
  origin,
  siblingIds,
  reference,
  onNavigate,
  onClose,
}: {
  /** Undefined while nothing is open, and for an id no animal answers to. */
  animal: ClientAnimal | undefined;
  logos: ShelterLogos;
  origin?: DialogOrigin;
  /** What the dialog steps through: the list as filtered and sorted, whole
   *  rather than the page of it the grid has drawn so far. */
  siblingIds: string[];
  /** The dataset's build time, shared with the cards behind the dialog. */
  reference: Date;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const open = animal !== undefined;
  const contentRef = useRef<HTMLDivElement>(null);
  // The card, which is the scrollport from sm up, and the frame around it,
  // which is what the edge arrows are absolute against.
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // The arrows follow the name down as the sticky title bar pins. The shift is
  // the card's own scroll, capped at the distance the bar travels, so no
  // element has to be measured to know it.
  //
  // Written straight onto the frame's style rather than held in state: a
  // scroll must not re-render the dialog, and a custom property is read by the
  // two arrows' top offsets without React hearing about it. The floor at 0 is
  // for the elastic overscroll a trackpad can put on the card, which reports a
  // negative scrollTop and would otherwise push the arrows down.
  const syncNavShift = useCallback((scrollTop: number) => {
    const shift = Math.min(Math.max(scrollTop, 0), NAV_SHIFT_MAX);
    frameRef.current?.style.setProperty("--nav-shift", `${shift}px`);
  }, []);
  // A phone can throw the dialog away downwards. The offset lives in a motion
  // value so a finger drag does not re-render the dialog on every frame.
  const dragY = useMotionValue(0);
  // Every finger currently on the glass, counted the way the lightbox counts
  // its own. A boolean saying only that a second finger had arrived could not
  // be cleared correctly: any release had to clear it, so with three fingers
  // down, lifting one re-armed the pull while two were still pressing.
  const pointers = useRef(new Set<number>());
  // The pull in flight: the finger it belongs to, where that finger started,
  // and whether it has passed the axis test. A phone can have two fingers on
  // the glass at once, and without an owner the second one moved and ended the
  // first one's gesture: the release was then measured against a start point
  // the other finger had set, which is a dismissal nobody performed. Null while
  // no finger is pulling.
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    committed: boolean;
  } | null>(null);
  const dragSnap = useRef<ReturnType<typeof animate> | null>(null);

  // A snap back that outlives the dialog would keep a frame loop alive.
  useEffect(() => () => dragSnap.current?.stop(), []);

  // Closing, or stepping to another animal, leaves no half-finished gesture
  // behind for the next one to inherit.
  useEffect(() => {
    dragSnap.current?.stop();
    pointers.current.clear();
    drag.current = null;
    dragY.set(0);
  }, [animal, dragY]);

  // The reused card starts each animal at its heading, even when both
  // descriptions overflow a short desktop viewport.
  useEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0;
    syncNavShift(0);
  }, [animal, syncNavShift]);

  // Radix hands focus back to a trigger, and a dialog driven by the URL has
  // none. What the visitor left behind is the card they clicked, kept for the
  // close that finds no card to go back to (see onCloseAutoFocus).
  const returnFocus = useRef<HTMLElement | null>(null);
  const lightboxOpen = useRef(false);
  const trackLightbox = useCallback((open: boolean) => {
    lightboxOpen.current = open;
  }, []);
  // The closing animation still needs something to draw, and by then the
  // selection is already gone, so the last animal shown stays behind for it.
  const [lastAnimal, setLastAnimal] = useState(animal);
  if (animal && animal !== lastAnimal) setLastAnimal(animal);
  // The URL carries the photo selected on a card or in a shared link. The
  // opening animation and the fan must start with that same photograph.
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const askedPhoto = useMemo(() => photoFromSearch(search), [search]);
  const openingPhoto = lastAnimal?.images[
    clampPhotoIndex(askedPhoto, lastAnimal.images.length)
  ];
  // Whether a copy is about to set off at all, asked the way the copy itself
  // asks it: a card to leave from, a photograph to carry, and motion to carry
  // it with. Two spellings of that could disagree, and both ways round are a
  // defect, an empty front seat or the photograph drawn twice.
  const bloomOpening = bloomWillFly({
    from: origin?.photo,
    photo: openingPhoto,
    reduced: shouldReduceMotion,
  });
  // Radix announces the title on open and never again, so stepping to another
  // animal changed every word in the dialog in silence. The name goes through a
  // live region instead. Adjusted during render the way lastAnimal above is.
  const [announced, setAnnounced] = useState<{
    id: string | undefined;
    name: string;
  }>({ id: animal?.id, name: "" });
  // The fan keeps its own front print back until the copy starts to fade, so
  // the same photograph is not on screen twice. It was: the cascade had the
  // print fully opaque at +519ms with the copy still flying at +744ms. The two
  // hand over as one crossfade now, and when the bloom says so rather than on
  // a length of time this end knows.
  //
  // True from the first render for the animal the dialog opened on, which is
  // the render that mounts the fan. Waiting for the bloom to report would draw
  // the print for a frame and then take it away again.
  //
  // Only that animal. Stepping through the list with the arrows runs no bloom,
  // because the card it would leave from is behind the dialog and was never
  // measured, so the hold is armed on the step out of nothing and cleared on
  // every step after it. Which animal is open is what `announced` already
  // tracks, on the same transition, so the two are decided together.
  const [holdFront, setHoldFront] = useState(bloomOpening);
  if (announced.id !== animal?.id) {
    setHoldFront(announced.id === undefined && bloomOpening);
    setAnnounced({
      id: animal?.id,
      // Silent on the way in, because the title has just been announced, and
      // silent on the way out. Only a step from one animal to another is news.
      name:
        animal && announced.id !== undefined
          ? (animal.name ?? messages.unnamed)
          : "",
    });
  }
  // Which photo the fan has in front, so the share sheet hands over the one
  // the visitor is looking at rather than always the first. A motion value and
  // not state: only the share button reads it, and a step must not re-render
  // the card. DialogShareButton subscribes to it and is the only thing that
  // renders again when the fan turns a photo.
  const shownPhoto = useMotionValue(0);
  const openedId = animal?.id;
  const reportPhoto = useCallback(
    (index: number) => shownPhoto.set(index),
    [shownPhoto],
  );
  // The number belongs to the animal it was counted on, so it is cleared as
  // that animal leaves rather than as the next one arrives: React runs every
  // cleanup in a commit before any of that commit's new effects, so the fan
  // mounting for the next animal still gets the last word and a link opened on
  // ?foto= is not zeroed by its own arrival.
  useEffect(() => {
    if (!openedId) return;
    return () => shownPhoto.jump(0);
  }, [openedId, shownPhoto]);

  // Fired by the copy as its fade begins, and by the fail-safe below. Setting
  // it false when it already is one is a state update React drops, so the
  // second caller costs nothing.
  const endBloom = useCallback(() => setHoldFront(false), []);

  // The fail-safe. A front print that never arrives is a worse failure than
  // the same photograph drawn twice for a moment, and the bloom's report rides
  // on an animation completing: a starved frame loop, which is what a
  // background tab and a preview pane that has stopped compositing both are,
  // can leave that animation without the frame that would have finished it.
  // The timer clears the hold whether or not the copy ever reports.
  useEffect(() => {
    if (!holdFront) return;
    const timer = setTimeout(endBloom, BLOOM_HOLD_MS);
    return () => clearTimeout(timer);
  }, [holdFront, endBloom]);

  if (!lastAnimal) return null;

  const name = lastAnimal.name ?? messages.unnamed;
  // The subtitle carries what the fact badges below it do not: the species and
  // the breed. Sex and age used to be repeated here, one line above their own
  // badges, and the two "10 let" read as a mistake. The words come from
  // labels.ts, where the animal's own page reads the same line.
  const subtitle = animalSubtitle(lastAnimal, locale);
  const transition = shouldReduceMotion ? { duration: 0 } : undefined;

  // Whether the phone gets the sticky bar at the bottom of the dialog. There
  // has to be a button in the card for it to be a mirror of, and an adopted
  // animal has none: the shelter block replaces the call to action with the
  // good news and a quiet text link, while this bar went on giving a settled
  // animal a full-width primary "open the listing" the phone could not miss.
  // The condition is shelter-block.tsx's own, so the pair agree: when the bar
  // is absent the box keeps its own element.
  const stickyCta = lastAnimal.status !== "adopted";

  // An animal the current filters hide is still reachable by link, and then
  // there is no list to step through, so the arrows stay away. Closing counts
  // as nothing open, so they leave with the dialog.
  const place = animal ? siblingIds.indexOf(animal.id) : -1;
  const previousId = place > 0 ? siblingIds[place - 1] : undefined;
  const nextId =
    place >= 0 && place < siblingIds.length - 1
      ? siblingIds[place + 1]
      : undefined;

  // Page keys scroll the detail card first, including when focus is on the
  // photo above it. Only a key at the card's end steps to another animal.
  //
  // Only the keys pressed inside the dialog's own box. React bubbles a
  // portal's events up the component tree rather than the DOM one, so every
  // layer opened from in here sends its keys through this handler while
  // standing outside it: the lightbox, the share sheet, the fact popovers. A
  // page key in the share sheet's link field stepped to the next animal and
  // took the sheet down with it.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (lightboxOpen.current) return;
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    if (!event.currentTarget.contains(event.target as Node)) return;
    const card = cardRef.current;
    const direction = event.key === "PageUp" ? -1 : 1;
    if (card) {
      const end = Math.max(0, card.scrollHeight - card.clientHeight);
      const remaining = direction < 0 ? card.scrollTop : end - card.scrollTop;
      if (remaining > 1) {
        event.preventDefault();
        card.scrollTop = Math.max(
          0,
          Math.min(end, card.scrollTop + direction * card.clientHeight),
        );
        return;
      }
    }
    const target = event.key === "PageUp" ? previousId : nextId;
    if (!target) return;
    event.preventDefault();
    onNavigate(target);
  }

  // Radix would hand the open to the first focusable child, which since the
  // arrows moved to the end is the leftmost print. The front print is the
  // animal, the thing the dialog is about, and from it the arrow keys walk the
  // fan without a Tab first. Only a fan with photos has one; an animal without
  // keeps Radix's choice.
  function openOnFrontPrint(event: Event) {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const front = frontPrintOf(contentRef.current);
    if (!front) return;
    event.preventDefault();
    front.focus({ preventScroll: true });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (shouldReduceMotion || event.pointerType === "mouse") return;
    pointers.current.add(event.pointerId);
    // A pull arms on a lone finger and on nothing else. A second finger takes
    // it away from the first rather than joining it or inheriting it: what two
    // fingers mean here is a pinch, which the photo stage offers on purpose,
    // and neither of them is pulling the dialog anywhere. The count is what
    // keeps it away until the glass is clear again, because a press is only
    // the first of a hand while nothing else is down.
    if (pointers.current.size !== 1) {
      if (drag.current) {
        drag.current = null;
        dragSnap.current = animate(dragY, 0, DRAG_SPRING);
      }
      return;
    }
    // The gesture belongs to the full-screen phone layout. On the desktop box
    // the card scrolls instead, so the shell's scrollTop says nothing.
    if (!window.matchMedia(PHONE_SHELL).matches) return;
    if ((contentRef.current?.scrollTop ?? 0) > 0) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      committed: false,
    };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const pull = drag.current;
    if (!pull || event.pointerId !== pull.pointerId) return;
    const dy = event.clientY - pull.y;
    const dx = event.clientX - pull.x;
    // A sideways swipe belongs to the photos, and an upward one to the scroll.
    if (!pull.committed) {
      if (dy < 8 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
      pull.committed = true;
      // Capture only once the gesture is committed, so a finger that leaves
      // the element still reports its release. Capturing on pointerdown, the
      // way this used to, retargeted every later pointer event at this
      // element before anyone knew the gesture's axis, which starved the
      // fan's own swipe of its move and release events. Until the commit the
      // touch pointer is implicitly captured to whatever was pressed, and
      // those events bubble here anyway.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    dragY.set(Math.max(0, dy * 0.6));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    // The finger is off the glass whoever it belonged to, and the count is
    // what the next press is read against.
    pointers.current.delete(event.pointerId);
    const pull = drag.current;
    if (!pull || event.pointerId !== pull.pointerId) return;
    drag.current = null;
    if (!pull.committed) return;
    if (event.clientY - pull.y > DRAG_CLOSE_PX) {
      dragY.set(0);
      onClose();
      return;
    }
    dragSnap.current = animate(dragY, 0, DRAG_SPRING);
  }

  // A cancelled pointer is not a decision, so it always snaps back. Only the
  // owner's cancellation counts: a second finger the browser takes away has
  // nothing to give back.
  function cancelDrag(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    const pull = drag.current;
    if (!pull || event.pointerId !== pull.pointerId) return;
    drag.current = null;
    dragSnap.current = animate(dragY, 0, DRAG_SPRING);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        {/* Outside the content on purpose: the content carries the zoom, and a
            copy aimed at viewport coordinates cannot sit inside a transform. */}
        <PhotoBloom
          from={origin?.photo}
          photo={openingPhoto}
          onFlightEnd={endBloom}
        />
        <DialogPrimitive.Content
          ref={contentRef}
          data-slot="animal-dialog"
          className={CONTENT_CLASS}
          style={{ transformOrigin: zoomOrigin(origin) }}
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={openOnFrontPrint}
          onCloseAutoFocus={(event) => {
            // The card of the animal the dialog closed on, which after a
            // step through the list is not the one it opened from, and after
            // a link is the only card there is: what was focused then was
            // the body. Failing that, whatever was focused at open, as long
            // as it is still in the document; a card the filters have since
            // taken away is not, and focusing a detached node leaves focus on
            // the body with the dialog's keys dead. Otherwise Radix keeps its
            // own default.
            const card = document.querySelector<HTMLElement>(
              `a[data-slot="card-link"][href="${animalPath(lastAnimal, locale)}"]`,
            );
            const saved = returnFocus.current;
            returnFocus.current = null;
            const target = card ?? (saved?.isConnected ? saved : null);
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
        >
          {/* Mounted empty for as long as the dialog is open, so the name of
              the animal stepped to arrives as a change in a region that was
              already there. */}
          <span
            data-slot="animal-announcement"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {announced.name}
          </span>

          {/* On a phone the close button rides over the photo; on a wider
              screen it belongs on the card's own title line. */}
          <DialogPrimitive.Close asChild>
            <Button
              data-slot="dialog-close-photo"
              variant="ghost"
              size="icon-sm"
              // fixed, not absolute: the phone scrolls the whole dialog, and
              // an absolute button is laid out in that scrollable content, so
              // it left the screen with the photo about 80px in and the only
              // visible way out went with it. The entrance keeps a transform
              // on the content, which makes this fixed to the content box
              // rather than to the viewport, and that box is inset-0 either
              // way. What changes is that it no longer rides the scroll.
              //
              // This one is the ghost variant, which fills nothing at rest, so
              // the resting plate below survives the dark theme on its own.
              // Its hover does not: ghost carries dark:hover:bg-muted/50, and
              // that outranks the unprefixed hover here for the reason
              // GALLERY_BUTTON_CLASS gives in photo-gallery.tsx, so a pointer
              // on this disc took the plate off the photograph underneath.
              className="fixed top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-40 size-11 rounded-full bg-background/80 shadow-xs backdrop-blur-sm hover:bg-background dark:hover:bg-background desktop-box:hidden"
            >
              <XIcon aria-hidden />
              <span className="sr-only">{messages.close}</span>
            </Button>
          </DialogPrimitive.Close>

          <LazyMotion features={domAnimation}>
            <m.div
              data-slot="animal-dialog-body"
              className="flex min-h-full flex-col desktop-box:min-h-0"
              style={{ y: dragY }}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              variants={CONTENT_STAGGER}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="shown"
              transition={transition}
            >
              <m.div
                className="relative z-10 shrink-0"
                variants={CONTENT_ITEM}
                transition={transition}
              >
                {/* The wash and the fan, with everything a photo step changes
                    held inside them. Not keyed: the wash has to outlive the
                    fan's own per-animal remount for one animal's colour to
                    fade into the next one's. */}
                <PhotoStage
                  animal={lastAnimal}
                  initialIndex={askedPhoto}
                  onIndexChange={reportPhoto}
                  holdFrontPrint={holdFront}
                  onLightboxOpenChange={trackLightbox}
                />
              </m.div>

              <div
                ref={frameRef}
                data-slot="animal-dialog-frame"
                className={CARD_FRAME_CLASS}
              >
                <div
                  ref={cardRef}
                  data-slot="animal-dialog-card"
                  className={cn(CARD_CLASS, DESCRIPTION_GUTTER)}
                  // The whole handler is one clamp and one custom property
                  // written on the frame above, so a scroll neither renders
                  // anything nor reads any layout back. Below sm this box is
                  // not a scrollport and the arrows are hidden, so it never
                  // fires there.
                  onScroll={(event) =>
                    syncNavShift(event.currentTarget.scrollTop)
                  }
                >
                  {/* The title line stays put while the card scrolls under it.

                      The card is its own scrollport on sm and up, and the
                      close button lives on this line, so on a short viewport
                      the only visible way out scrolled away with the name: at
                      1440x700 with the description expanded, both sat 54px
                      above the card's top edge with the dialog scrolled to the
                      bottom. That is the same failure the fixed close on the
                      photo was written for on phones, one breakpoint up, and
                      the note on that button says so in as many words.

                      Sticky rather than a second fixed button, because the
                      card already has the right control in the right place and
                      only needed it to stay: one close button, where it has
                      always been. z-20 clears the photo spread's z-10, so the
                      bar passes over the fan's overhang instead of under it,
                      and the negative inset plus matching padding lets the
                      popover ground span the card's full width rather than
                      leaving the text to scroll through a 24px gutter beside
                      it.

                      The name alone. The species line used to pin with it,
                      which made the bar 88px tall, a fifth of the card's
                      scroll window, for a word that does not need to follow
                      the reader down the page.

                      sm:pb-3 is air for what passes under the bar: at pb-2 a
                      strip of letter tops, or the bottom arc of a pill, stood
                      cut off 8px under the edge. Not a fade: a gradient hung
                      under the bar washed the species line at rest, which
                      sits 8px below it.

                      sm: only. The phone scrolls the whole dialog rather than
                      this box, has no scrollport for a sticky child to hold
                      itself against, and is already answered by the fixed
                      button on the photo.

                      The inset shadow draws this box's own last row in the
                      ground it is already painted in, so there is nothing to
                      see and nothing to lay out. It is there because the
                      dialog centres on a half pixel: Chrome then draws the
                      ground's last row part-covered, and what it blends into
                      the uncovered part is the page behind the dialog rather
                      than the card's own ground. That reads as a hairline
                      under the name, in patches wherever the grid behind
                      happens to be dark. Measured on the built export: 225
                      pixels at 186 on white, in 8 of 9 openings, gone with
                      this line.

                      Asking for the row rather than for a compositing layer.
                      will-change and an outset shadow both clear it too, and
                      both drop the title to greyscale antialiasing (its
                      colour-fringed pixels go 270 to 0); this keeps it at
                      270. Growing the box by a pixel of padding does not
                      clear it, so what matters is that the row is asked for
                      as a decoration, not that the ground is a pixel taller. */}
                  <m.div
                    className="desktop-box:sticky desktop-box:-top-12 desktop-box:z-20 desktop-box:-mx-6 desktop-box:-mt-6 desktop-box:bg-popover desktop-box:px-6 desktop-box:pt-6 desktop-box:pb-3 desktop-box:shadow-[inset_0_-1px_0_0_var(--popover)]"
                    variants={CONTENT_ITEM}
                    transition={transition}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {/* The name is what gives way, not the controls. On a
                          360px phone "brezrepa tritačka Luna" pushed all three
                          round buttons to a second line. flex-1 from a zero
                          basis hands the name whatever the row has left over,
                          and below sm it wraps inside that width and stops at
                          two lines. */}
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {/* text-2xl is the size the animal's own page gives
                            the same name, and the dialog is that page in a
                            box. It costs the row nothing: the line box is
                            32px, which is what the icon-sm controls beside it
                            already stood at, so the bar and the arrows' offset
                            are measured from the same row as before. */}
                        <DialogTitle className="min-w-0 break-words font-semibold text-2xl tracking-tight phone-shell:line-clamp-2 ">
                          {name}
                        </DialogTitle>
                        <StatusBadge
                          status={lastAnimal.status}
                          locale={locale}
                          className="shrink-0"
                        />
                      </div>
                      {/* One unit, so a row that wraps takes the whole group
                          of controls to the next line rather than splitting
                          it. shrink-0 so the name is measured against what
                          they leave rather than squeezing them. */}
                      <span className="ms-auto flex shrink-0 items-center gap-1">
                        {previousId && (
                          <Button
                            type="button"
                            data-slot="animal-nav-phone"
                            data-direction="previous"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => onNavigate(previousId)}
                            aria-label={messages.previousAnimal}
                            className={PHONE_NAV_CLASS}
                          >
                            <ChevronLeft className="size-4" aria-hidden />
                          </Button>
                        )}
                        {nextId && (
                          <Button
                            type="button"
                            data-slot="animal-nav-phone"
                            data-direction="next"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => onNavigate(nextId)}
                            aria-label={messages.nextAnimal}
                            className={PHONE_NAV_CLASS}
                          >
                            <ChevronRight className="size-4" aria-hidden />
                          </Button>
                        )}
                        <DialogShareButton
                          path={animalPath(lastAnimal, locale)}
                          name={name}
                          photo={shownPhoto}
                          className={PHONE_SHARE_CLASS}
                        />
                        <DialogPrimitive.Close asChild>
                          <Button
                            data-slot="dialog-close-card"
                            variant="ghost"
                            size="icon-sm"
                            // pointer-coarse:size-11 for the same reason the
                            // share button beside it carries one: on a touch
                            // tablet this is the way out of the dialog, and
                            // icon-sm is 32px. A mouse keeps the 32px row.
                            className="hidden desktop-box:inline-flex pointer-coarse:size-11"
                          >
                            <XIcon aria-hidden />
                            <span className="sr-only">{messages.close}</span>
                          </Button>
                        </DialogPrimitive.Close>
                      </span>
                    </div>
                  </m.div>

                  {/* The species line, in the flow with the facts it belongs
                      to rather than pinned above them. Pulled back up to 8px
                      under the name, because it is the name's second line and
                      not a section: the card's gap-4 and the bar's padding
                      would otherwise put it 28px down (16px on the phone, where
                      the bar has no padding of its own). */}
                  <m.div
                    className="-mt-2 desktop-box:-mt-5"
                    variants={CONTENT_ITEM}
                    transition={transition}
                  >
                    <DialogDescription>{subtitle}</DialogDescription>
                  </m.div>

                  <m.div variants={CONTENT_ITEM} transition={transition}>
                    {/* Keyed, so the health row's expanded state starts over
                        with each animal. */}
                    <AnimalFacts
                      key={lastAnimal.id}
                      animal={lastAnimal}
                      reference={reference}
                    />
                  </m.div>

                  {/* Identity above, action below: the shelter box anchors the
                      bottom of the card with a little extra air over it. */}
                  <m.div
                    className="mt-2"
                    variants={CONTENT_ITEM}
                    transition={transition}
                  >
                    <ShelterBlock
                      animal={lastAnimal}
                      logos={logos}
                      reference={reference}
                      // The sticky bar below repeats this box's button on the
                      // phone, so the box keeps its own for sm and up only.
                      ctaMirrored
                    />
                  </m.div>
                </div>

                {/* Last in the card, though they are drawn at its edges.
                    Placed first, they were what the dialog opened on: Radix
                    focuses the first focusable child, so the dialog announced
                    itself as "Prejšnja žival" and the first Tab step led away
                    from the animal rather than into it. Standing here, the
                    open lands on the front print, or on the phone's close
                    button above it, and the tab order reads photos, title row,
                    facts, shelter, and only then the two steps out of this
                    animal. The phone's sticky CTA is the one thing after them,
                    and it is a link, on a layout where these are hidden.

                    Absolute against the frame around the card rather than
                    against the whole dialog, which is what puts them level
                    with the name whatever the animal's listing runs to. */}
                {/* Each arrow says which list it walks before it is clicked.
                    Drawn half outside the dialog beside a stack of photos
                    that counts itself "1 / 13", a round chevron is the
                    lightbox idiom: a pointer reads it as the next picture and
                    gets a different animal. The label prints the button's own
                    aria-label, so a pointer and a screen reader are told the
                    same thing in the same words.

                    The site's tooltip rather than a label of this dialog's
                    own. Its provider carries the shared 350ms, and an instant
                    label on a control standing this close to the overlay
                    would flash on every pass of the pointer on its way out.
                    Focus opens it with no delay, a touch never opens it at
                    all (Radix ignores a touch pointer, which matters because
                    these arrows are on the tablet too), and the content is
                    portalled, so the card it hangs over cannot clip it.

                    The provider draws no element of its own, so the two
                    buttons are still the last two in the dialog.

                    aria-describedby={undefined} because the label and the
                    name are the one string: described by it, the button is
                    announced as "Prejšnja žival" twice over. Radix spreads
                    the trigger's own props over the attribute it sets, so
                    this drops it and leaves the name to say it once. */}
                <TooltipProvider>
                  {previousId && (
                    <Tooltip>
                      <TooltipTrigger asChild aria-describedby={undefined}>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => onNavigate(previousId)}
                          aria-label={messages.previousAnimal}
                          className={`${ANIMAL_NAV_CLASS} left-0 -translate-x-1/2`}
                        >
                          <ChevronLeft className="size-4" aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={8}>
                        {messages.previousAnimal}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {nextId && (
                    <Tooltip>
                      <TooltipTrigger asChild aria-describedby={undefined}>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => onNavigate(nextId)}
                          aria-label={messages.nextAnimal}
                          className={`${ANIMAL_NAV_CLASS} right-0 translate-x-1/2`}
                        >
                          <ChevronRight className="size-4" aria-hidden />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={8}>
                        {messages.nextAnimal}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TooltipProvider>
              </div>

              {/* The card's own CTA is the last thing in a long scroll on a
                  phone. This mirrors it at the bottom of the screen instead,
                  so the one action that matters is always a thumb-reach away.
                  Hidden from sm up, where the card's own button is already in
                  view without scrolling far.

                  What it is gated on is above; see stickyCta. */}
              {stickyCta && (
                <div
                  data-slot="sticky-cta"
                  className="sticky inset-x-0 bottom-0 z-30 mt-auto border-t bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] desktop-box:hidden"
                >
                  <Button asChild size="sm" className="h-11 w-full">
                    <a
                      href={lastAnimal.source.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {messages.viewOriginalListing}
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                </div>
              )}
            </m.div>
          </LazyMotion>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
