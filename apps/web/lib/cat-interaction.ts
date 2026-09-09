import type { ModelViewerElement } from "@google/model-viewer";
import { createCatAttention } from "./cat-attention";

export type CatReaction = "Notice" | "Slow blink" | "Paw hello" | "Nuzzle" | "Head rub" |
  "Sniff" | "Face wash" | "Stretch" | "Yawn" | "Playful reach left" | "Playful reach right" |
  "Back pet" | "Tail flick" | "Head pet" | "Chin scratch" | "Back warning" | "Drowse" | "Wake";
type Gesture = Exclude<CatReaction, "Playful reach left" | "Playful reach right"> | "Playful reach";
type TouchRegion = "back" | "tail" | "head" | "chin";
type TapRequest = { side?: "left" | "right"; region?: TouchRegion; stronger?: boolean };
const regionReactions: Record<TouchRegion, CatReaction> = { back: "Back pet", tail: "Tail flick", head: "Head pet", chin: "Chin scratch" };
const regionOf = (materialName: string | undefined): TouchRegion | undefined =>
  materialName === "Back touch region" ? "back" : materialName === "Tail touch region" ? "tail" :
    materialName === "Head touch region" ? "head" : materialName === "Chin touch region" ? "chin" : undefined;
const tapGestures: Gesture[] = ["Slow blink", "Paw hello", "Nuzzle", "Head rub", "Sniff",
  "Face wash", "Stretch", "Yawn", "Playful reach", "Notice"];
// The authored rig's sagittal plane after its export transform, in metres.
const MODEL_MIDLINE_X = -.074;
const gestureOf = (name: CatReaction): Gesture => name.startsWith("Playful reach") ? "Playful reach" : name as Gesture;

