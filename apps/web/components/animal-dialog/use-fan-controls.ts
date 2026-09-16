import { useWheelStep } from "@/components/animal-dialog/use-wheel-step";
import { useI18n } from "@/components/i18n-provider";
import { PRINT_ASPECT, type PermittedPhoto } from "@/lib/animal-images";
import {
  MIN_SWIPE_PX,
  SWIPE_DISTANCE_RATIO,
  SWIPE_SPAN_RATIO,
  WHEEL_SETTLE_MS,
  declareAxis,
  releasePointer,
  swipeVerdict,
} from "@/lib/swipe";
import {
  animate,
  motionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { focusHeldOn, frontPrintOf, type FanFocusKind } from "./fan-focus";
import {
  FAN_LIMIT,
  FanTempo,
  fanShapes,
  fanSlots,
  printFactor,
} from "./fan-geometry";
import { FanGeometry } from "./fan-layout";
import { FLICK_TWO_PX_MS } from "./fan-options";

/** One print the stage is holding: which photo, which seat of the window it
 *  stands in, and, for a print mounted mid-walk, the seat it starts from. */
export type FanSlot = { index: number; offset: number; seat?: number };

// A print's key. The photo alone for as long as it keeps its node, and the
// photo and a generation once the fan has had to draw it again as a new one.
function printKey(index: number, generation: number) {
  return generation === 0 ? `${index}` : `${index}.${generation}`;
}

export type FanProps = {
  geometry: FanGeometry;
  images: PermittedPhoto[];
  /** Whose photos these are, for the name the stage announces itself by. */
  name: string;
  activeIndex: number;
  tempo: FanTempo;
  /** The stage element, held above this component so the lightbox can ask the
   *  fan where to hand focus back to. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Whose focus the fan the breakpoint has just replaced was holding, if it
   *  was holding one at all. Held above too, because the swap remounts this
   *  whole component and the answer has to survive it. */
  keptFocusRef: RefObject<FanFocusKind | null>;
  /** The wash's copy of the walk, mounted above the fan. */
  washProgress?: MotionValue<number>;
  /** True while the card's photograph is still travelling into the front seat.
   *  The front print keeps its mount entrance back until this turns false, so
   *  the same photograph is not drawn twice. */
  holdFrontPrint?: boolean;
  onSelect: (index: number) => void;
  onOpenLightbox: (from: DOMRect) => void;
  /** Opens the lightbox on the contact sheet instead of on one photo. */
  onOpenSheet: (from: DOMRect) => void;
};

export function useFanControls({
  images,
  activeIndex,
  tempo,
  washProgress,
  holdFrontPrint,
  stageRef,
  keptFocusRef,
  onSelect,
}: FanProps) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const count = images.length;
  const solo = count === 1;
  const slots = useMemo(
    () => fanSlots(count, activeIndex),
    [count, activeIndex],
  );
  // What the stage is holding, in seat order: the window the fan is seated on.
  const prints: FanSlot[] = slots;

  // Read once per window rather than once per render, and the memo is what
  // makes that true: two tests count the shapes the fan reads to tell a print
  // rendering again from the fan rendering around it, and rebuilding the
  // record on every render reads every photo on stage.
  const shapes = useMemo(() => fanShapes(slots, images), [slots, images]);
  // Handed to the prints as a ref rather than as a prop. Every print reads the
  // whole record to find its seat, and the record is rebuilt at every commit,
  // so as a prop it would re-render all five of them, which is the render this
  // arrangement exists to avoid. A print's transforms re-run whenever its
  // offset or the walk changes, and the commit effect below jumps both, so
  // what they read is always the record of the window they are standing in.
  //
  // Written by that effect, alongside the jumps, and not during the render:
  // until the commit lands, every offset still counts from the old window, and
  // the old record is the one those offsets are right against. A print
  // stepping into the window builds its first pose during the render, before
  // the effect, off the old record and its old-window offset, which agree; the
  // one thing the old record cannot tell it is its own width, so the print
  // hands seatCentre that itself.
  const factors = useRef(shapes);

  // One MotionValue per print on stage, holding how far it stands from the
  // front. Keyed by the photo, so a print keeps the same value for as long as
  // it is on stage and its offset can be re-seated without React hearing about
  // it. Made on the render that first mounts the print and dropped by the
  // commit effect when it leaves.
  //
  // A print that steps into the window is made in the commit's own render,
  // while the walk still reads the step it just took and before the effect
  // below zeroes it. Its pose is offset minus walk, so a seat made at the bare
  // offset would draw it a whole step too close, on top of its neighbour, for
  // the first paint, and the re-seating that follows was measured to miss the
  // print that had only just mounted. Made at offset plus walk instead, it
  // stands where it belongs from its first paint, and the effect's jump to the
  // bare offset with the walk at zero is the same pose again: nothing it shows
  // depends on being told.
  const seats = useRef(new Map<number, MotionValue<number>>());
  function seatOf(index: number, offset: number, at?: number) {
    const held = seats.current.get(index);
    if (held) return held;
    // Where a print being made starts. A print stepping in at a commit is
    // handed the offset of the window it is joining while the walk still reads
    // the step that has just finished, so its seat is that offset plus the
    // walk. A print mounted mid-walk to fill the leading tier is seated in the
    // window that is on stage now and says its own seat, so that it walks in
    // with the prints around it rather than standing still.
    const seat = at ?? offset + progress.get();
    const made = motionValue(seat);
    seats.current.set(index, made);
    // And its shape into the record, at the seat it is standing in. A seat is
    // measured off the outer edge of the seat inside it, so the print that
    // steps in behind this one has to find this one's width to stand anywhere
    // near right. The old record has no entry for either of them: two prints
    // enter together on a two-step walk, and the second one read a blank where
    // its inner neighbour should be and first-painted 45 to 55px off, then
    // re-seated a frame later once the commit effect wrote the new record.
    // The prints render in seat order, so the inner one registers first.
    factors.current[seat] = printFactor(images[index].aspect ?? PRINT_ASPECT);
    return made;
  }

  // How many times a print has had to be drawn again as a different node. A
  // print keeps its node, and with it its seat, for as long as it stays on the
  // same side of the fan.
  const generations = useRef(new Map<number, number>());

  // The keys the fan was holding when it last committed, which is how a print
  // knows whether it is being drawn for the first time. Asked of the last
  // commit rather than of the seats map, so that the answer is the same
  // however many times this render runs: React runs a component twice in
  // development to catch exactly this, and a print that had made its seat in
  // the first pass read as an old print in the second, which is a print
  // switching on at full opacity instead of arriving.
  const shown = useRef(new Set<string>());

  // The key one print is drawn under, and the one decision that can change it.
  //
  // fanSlots walks a window round the whole gallery, and where the window is
  // the whole gallery the trailing print wraps round to the leading side: the
  // same photo, one seat out on the left before the commit and one or two
  // seats out on the right after it. Under one key that is one node whose seat
  // the commit jumps across the stage in a single frame. Measured on the built
  // export at 1280x800: 433px on a gallery of three, 469px on four, 379px on
  // five, which between them are 293 of the 486 animals in the register.
  //
  // A print that wraps is drawn as a different print: a fresh key, so React
  // unmounts the one and mounts the other, and the two cross over as a fade
  // rather than as a jump. The copy that is leaving is frozen where it stands
  // first, because the walk is about to be zeroed under it and its pose is its
  // seat minus that walk; the new node makes its own seat, on the side it is
  // arriving at.
  //
  // Asked of where the print is drawn now against where the commit would put
  // it, which is a question only this render can answer: the commit effect
  // re-seats every print and zeroes the walk, and after that the two readings
  // agree and nothing reads as wrapping. Calling it twice in one render is the
  // same, because the first call takes the seat away.
  //
  // Reduced motion keeps the jump. There is no walk to be out of step with,
  // the whole commit lands in one paint, and a print fading across the stage
  // is motion that was asked not to happen.
  function keyOf(index: number, offset: number) {
    const held = seats.current.get(index);
    const generation = generations.current.get(index) ?? 0;
    if (!held || shouldReduceMotion) return printKey(index, generation);
    const standing = held.get() - progress.get();
    if (Math.abs(standing - offset) <= 0.5) return printKey(index, generation);
    held.jump(standing);
    seats.current.delete(index);
    generations.current.set(index, generation + 1);
    return printKey(index, generation + 1);
  }

  /** Everything the fan has to tell one print about its own arrival: the key
   *  it is drawn under, the seat it stands in, and whether this is its first
   *  render, which is what decides how it is drawn in. */
  function printAt({ index, offset, seat }: FanSlot) {
    const key = keyOf(index, offset);
    return {
      key,
      fresh: !shown.current.has(key),
      seat: seatOf(index, offset, seat),
    };
  }

  // The stage itself. What a mouse drag changes is the cursor and the text
  // selection, twice a gesture, and it is written straight onto the element:
  // as React state a press re-rendered all five prints and rebuilt every
  // MotionValue in them, and the attribute arriving through React invalidated
  // the style of every descendant with it. Between them they were the two
  // longest tasks in the drag's trace, both at the start of the gesture.
  function setDragging(on: boolean) {
    const element = stageRef.current;
    if (!element) return;
    if (on) element.dataset.dragging = "true";
    else delete element.dataset.dragging;
  }

  // Puts the keyboard back on the print in front. Only ever called where it
  // was on a print already, so it never takes focus from anything else.
  function focusFrontPrint() {
    frontPrintOf(stageRef.current)?.focus({ preventScroll: true });
  }

  // Where the keyboard goes when the print it was standing on has left and the
  // visitor never asked for the keyboard in the first place. The stage answers
  // the arrows itself, so the fan keeps working; it draws no ring, so nothing
  // appears that a finger or a mouse did not ask for.
  function focusStage() {
    stageRef.current?.focus({ preventScroll: true });
  }

  // Set at a commit, read once the new window is in the tree. A walk past the
  // second seat takes the print focus was on out of the window and unmounts
  // it, which used to drop focus to the dialog: three arrows in, the fan
  // stopped answering the keyboard and Enter no longer opened the photo on
  // show.
  //
  // Which print was holding it and who was walking the fan, because the two
  // are answered differently. A keyboard user is handed the new front print,
  // and its name is what the step has to say for itself. A pointer is not: the
  // print it pressed is usually still on stage a seat further out, and putting
  // the keyboard on the new front print drew a ring on the photograph after
  // every drag and every swipe.
  //
  // Who is asked of the walk rather than of the print's own :focus-visible.
  // The dialog opens on the front print, which is a script focus and draws no
  // ring; a press on a print that is already focused does not move focus, so
  // the browser never reconsiders, and Chromium answers :focus-visible true
  // for the rest of that focus. Measured on a dialog opened from a link: false
  // at rest and true from the mouse press onwards, so a drag read as a
  // keyboard user every time.
  const refocus = useRef<{ print: HTMLElement; kind: FanFocusKind } | null>(
    null,
  );

  // The two geometries are separate fans and the breakpoint swaps them by
  // remounting (see the key on <Fan>), so a print holding focus goes with the
  // old one. Read on the way out, while the button is still in the document,
  // and answered by the fan that replaces it. A print that was holding a
  // pointer's focus is gone with the fan it belonged to, so there is nothing
  // to leave the keyboard on: the stage takes it and the arrows carry on.
  useLayoutEffect(() => {
    const kept = keptFocusRef.current;
    if (kept) {
      keptFocusRef.current = null;
      if (kept === "keyboard") focusFrontPrint();
      else focusStage();
    }
    return () => {
      keptFocusRef.current = focusHeldOn(stageRef.current)?.kind ?? null;
    };
    // Mount and unmount only: the print in front is where focus lands either
    // way, and nothing this reads is a render's to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which photo the live line at the bottom of the stage names: the one in
  // front, unless the commit that brought it forward handed the keyboard to
  // its print. That move announces the step by name as the print takes focus,
  // and the line changing in the same breath had a screen reader read one
  // press out twice.
  //
  // Held back by naming the front it is being held back for, so it answers for
  // that commit and no other: a photo that changes any other way, in the
  // lightbox or from a shared link, is named the moment the fan is holding it.
  // A second key press carries the same held-back number forward rather than
  // the front it is leaving, or the line would step one photo behind the fan.
  const [withheld, setWithheld] = useState<{
    front: number;
    say: number;
  } | null>(null);
  const spoken =
    withheld?.front === activeIndex ? withheld.say : activeIndex;

  // The cascade belongs to the mount, which is once per animal: the first
  // render reads false, and every render after it is a photo being picked.
  const entered = useRef(false);
  useEffect(() => {
    entered.current = true;
  }, []);

  // Whether this fan mounted with its front print held back, which is the
  // dialog saying the card's photograph is still flying into that seat. Read
  // once, at the mount, because the fade the print still owes is the entrance
  // it did not take then: by the time the hold is lifted the cascade above is
  // over, and without this the print would appear rather than arrive.
  //
  // Reduced motion ignores it. Nothing is flying there, so there is nothing to
  // wait for and nothing to fade.
  const [frontWasHeld] = useState(
    () => Boolean(holdFrontPrint) && !shouldReduceMotion,
  );
  const holdFront = Boolean(holdFrontPrint) && !shouldReduceMotion;

  const progress = useMotionValue(0);
  const snap = useRef<ReturnType<typeof animate> | null>(null);
  // A snap that outlives the fan would keep a frame loop alive. Dropped as
  // well as stopped: a walk stopped past the end of its spring resolves the
  // promise it is waiting on, and what decides whether that promise still
  // commits is this slot. The breakpoint remounts the whole fan, so a commit
  // that ran here would land on the fan that replaced this one.
  useEffect(
    () => () => {
      snap.current?.stop();
      snap.current = null;
    },
    [],
  );

  // The wash reads the same walk, so its light changes while a print is being
  // pulled in rather than after it lands. The jump that commits a step is a
  // change too, so the wash lands with the photos.
  const mirrorWash = useCallback(
    (walked: number) => washProgress?.set(walked),
    [washProgress],
  );
  useMotionValueEvent(progress, "change", mirrorWash);
  // The fan is remounted per animal and per geometry, and a walk the remount
  // interrupted would otherwise leave the shared progress standing where it
  // was abandoned: this fan's own progress starts at zero, and the mirror
  // above only writes on a change, so the wash went on blending against the
  // old walk until the next step. Before the first paint, so the wash never
  // draws the stale value over the new fan.
  useLayoutEffect(() => {
    washProgress?.jump(0);
  }, [washProgress]);

  // The walk commits by re-seating the window and zeroing the progress in the
  // same breath. The zero has to wait for the new window to be in the tree, or
  // one frame would draw the old seats at rest; a layout effect runs between
  // the two paints, which is exactly the gap it must land in.
  //
  // Both halves are jumps here, and nothing moves through either: a print's
  // pose is its offset minus the walk, so the print at offset 1 with the walk
  // at 1 stands at the front, and so does the same print at offset 0 with the
  // walk back at 0. The two jumps land in the same paint, which is what lets
  // the three prints that only change seats sit out the commit entirely.
  //
  // The offsets go first, because the walk is what the prints are measured
  // against. The reduced-motion path commits with no walk to zero and needs
  // the same re-seating.
  const pendingReset = useRef(false);
  useLayoutEffect(() => {
    // The record first, because the jumps below are what make the prints read
    // it, and they have to find the window they are being seated into.
    //
    // A copy of the memo's record rather than the record itself: a print
    // stepping into the window writes its own width in here as it is seated,
    // during the render, and the memo hands the same object back for as long as
    // the window stands.
    factors.current = { ...shapes };
    for (const { index, offset } of slots) {
      seats.current.get(index)?.jump(offset);
    }
    // A print that has left the window takes its seat with it, frozen where it
    // stands on the way out. It is drawn until its fade is over, and both the
    // things its pose is read off are about to move under it: the walk is
    // zeroed a few lines down, and the record above has already been replaced
    // by the new window's. Shifting its seat by the walk it has just taken
    // keeps the two readings the same, in the tier it is standing in and in
    // the widths of the prints between it and the front. Left alone, the print
    // walking off a thirteen-photo gallery's trailing edge moved 55px at the
    // commit, because the print inside it was a portrait before the step and a
    // landscape after it.
    const onStage = new Set(prints.map((print) => print.index));
    for (const [index, seat] of seats.current) {
      if (onStage.has(index)) continue;
      seat.jump(seat.get() - progress.get());
      seats.current.delete(index);
      generations.current.delete(index);
    }
    // The copies the commit has left standing: a print that has walked off the
    // trailing edge, and the one a wrap has drawn again on the other side of
    // the stage. Both are kept in the document while they fade, and neither is
    // one of the fan's seats any anymore, so neither may take a press or a tab
    // or hold the keyboard. Written straight onto the element, the way the
    // drag writes its own flag: React is not rendering these nodes again, and
    // a state that reached them would reach all five prints with it.
    const drawn = new Map(
      prints.map((print) => [
        print.index,
        printKey(print.index, generations.current.get(print.index) ?? 0),
      ]),
    );
    for (const node of stageRef.current?.querySelectorAll<HTMLElement>(
      "button[data-print]",
    ) ?? []) {
      const id = node.dataset.print ?? "";
      if (drawn.get(Number(id.split(".")[0])) === id) continue;
      node.dataset.leaving = "true";
      node.tabIndex = -1;
      node.style.pointerEvents = "none";
    }
    // And what the fan is holding now, for the next commit to tell an arriving
    // print from one that was already standing here.
    shown.current = new Set(drawn.values());
    if (pendingReset.current) {
      pendingReset.current = false;
      progress.jump(0);
    }
    // After the re-seat, so the print it lands on is the one now in front.
    const held = refocus.current;
    if (held) {
      refocus.current = null;
      // A keyboard user is handed the photograph the key brought forward. A
      // pointer keeps whatever it pressed, unless the walk has carried that
      // print off the stage, in which case the stage itself holds the keyboard
      // so the arrows still answer.
      // A print the walk has taken off the stage is still in the document
      // while it fades, and it is no use to the keyboard there: it answers no
      // key and is about to be taken away, which would drop focus to the
      // dialog. Standing means being one of the fan's own prints still.
      const standing =
        held.print.isConnected && held.print.dataset.leaving !== "true";
      if (held.kind === "keyboard") focusFrontPrint();
      else if (!standing) focusStage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prints, shapes, progress]);

  // Where the walk in flight is going, in seats, and 0 once it has landed or
  // while nothing is walking. It outlives the animation on purpose: a press
  // stops the walk so a finger can catch the fan, and if that press turns
  // into nothing the fan has to carry on to where it was going rather than
  // sit where it was caught, with one print at the front and another named
  // by the count. A step taken while a walk is in flight adds to this too.
  //
  // Seats and photos are the same number the whole way round the window, so
  // adding a step to this and reading the photo off the sum is sound however
  // short the gallery is; which of the two the number means only matters
  // where the fan has to travel it.
  const heading = useRef(0);

  // One horizontal trackpad swipe is one photo: the travel accumulates until
  // it crosses the same threshold a drag does, and everything after that
  // belongs to the inertia rather than to a second decision. The gesture is
  // the hook's; the fan supplies its own numbers and what to do with them.
  //
  // Above the walks and the drag rather than beside the other handlers,
  // because every one of them ends the gesture this is holding.
  const attachWheel = useWheelStep({
    enabled: count > 1,
    commitRatio: SWIPE_DISTANCE_RATIO,
    spanRatio: SWIPE_SPAN_RATIO,
    settleMs: WHEEL_SETTLE_MS,
    // Not while a walk is in flight: the wheel writing the same number the
    // spring is animating would have the two fighting over the fan. A swipe
    // that reaches a step still adds one through onStep.
    onTravel: (fraction) => {
      if (shouldReduceMotion || heading.current !== 0) return;
      // A spring back sets no heading, so the guard above cannot see one: a
      // swipe arriving in its tail would be writing the same number the
      // spring is still animating. The gesture takes the fan the way a press
      // does, and for the same reason.
      snap.current?.stop();
      snap.current = null;
      progress.set(clampToOvershoot(fraction));
    },
    onStep: step,
    // A gesture that turned a photo has already handed the fan to the walk.
    // One that did not puts back what it moved, or lets a walk it found in
    // flight finish.
    onSettle: (spent) => {
      if (spent) return;
      if (heading.current !== 0) settleWalk();
      else springBack();
    },
  });

  // Walks the fan `delta` seats and then commits `target` as the new front.
  // Also the reduced-motion path, where the walk is skipped and the commit is
  // instant.
  //
  // The target is a photo and not a callback, because whether the fan is going
  // anywhere at all is what decides how the walk is put away. A walk that
  // lands back on the photo it started from re-seats nothing: the slots come
  // out the same, React bails out of the identical state update, and the
  // layout effect that zeroes the walk never runs. The fan was then left
  // holding a walk of two with nothing at its front. Landing has to put the
  // progress back itself in that case, and only a real change of front may
  // wait for the commit, or a frame paints the old seats at rest.
  function walkTo(delta: number, target: number, by: FanFocusKind = "pointer") {
    snap.current?.stop();
    // A trackpad swipe still in its settle window has the fan too, and the
    // walk is now what moves it: left alone, the window closing mid-walk
    // would put back a travel this walk has taken over, or add a second photo
    // to it. A step the wheel itself commits comes through here and is not
    // one of those, which the hook tells apart for itself.
    attachWheel.cancel();
    heading.current = delta;
    const reseats = target !== activeIndex;
    const land = () => {
      heading.current = 0;
      if (!reseats) {
        progress.jump(0);
        return;
      }
      const held = focusHeldOn(stageRef.current);
      refocus.current = held ? { print: held.print, kind: by } : null;
      // A walk that hands the keyboard over announces itself by the name of
      // the print it lands on. Every other walk moves no focus at all, and the
      // live line is the only thing that says the photo changed.
      // Written here rather than at the commit, so it arrives in the same
      // render as the new front and the line never says the wrong thing for a
      // frame. Setting it to null when it already is one is a state update
      // React drops, so an ordinary step costs no render for this.
      setWithheld(
        held && by === "keyboard" ? { front: target, say: spoken } : null,
      );
      pendingReset.current = true;
      onSelect(target);
    };
    if (shouldReduceMotion) {
      land();
      return;
    }
    const run = animate(progress, delta, tempo.spring);
    snap.current = run;
    run.then(() => {
      // A superseded walk must not also commit: only the one still holding
      // the slot gets to.
      if (snap.current !== run) return;
      land();
    });
  }

  // The latest walk, for the callback the prints hold. That callback has to
  // be the same function from render to render or the prints could not be
  // memoised, and walkTo is not: it closes over the tempo and the reduced
  // motion setting. So the prints are handed a function that never changes
  // and reads the current walk out of here when it is pressed.
  const latestWalk = useRef(walkTo);
  useLayoutEffect(() => {
    latestWalk.current = walkTo;
  });

  // One callback for all five prints, rather than a closure per seat: which
  // print was pressed, where it stands and whose press it was are what the
  // print itself knows, so it says all three and this stays the same function
  // from render to render.
  //
  // A press is where :focus-visible is worth asking: Enter on a print and a
  // click on it arrive here as the same event, and a press that moves focus to
  // the print is one the browser has just had to make its mind up about.
  const selectPhoto = useCallback(
    (index: number, offset: number, by: FanFocusKind) => {
      latestWalk.current(offset, index, by);
    },
    [],
  );

  // As far as a print can be walked from: the window holds two seats either
  // side of the front, and there is nothing further out to travel from.
  function clampWalk(delta: number) {
    return Math.max(-2, Math.min(2, delta));
  }

  // How far the fan walks to bring `target` to the front, when the caller was
  // going to travel `away` seats to reach it.
  //
  // The two are not the same number on a short gallery, which is what used to
  // snap the prints into place at the commit: fanSlots keeps a pair of photos
  // on their numbered sides, so stepping right from the second of two walks
  // left, and a walk of two on a gallery of three or four seats its target at
  // -1 while the fan walks +2 through seats that do not exist. The seat the
  // photo is actually standing in is what the fan has to travel, so it is
  // looked up rather than assumed. A photo outside the window has no seat and
  // falls back to what the caller asked for.
  function walkFor(target: number, away: number) {
    return slots.find((slot) => slot.index === target)?.offset ?? away;
  }

  // Walks `delta` photos on from the front the window is seated on. A delta
  // that nets to nothing, and a short gallery where the walk wraps back onto
  // the photo already in front, are both the fan going back to where it stood.
  function walkBy(delta: number, by: FanFocusKind = "pointer") {
    const clamped = clampWalk(delta);
    const target = (activeIndex + clamped + count) % count;
    if (clamped === 0 || target === activeIndex) {
      springBack();
      return;
    }
    walkTo(walkFor(target, clamped), target, by);
  }

  // Two quick presses are two photos: a step taken while a walk is in flight
  // adds to where it is going rather than replacing it, which used to lose
  // the second press.
  //
  // Unless the two together only wrap back onto the photo the walk in flight
  // is leaving, which is what a second arrow the same way is on a gallery of
  // two. Walking two seats to arrive where the fan is already going reads as
  // the fan breaking, so the press is dropped and the walk in flight lands;
  // the next press starts from there. A press that nets to zero is a different
  // thing, the cancel walkBy answers with a spring back, and it goes through.
  function step(direction: -1 | 1, by: FanFocusKind = "pointer") {
    if (count < 2) return;
    const next = clampWalk(heading.current + direction);
    if (next !== 0 && (activeIndex + next + count) % count === activeIndex) {
      return;
    }
    walkBy(next, by);
  }

  // What a press that turned into nothing hands back. A walk it caught goes
  // on to where it was going; a drag let go short of anywhere, or a fan that
  // was caught between seats with no destination left, goes to the nearest
  // seat, which for anything under half a step is where it stood.
  function settleWalk() {
    if (heading.current !== 0) {
      walkBy(heading.current);
      return;
    }
    const at = progress.get();
    if (at === 0) return;
    walkBy(Math.round(at));
  }

  // Where Home and End land. The longest gallery in the register runs to
  // fourteen photos, which is a long walk one arrow at a time, and the card
  // gallery answers both keys already.
  //
  // The fan walks rather than jumps, because the walk is what says the stack
  // moved. A photo the window is holding is walked the offset it stands at, so
  // it travels to the front from where it was standing. A photo outside the
  // window has no seat to travel from, so the fan takes one step the short way
  // round and commits straight to it: the stack still moves, and it moves the
  // way the photo lies.
  function walkToIndex(target: number, by: FanFocusKind = "pointer") {
    if (target === activeIndex) return;
    const forward = (target - activeIndex + count) % count;
    walkTo(walkFor(target, 2 * forward <= count ? 1 : -1), target, by);
  }

  // Not far, not fast: the fan goes back to where it stood.
  function springBack() {
    heading.current = 0;
    // The other half of what walkTo drops, for the walk that turned out to be
    // no walk at all. A settle window left open here has nothing to catch it:
    // this spring sets no heading, so the window would find the fan at rest
    // and spring it back a second time from wherever the tail had left it.
    attachWheel.cancel();
    if (shouldReduceMotion) return;
    snap.current?.stop();
    snap.current = animate(progress, 0, tempo.spring);
  }

  function clampToOvershoot(value: number) {
    return Math.max(-tempo.overshoot, Math.min(tempo.overshoot, value));
  }

  // The swipe's own state. A single slot: the fan walks one step per
  // gesture, so there is nothing for a second finger to do but be ignored.
  const swipeStart = useRef<{
    x: number;
    y: number;
    time: number;
    width: number;
    pointerId: number;
    mouse: boolean;
  } | null>(null);
  const swipeAxis = useRef<"x" | "y" | null>(null);
  // A gesture that committed to the horizontal is the fan's, whether or not
  // it went far enough to turn the page. The click the browser still fires at
  // whatever photo the pointer ended on must not also select or open it.
  const suppressTap = useRef(false);

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    suppressTap.current = false;
    if (count < 2) return;
    // Only the primary button drags. A right or middle press opens a menu or
    // starts an autoscroll, neither of which ends with a pointerup the fan
    // will see, so the gesture it began would never be put down.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A second finger has nothing to do. A mouse has no second pointer, so a
    // start still held here is a press that was released off the stage before
    // the drag declared its axis and took the capture: stale, and overwritten.
    if (swipeStart.current && !swipeStart.current.mouse) return;
    snap.current?.stop();
    snap.current = null;
    // And the wheel's own gesture with it. A trackpad swipe hands the fan a
    // settle window that outlives the swipe by a quarter of a second, and a
    // drag started inside it used to find that window closing under the
    // finger: the fan sprang back to nothing while the drag was writing every
    // frame, and the release read a walk that was no longer the finger's.
    attachWheel.cancel();
    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      width: event.currentTarget.clientWidth || 1,
      pointerId: event.pointerId,
      mouse: event.pointerType === "mouse",
    };
    swipeAxis.current = null;
    if (event.pointerType === "mouse") setDragging(true);
  }

  // Every one of these three answers only to the pointer that started the
  // gesture. A second finger on the stage sends its own moves and its own
  // release through the same handlers, and measured from the first finger's
  // origin they walked or ended a gesture that was not theirs.
  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (swipeAxis.current === null) {
      // The vertical belongs to the dialog, whose scroll and dismiss gesture
      // both ask for vertical dominance and so can never claim the gesture
      // this fan takes.
      swipeAxis.current = declareAxis(dx, dy);
      // Still short of the slop, so it could yet turn out to be a tap.
      if (swipeAxis.current === null) return;
      // The finger has the fan now, and where a caught walk was going is no
      // longer anyone's business but the finger's.
      if (swipeAxis.current === "x") heading.current = 0;
      // The capture waits for the axis, and only a mouse ever gets one. Taken
      // on the press it would retarget the click the browser fires afterwards
      // to this stage, and a plain click on a photo would never reach the
      // photo. By the time a gesture has declared itself horizontal it is no
      // longer a click, its tap is suppressed below either way, and the
      // capture is what keeps the drag alive once the cursor leaves the stage.
      //
      // Touch never gets one, on purpose. A touch pointer is implicitly
      // captured to the photo it pressed and those events bubble through this
      // stage; an explicit capture would fight the dialog's dismiss gesture
      // over the same pointer, and whoever called last would win.
      if (start.mouse && swipeAxis.current === "x") {
        // Optional call: jsdom has no pointer capture, and a drag that cannot
        // be captured still works, it just stops tracking a cursor that leaves.
        event.currentTarget.setPointerCapture?.(start.pointerId);
      }
    }
    if (swipeAxis.current !== "x" || shouldReduceMotion) return;
    // The fan under the pointer, live. Dragging left pulls the next photo in,
    // which is the fan walking forward.
    progress.set(clampToOvershoot(-dx / (start.width * SWIPE_SPAN_RATIO)));
  }

  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const axis = swipeAxis.current;
    releasePointer(event.currentTarget, start.pointerId);
    swipeStart.current = null;
    swipeAxis.current = null;
    setDragging(false);
    // A press that never became a drag: a tap, a click on a print, or a hand
    // that caught the fan and let it go. Whatever it stopped carries on.
    if (axis !== "x") {
      settleWalk();
      return;
    }
    suppressTap.current = true;

    const dx = event.clientX - start.x;
    const elapsed = Math.max(1, event.timeStamp - start.time);
    const verdict = swipeVerdict({ dx, elapsed, width: start.width });
    if (verdict === 0) {
      springBack();
      return;
    }
    // A hard flick carries two photos, so a long set can be got through
    // without one gesture per picture. The verdict above has already said the
    // gesture commits and which way; how hard it was thrown is the fan's own
    // question, and nothing else asks it. See FLICK_TWO_PX_MS.
    const two =
      count > FAN_LIMIT &&
      Math.abs(dx) / elapsed > FLICK_TWO_PX_MS &&
      Math.abs(dx) > MIN_SWIPE_PX;
    if (two) {
      // Not through step: a flick replaces where the fan was going rather
      // than adding to it, and the axis already cleared the heading.
      walkBy(2 * verdict);
      return;
    }
    step(verdict);
  }

  // A cancelled pointer is not a decision, and it ends with no click to
  // suppress. The fan settles the same way it does after a press that went
  // nowhere: a caught walk carries on, a drag goes to the nearest seat.
  function cancelSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || event.pointerId !== start.pointerId) return;
    releasePointer(event.currentTarget, start.pointerId);
    swipeStart.current = null;
    swipeAxis.current = null;
    suppressTap.current = false;
    setDragging(false);
    settleWalk();
  }

  // A mouse press that leaves the stage before its axis is known has no
  // capture to bring its release back: the pointerup lands wherever the
  // cursor is by then, and the press stood here with data-dragging on and a
  // caught walk parked between seats until the next gesture. The leave is
  // that release. A drag that declared itself horizontal holds the capture
  // and never leaves, and a finger is implicitly captured to the print it
  // pressed, so neither arrives here mid-gesture.
  function leaveSwipe(event: PointerEvent<HTMLDivElement>) {
    if (swipeAxis.current === "x") return;
    cancelSwipe(event);
  }

  function swallowSwipedTap(event: MouseEvent<HTMLDivElement>) {
    if (!suppressTap.current) return;
    suppressTap.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // The element has two owners: the wheel hook attaches its own non-passive
  // listener to it as it arrives, and the drag writes data-dragging on it.
  // Stable, or React would take the listener down and put it back up on every
  // render. The hook's cleanup is handed back rather than dropped: without it
  // React falls back to calling this with null, which the hook ignores, and
  // the settle timer of a swipe still in its tail outlived the fan and turned
  // a photo on the one mounted after it.
  const stage = useCallback(
    (element: HTMLDivElement | null) => {
      stageRef.current = element;
      const detach = attachWheel(element);
      return () => {
        detach?.();
        stageRef.current = null;
      };
    },
    [attachWheel, stageRef],
  );

  function resetSuppressedTap() {
    suppressTap.current = false;
  }

  return {
    messages,
    t,
    shouldReduceMotion,
    count,
    solo,
    prints,
    printAt,
    spoken,
    frontWasHeld,
    holdFront,
    factors,
    seatOf,
    entered,
    progress,
    selectPhoto,
    step,
    walkToIndex,
    resetSuppressedTap,
    startSwipe,
    moveSwipe,
    endSwipe,
    cancelSwipe,
    leaveSwipe,
    swallowSwipedTap,
    stage,
  };
}