/** Small authored reactions, using only model-viewer's public animation API. */
export function createCatInteraction(viewer: ModelViewerElement, canAnimate: () => boolean) {
  let disposed = false;
  let reaction: CatReaction | null = null;
  let switching = false;
  let generation = 0;
  let resumeTime = 0;
  let gestureBag: Gesture[] = [];
  let lastGesture: Gesture | null = null;
  let pendingTap: TapRequest | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let completionTimer: ReturnType<typeof setTimeout> | undefined;
  let noticedThisVisit = false;
  let pointer: { id: number; x: number; y: number; time: number; dragged: boolean; stroking?: boolean; region?: TouchRegion; material?: string | null } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let cameraBeforeStroke: boolean | undefined;
  let sleepState: "awake" | "drowsing" | "asleep" | "waking" = "awake";
  let lastActivity = performance.now();
  let lastBackTouch = -Infinity;
  let backTouches = 0;
  const contacts = new Set<number>();
  const attention = createCatAttention(viewer, () => canAnimate() && !disposed && !reaction && !switching && !routineBusy() && sleepState === "awake" && !contacts.size);
  const releaseStroke = () => {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    if (cameraBeforeStroke !== undefined) viewer.cameraControls = cameraBeforeStroke;
    cameraBeforeStroke = undefined;
  };
  const scheduleIdle = () => {
    if (idleTimer || disposed || !canAnimate() || sleepState !== "awake" ||
      !["Drowse", "Sleep", "Wake"].every(name => viewer.availableAnimations.includes(name))) return;
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      if (disposed || !canAnimate() || sleepState !== "awake") return;
      if (performance.now() - lastActivity < 45000) { scheduleIdle(); return; }
      if (reaction || switching || pendingTap || routineBusy() || contacts.size) { scheduleIdle(); return; }
      sleepState = "drowsing";
      startReaction("Drowse");
    }, Math.max(2000, 45000 - (performance.now() - lastActivity)));
  };
  const activity = () => { lastActivity = performance.now(); scheduleIdle(); };

  const clearHover = () => {
    clearTimeout(hoverTimer);
    hoverTimer = undefined;
  };
  const hitCat = (x: number, y: number) => viewer.positionAndNormalFromPoint(x, y) !== null;
  // Revision 10's authored wash and paw lift should reach their resting pose.
  const routineBusy = () => sleepState === "awake" && !reaction && (
    (viewer.currentTime >= 6 && viewer.currentTime < 13.5) ||
    (viewer.currentTime >= 20 && viewer.currentTime < 22.6)
  );
  const clearCompletion = () => {
    clearTimeout(completionTimer);
    completionTimer = undefined;
  };
  const watchCompletion = () => {
    if (completionTimer || disposed || switching || !canAnimate() || (!reaction && !pendingTap)) return;
    // model-viewer 4.3 can lose mixer events when its model is loaded. Watch
    // public clip time only while a response is active or one tap is pending.
    completionTimer = setTimeout(() => {
      completionTimer = undefined;
      if (disposed || !canAnimate() || switching) return;
      if (reaction && viewer.duration > 0 && viewer.currentTime >= viewer.duration - .01) onFinished();
      else if (!reaction && pendingTap && !routineBusy()) {
        const request = pendingTap;
        pendingTap = null;
        // This request was already counted when it arrived. Replaying the
        // input handler would count a back touch twice and escalate too soon.
        startTapReaction(request);
      }
      watchCompletion();
    }, 100);
  };
  const syncPlayback = () => {
    if (disposed) return;
    if (canAnimate()) {
      if (!switching) {
        if (reaction && viewer.duration > 0 && viewer.currentTime >= viewer.duration - .01) {
          onFinished();
          return;
        }
        viewer.play({ repetitions: reaction ? 1 : Infinity, pingpong: false });
        watchCompletion();
        scheduleIdle();
      }
    } else {
      clearHover();
      clearCompletion();
      clearTimeout(idleTimer);
      idleTimer = undefined;
      attention.stop(true);
      releaseStroke();
      lastActivity = performance.now();
      pendingTap = null;
      pointer = null;
      contacts.clear();
      viewer.pause();
    }
  };

  const changeClip = async (name: string, time: number) => {
    attention.stop();
    const version = ++generation;
    switching = true;
    const outgoing = viewer.animationName;
    if (outgoing === name) {
      // A queued touch may repeat the same anatomical response, but only after
      // it finishes. Its identical endpoints allow a restart without a jump.
      viewer.currentTime = time;
      switching = false;
      syncPlayback();
      return;
    }
    const fade = viewer.animationCrossfadeDuration / 1000;
    // currentTime seeks the entire mixer, including the outgoing pose. Prepare
    // only the incoming action through the public blending API instead. Stop
    // its cached action first to clear the previous play's loop count.
    viewer.detachAnimation(name, { fade: false });
    viewer.appendAnimation(name, { time, fade, repetitions: name === "Companion" || name === "Sleep" ? Infinity : 1 });
    viewer.animationName = name;
    await viewer.updateComplete;
    if (disposed || generation !== version) return;
    if (outgoing) viewer.detachAnimation(outgoing, { fade });
    switching = false;
    syncPlayback();
  };

  const startReaction = (name: CatReaction) => {
    if (disposed || !canAnimate() || !viewer.availableAnimations.includes(name)) return;
    clearHover();
    clearCompletion();
    noticedThisVisit = true;
    // A follow-up keeps the original place in Companion across the whole
    // interaction, instead of resuming at the end of the previous reaction.
    if (!reaction) resumeTime = viewer.currentTime;
    reaction = name;
    lastGesture = gestureOf(name);
    void changeClip(name, 0);
  };
  const variants = (gesture: Gesture): CatReaction[] => (gesture === "Playful reach"
    ? ["Playful reach left", "Playful reach right"] as CatReaction[] : [gesture])
    .filter(name => viewer.availableAnimations.includes(name));
  const startTapReaction = (request: TapRequest) => {
    const targeted = request.stronger && viewer.availableAnimations.includes("Back warning") ? "Back warning" : request.region && regionReactions[request.region];
    if (targeted && viewer.availableAnimations.includes(targeted)) {
      startReaction(targeted);
      return true;
    }
    const choices = tapGestures.filter(name => variants(name).length);
    if (!choices.length) return false;
    // A shuffled bag gives every gesture a turn, without predictable cycling
    // or counting the two reaching directions as two different reactions.
    gestureBag = gestureBag.filter(name => choices.includes(name));
    if (!gestureBag.length) {
      gestureBag = [...choices];
      for (let i = gestureBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gestureBag[i], gestureBag[j]] = [gestureBag[j], gestureBag[i]];
      }
    }
    if (gestureBag[0] === lastGesture && choices.length > 1) {
      const alternative = gestureBag.findIndex(name => name !== lastGesture);
      if (alternative > 0) [gestureBag[0], gestureBag[alternative]] = [gestureBag[alternative], gestureBag[0]];
      else {
        // Hover may have just played the bag's final gesture. Skip that
        // duplicate and start a fresh bag on the next invitation.
        gestureBag = [choices.find(name => name !== lastGesture)!];
      }
    }
    const gesture = gestureBag.shift()!;
    const clips = variants(gesture);
    const preferred = gesture === "Playful reach"
      ? `Playful reach ${request.side ?? (Math.random() < .5 ? "left" : "right")}` : gesture;
    const name = clips.find(name => name === preferred) ?? clips[0];
    startReaction(name);
    return true;
  };
  const respondToTap = (request: TapRequest = {}) => {
    if (disposed || !canAnimate()) return;
    activity();
    if (request.region === "back") {
      backTouches = performance.now() - lastBackTouch < 8000 ? backTouches + 1 : 1;
      lastBackTouch = performance.now();
      request = { ...request, stronger: backTouches >= 3 };
    } else if (request.region === "head" || request.region === "chin") backTouches = 0;
    clearHover();
    attention.stop();
    if (sleepState === "asleep") {
      pendingTap = request;
      sleepState = "waking";
      startReaction("Wake");
      return;
    }
    if (reaction || switching || routineBusy()) {
      // Coalesce a burst into one follow-up; never seek the playing clip.
      pendingTap = request;
      watchCompletion();
      return;
    }
    startTapReaction(request);
  };
  const onFinished = () => {
    if (!reaction || switching || disposed || !canAnimate() || viewer.currentTime < viewer.duration - .01) return;
    clearCompletion();
    if (reaction === "Drowse") {
      if (pendingTap) {
        sleepState = "waking";
        startReaction("Wake");
      } else {
        reaction = null;
        sleepState = "asleep";
        void changeClip("Sleep", 0);
      }
      return;
    }
    if (reaction === "Wake") { sleepState = "awake"; resumeTime = 0; activity(); }
    if (pendingTap) {
      const request = pendingTap;
      pendingTap = null;
      if (startTapReaction(request)) return;
    }
    reaction = null;
    void changeClip("Companion", resumeTime);
  };
  const onPointerDown = (event: PointerEvent) => {
    activity();
    attention.stop();
    releaseStroke();
    clearHover();
    contacts.add(event.pointerId);
    if (contacts.size !== 1 || event.button !== 0) {
      pointer = null;
      return;
    }
    // Defer the expensive skinned-mesh pick until a tap is released or a
    // stationary hold is established. Ordinary orbit/scroll drags do no picks.
    pointer = canAnimate()
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), dragged: false }
      : null;
    if (pointer) {
      const press = pointer;
      holdTimer = setTimeout(() => {
        if (pointer !== press || press.dragged || contacts.size !== 1 || !canAnimate()) return;
        press.material = viewer.materialFromPoint(press.x, press.y)?.name ?? null;
        press.region = regionOf(press.material ?? undefined);
        if (press.region !== "head" && press.region !== "chin") return;
        press.stroking = true;
        cameraBeforeStroke = viewer.cameraControls;
        viewer.cameraControls = false;
      }, 420);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    activity();
    if (pointer && event.pointerId === pointer.id && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > (pointer.stroking ? 100 : 8)) {
      pointer.dragged = true;
      releaseStroke();
    }
    if (event.pointerType !== "mouse" || event.buttons || contacts.size || !canAnimate()) return;
    attention.update(event.clientX, event.clientY);
    if (sleepState !== "awake") return;
    if (reaction || switching || pendingTap || routineBusy()) {
      clearHover();
      return;
    }
    // Raycasting this skinned mesh costs a frame on some devices. Test once
    // after the pointer settles, never on each movement or during a reaction.
    clearHover();
    hoverTimer = setTimeout(() => {
      hoverTimer = undefined;
      if (disposed || !canAnimate() || reaction || switching || pendingTap || routineBusy()) return;
      if (!hitCat(event.clientX, event.clientY)) {
        noticedThisVisit = false;
        return;
      }
      if (!noticedThisVisit) {
        if (attention.start(event.clientX, event.clientY)) { noticedThisVisit = true; return; }
        const preferred: CatReaction = lastGesture === "Sniff" ? "Notice" : "Sniff";
        startReaction(viewer.availableAnimations.includes(preferred) ? preferred : "Notice");
      }
    }, 220);
  };
  const onPointerUp = (event: PointerEvent) => {
    const press = pointer;
    releaseStroke();
    contacts.delete(event.pointerId);
    pointer = null;
    if (!canAnimate() || !press || press.id !== event.pointerId || press.dragged || contacts.size ||
      performance.now() - press.time > (press.stroking ? 5000 : 700) || Math.hypot(event.clientX - press.x, event.clientY - press.y) > (press.stroking ? 100 : 8)) return;
    const material = press.material === undefined ? viewer.materialFromPoint(event.clientX, event.clientY)?.name : press.material;
    if (!material) return;
    const region = press.region ?? regionOf(material);
    if (region) { respondToTap({ region }); return; }
    // Only an unlabelled body touch needs the second lookup for a model-space
    // left/right reaching direction. Labelled head/chin/back/tail taps need one.
    const hit = viewer.positionAndNormalFromPoint(event.clientX, event.clientY);
    if (hit) {
      // Hit positions are in the model's coordinates, so the choice remains
      // tied to the touched side when the visitor rotates the camera.
      const x = hit.position?.x;
      respondToTap({ side: x === undefined ? undefined : x >= MODEL_MIDLINE_X ? "left" : "right", region: press.region });
    }
  };
  const cancelPointer = (event: PointerEvent) => {
    releaseStroke();
    contacts.delete(event.pointerId);
    pointer = null;
    clearHover();
  };
  const onPointerLeave = () => {
    releaseStroke();
    attention.stop();
    clearHover();
    noticedThisVisit = false;
    // Leaving the stage while dragging must never become a tap on return.
    if (pointer) pointer.dragged = true;
  };
  const cancelContacts = () => {
    releaseStroke();
    pointer = null;
    contacts.clear();
    clearHover();
    attention.stop();
  };
  const onOutsideRelease = (event: PointerEvent) => {
    if (contacts.has(event.pointerId) && !event.composedPath().includes(viewer)) cancelPointer(event);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    activity();
    const shortcuts: Record<string, TouchRegion> = { b: "back", t: "tail", h: "head", c: "chin" };
    if (!event.altKey && !event.ctrlKey && !event.metaKey && canAnimate() &&
      shortcuts[event.key.toLowerCase()]) {
      event.preventDefault();
      if (!event.repeat) respondToTap({ region: shortcuts[event.key.toLowerCase()] });
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && canAnimate()) {
      event.preventDefault();
      if (!event.repeat) respondToTap();
    }
  };

  viewer.animationCrossfadeDuration = 220;
  viewer.addEventListener("finished", onFinished);
  viewer.addEventListener("pointerdown", onPointerDown);
  viewer.addEventListener("pointermove", onPointerMove);
  viewer.addEventListener("pointerup", onPointerUp);
  viewer.addEventListener("pointercancel", cancelPointer);
  viewer.addEventListener("lostpointercapture", cancelPointer);
  viewer.addEventListener("pointerleave", onPointerLeave);
  viewer.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointerup", onOutsideRelease);
  window.addEventListener("pointercancel", onOutsideRelease);
  window.addEventListener("blur", cancelContacts);

  return {
    syncPlayback,
    /** A reaction the page asks for, as a tap would. Ignored while the cat is
     *  busy or asleep, so it can never interrupt a routine mid-clip. */
    react(name: CatReaction) {
      if (sleepState !== "awake" || reaction || switching || pendingTap || routineBusy()) return false;
      startReaction(name);
      activity();
      return reaction === name;
    },
    dispose() {
      disposed = true;
      generation++;
      clearHover();
      clearCompletion();
      clearTimeout(idleTimer);
      idleTimer = undefined;
      releaseStroke();
      attention.stop(true);
      viewer.pause();
      viewer.removeEventListener("finished", onFinished);
      viewer.removeEventListener("pointerdown", onPointerDown);
      viewer.removeEventListener("pointermove", onPointerMove);
      viewer.removeEventListener("pointerup", onPointerUp);
      viewer.removeEventListener("pointercancel", cancelPointer);
      viewer.removeEventListener("lostpointercapture", cancelPointer);
      viewer.removeEventListener("pointerleave", onPointerLeave);
      viewer.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerup", onOutsideRelease);
      window.removeEventListener("pointercancel", onOutsideRelease);
      window.removeEventListener("blur", cancelContacts);
    },
  };
}
