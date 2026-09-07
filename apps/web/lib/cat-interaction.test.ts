// @vitest-environment jsdom

import type { ModelViewerElement } from "@google/model-viewer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCatInteraction } from "./cat-interaction";

function makeViewer() {
  let name = "Companion";
  const times = new Map<string, number>([[name, 4]]);
  const element = Object.assign(document.createElement("div"), {
    animationName: "Companion",
    animationCrossfadeDuration: 0,
    currentTime: 4,
    duration: 3.5,
    updateComplete: Promise.resolve(true),
    availableAnimations: ["Companion", "Notice", "Slow blink", "Paw hello", "Nuzzle"],
    positionAndNormalFromPoint: vi.fn<(...point: number[]) => object | null>(() => ({})),
    materialFromPoint: vi.fn<(...point: number[]) => { name: string } | null>(() => ({ name: "White coat" })),
    play: vi.fn(),
    pause: vi.fn(),
    appendAnimation: vi.fn((clip: string, options: { time: number }) => times.set(clip, options.time)),
    detachAnimation: vi.fn(),
  });
  Object.defineProperties(element, {
    animationName: { configurable: true, get: () => name, set: (value: string) => { name = value; } },
    currentTime: { configurable: true, get: () => times.get(name) ?? 0, set: (value: number) => { times.set(name, value); } },
  });
  return element;
}

let viewer: ReturnType<typeof makeViewer>;
let controller: ReturnType<typeof createCatInteraction>;
let allowed: boolean;

function pointer(type: string, values: Record<string, number | string> = {}) {
  viewer.dispatchEvent(Object.assign(new Event(type), {
    pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 50, clientY: 50, ...values,
  }));
}
function tap() {
  pointer("pointerdown");
  pointer("pointerup");
}
async function finish() {
  viewer.currentTime = viewer.duration;
  viewer.dispatchEvent(new Event("finished"));
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(.9999);
  allowed = true;
  viewer = makeViewer();
  controller = createCatInteraction(viewer as unknown as ModelViewerElement, () => allowed);
});
afterEach(() => {
  controller.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("cat reactions", () => {
  it("does no mesh picking during an orbit drag and only one for a head tap", async () => {
    viewer.availableAnimations.push("Head pet");
    viewer.materialFromPoint.mockReturnValue({ name: "Head touch region" });
    pointer("pointerdown");
    expect(viewer.materialFromPoint).not.toHaveBeenCalled();
    pointer("pointermove", { clientX: 90, buttons: 1 });
    pointer("pointerup", { clientX: 90 });
    expect(viewer.materialFromPoint).not.toHaveBeenCalled();
    tap(); await Promise.resolve();
    expect(viewer.materialFromPoint).toHaveBeenCalledOnce();
    expect(viewer.positionAndNormalFromPoint).not.toHaveBeenCalled();
    expect(viewer.animationName).toBe("Head pet");
  });

  it("counts a queued back touch once when washing finishes", async () => {
    viewer.availableAnimations.push("Back pet", "Back warning");
    viewer.materialFromPoint.mockReturnValue({ name: "Back touch region" });
    viewer.currentTime = 8; tap();
    viewer.currentTime = 14; await vi.advanceTimersByTimeAsync(100);
    expect(viewer.animationName).toBe("Back pet");
    tap(); await finish();
    expect(viewer.animationName).toBe("Back pet");
  });

  it("recovers after release outside the viewer or window blur during a hold", async () => {
    viewer.availableAnimations.push("Head pet");
    viewer.materialFromPoint.mockReturnValue({ name: "Head touch region" });
    Object.assign(viewer, { cameraControls: true });
    pointer("pointerdown");
    window.dispatchEvent(Object.assign(new Event("pointerup"), { pointerId: 1 }));
    tap(); await Promise.resolve(); expect(viewer.animationName).toBe("Head pet");
    await finish(); pointer("pointerdown"); await vi.advanceTimersByTimeAsync(450);
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(false);
    window.dispatchEvent(new Event("blur"));
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(true);
    pointer("pointerup"); expect(viewer.animationName).toBe("Companion");
  });

  it("drops a two-finger contact without poisoning the next single tap", async () => {
    viewer.availableAnimations.push("Head pet");
    viewer.materialFromPoint.mockReturnValue({ name: "Head touch region" });
    pointer("pointerdown"); pointer("pointerdown", { pointerId: 2 });
    pointer("pointerup", { pointerId: 2 }); pointer("pointerup");
    expect(viewer.animationName).toBe("Companion");
    tap(); await Promise.resolve(); expect(viewer.animationName).toBe("Head pet");
  });

  const affection = ["Head pet", "Chin scratch", "Back pet", "Back warning", "Drowse", "Sleep", "Wake"];

  it("reserves a held head stroke but leaves an immediate drag for orbiting", async () => {
    viewer.availableAnimations.push(...affection);
    Object.assign(viewer, { cameraControls: true });
    viewer.materialFromPoint.mockReturnValue({ name: "Head touch region" });
    pointer("pointerdown");
    pointer("pointermove", { clientX: 70, buttons: 1 });
    await vi.advanceTimersByTimeAsync(450);
    pointer("pointerup", { clientX: 70 });
    expect(viewer.animationName).toBe("Companion");
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(true);
    pointer("pointerdown");
    await vi.advanceTimersByTimeAsync(450);
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(false);
    pointer("pointermove", { clientX: 85, buttons: 1 });
    pointer("pointerup", { clientX: 85 });
    await Promise.resolve();
    expect(viewer.animationName).toBe("Head pet");
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(true);
  });

  it("restores camera controls when an affectionate hold is cancelled", async () => {
    viewer.availableAnimations.push(...affection);
    Object.assign(viewer, { cameraControls: true });
    viewer.materialFromPoint.mockReturnValue({ name: "Chin touch region" });
    pointer("pointerdown");
    await vi.advanceTimersByTimeAsync(450);
    pointer("pointercancel");
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(true);
    expect(viewer.animationName).toBe("Companion");
  });

  it("escalates the queued back response and calms after affection or a break", async () => {
    viewer.availableAnimations.push(...affection);
    viewer.materialFromPoint.mockReturnValue({ name: "Back touch region" });
    tap(); await Promise.resolve(); viewer.currentTime = .8;
    tap(); tap(); tap();
    expect(viewer.currentTime).toBe(.8);
    await finish(); expect(viewer.animationName).toBe("Back warning");
    viewer.materialFromPoint.mockReturnValue({ name: "Chin touch region" });
    tap(); await finish(); expect(viewer.animationName).toBe("Chin scratch");
    await finish();
    viewer.materialFromPoint.mockReturnValue({ name: "Back touch region" });
    tap(); await Promise.resolve(); expect(viewer.animationName).toBe("Back pet");
    await finish(); await vi.advanceTimersByTimeAsync(9000);
    tap(); await Promise.resolve(); expect(viewer.animationName).toBe("Back pet");
  });

  it("drowses after inactivity, loops sleep and wakes before answering a touch", async () => {
    viewer.availableAnimations.push(...affection);
    controller.syncPlayback();
    await vi.advanceTimersByTimeAsync(45000);
    expect(viewer.animationName).toBe("Drowse");
    await finish(); expect(viewer.animationName).toBe("Sleep");
    viewer.materialFromPoint.mockReturnValue({ name: "Head touch region" });
    tap(); await Promise.resolve(); expect(viewer.animationName).toBe("Wake");
    await finish(); expect(viewer.animationName).toBe("Head pet");
    await finish(); expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(0);
  });

  it("finishes drowsing before waking for a queued touch", async () => {
    viewer.availableAnimations.push(...affection);
    controller.syncPlayback(); await vi.advanceTimersByTimeAsync(45000);
    viewer.currentTime = .8; tap();
    expect(viewer.animationName).toBe("Drowse"); expect(viewer.currentTime).toBe(.8);
    await finish(); expect(viewer.animationName).toBe("Wake");
  });

  it("postpones sleep during activity and cancels timers when hidden", async () => {
    viewer.availableAnimations.push(...affection);
    controller.syncPlayback(); await vi.advanceTimersByTimeAsync(40000);
    pointer("pointermove"); await vi.advanceTimersByTimeAsync(6000);
    expect(viewer.animationName).not.toBe("Drowse");
    allowed = false; controller.syncPlayback();
    await vi.advanceTimersByTimeAsync(60000);
    expect(viewer.animationName).not.toBe("Drowse");
    expect(vi.getTimerCount()).toBe(0);
  });

  const newClips = ["Head rub", "Sniff", "Face wash", "Stretch", "Yawn", "Playful reach left", "Playful reach right"];

  it("uses the touched material for back and tail responses, irrespective of screen position", async () => {
    viewer.availableAnimations.push("Back pet", "Tail flick");
    viewer.materialFromPoint.mockReturnValue({ name: "Back touch region" });
    tap();
    await Promise.resolve();
    expect(viewer.animationName).toBe("Back pet");
    viewer.currentTime = .8;
    viewer.materialFromPoint.mockReturnValue({ name: "Tail touch region" });
    for (let i = 0; i < 5; i++) tap();
    expect(viewer.animationName).toBe("Back pet");
    expect(viewer.currentTime).toBe(.8);
    await finish();
    expect(viewer.animationName).toBe("Tail flick");
    await finish();
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(4);
  });

  it("replays a queued touch on the same region only after its response has finished", async () => {
    viewer.availableAnimations.push("Tail flick");
    viewer.materialFromPoint.mockReturnValue({ name: "Tail touch region" });
    tap();
    await Promise.resolve();
    viewer.currentTime = .9;
    tap(); tap();
    expect(viewer.currentTime).toBe(.9);
    await finish();
    expect(viewer.animationName).toBe("Tail flick");
    expect(viewer.currentTime).toBe(0);
    await finish();
    expect(viewer.animationName).toBe("Companion");
  });

  it("rejects a blank or dragged anatomical touch", () => {
    viewer.availableAnimations.push("Back pet");
    viewer.materialFromPoint.mockReturnValue(null);
    tap();
    expect(viewer.animationName).toBe("Companion");
    viewer.materialFromPoint.mockReturnValue({ name: "Back touch region" });
    pointer("pointerdown");
    pointer("pointermove", { clientX: 80, buttons: 1 });
    pointer("pointerup", { clientX: 80 });
    expect(viewer.animationName).toBe("Companion");
  });

  it("offers back and tail touches on focused B/T keys while ignoring held or modified shortcuts", async () => {
    viewer.availableAnimations.push("Back pet", "Tail flick");
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "t", repeat: true }));
    expect(viewer.animationName).toBe("Companion");
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "B" }));
    await Promise.resolve();
    expect(viewer.animationName).toBe("Back pet");
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
    await finish();
    expect(viewer.animationName).toBe("Tail flick");
  });

  it("offers every gesture before cycling, without consecutive repeats between bags", async () => {
    viewer.availableAnimations.push(...newClips);
    const played: string[] = [];
    for (let i = 0; i < 20; i++) {
      tap();
      await Promise.resolve();
      played.push(viewer.animationName.replace(/ (left|right)$/, ""));
      await finish();
    }
    expect(new Set(played.slice(0, 10)).size).toBe(10);
    expect(new Set(played.slice(10)).size).toBe(10);
    expect(played.every((name, i) => !i || name !== played[i - 1])).toBe(true);
    expect(played).toEqual(expect.arrayContaining(["Head rub", "Sniff", "Face wash", "Stretch", "Yawn", "Playful reach"]));
  });

  it("varies the order with randomness instead of a fixed cycle", async () => {
    viewer.availableAnimations.push(...newClips);
    vi.mocked(Math.random).mockReturnValue(0);
    tap();
    await Promise.resolve();
    expect(viewer.animationName).toBe("Paw hello");
  });

  it("uses the touched model side for a reach, including a queued request", async () => {
    viewer.availableAnimations = ["Companion", "Sniff", "Playful reach left", "Playful reach right"];
    tap();
    await Promise.resolve();
    expect(viewer.animationName).toBe("Sniff");
    viewer.positionAndNormalFromPoint.mockReturnValue({ position: { x: -.1 } });
    tap();
    await finish();
    expect(viewer.animationName).toBe("Playful reach right");
    await finish();
    tap();
    await Promise.resolve();
    viewer.positionAndNormalFromPoint.mockReturnValue({ position: { x: 0 } });
    tap();
    await finish();
    expect(viewer.animationName).toBe("Playful reach left");
  });

  it("offers a sniff on hover without interrupting a face wash", async () => {
    viewer.availableAnimations.push(...newClips);
    pointer("pointermove");
    await vi.advanceTimersByTimeAsync(220);
    expect(viewer.animationName).toBe("Sniff");
    await finish();
    viewer.availableAnimations = ["Companion", "Face wash", "Sniff"];
    tap();
    await Promise.resolve();
    expect(viewer.animationName).toBe("Face wash");
    viewer.currentTime = 1;
    pointer("pointerleave");
    pointer("pointermove");
    await vi.advanceTimersByTimeAsync(220);
    expect(viewer.animationName).toBe("Face wash");
    expect(viewer.currentTime).toBe(1);
  });
  it("plays a tap once, then resumes the original idle time without resetting the grooming schedule", async () => {
    tap();
    await Promise.resolve();
    expect(viewer.animationName).toBe("Slow blink");
    expect(viewer.currentTime).toBe(0);
    expect(viewer.play).toHaveBeenLastCalledWith({ repetitions: 1, pingpong: false });
    await finish();
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(4);
    expect(viewer.play).toHaveBeenLastCalledWith({ repetitions: Infinity, pingpong: false });
    tap();
    expect(viewer.animationName).toBe("Paw hello");
  });

  it("does not turn a drag, long press, cancellation or second contact into a tap", () => {
    pointer("pointerdown");
    pointer("pointermove", { clientX: 80, buttons: 1 });
    pointer("pointerup");
    pointer("pointerdown");
    vi.advanceTimersByTime(800);
    pointer("pointerup");
    pointer("pointerdown");
    pointer("pointercancel");
    pointer("pointerup");
    pointer("pointerdown");
    pointer("pointerdown", { pointerId: 2 });
    pointer("pointerup", { pointerId: 2 });
    pointer("pointerup");
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.play).not.toHaveBeenCalled();
  });

  it("requires a hit on the cat rather than the surrounding stage", () => {
    viewer.positionAndNormalFromPoint.mockReturnValue(null);
    tap();
    pointer("pointermove");
    vi.advanceTimersByTime(700);
    expect(viewer.animationName).toBe("Companion");
  });

  it("reacts to a mouse dwell only once per visit and ignores touch hover", async () => {
    pointer("pointermove", { pointerType: "touch" });
    vi.advanceTimersByTime(700);
    expect(viewer.animationName).toBe("Companion");
    pointer("pointermove");
    vi.advanceTimersByTime(219);
    expect(viewer.animationName).toBe("Companion");
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(viewer.animationName).toBe("Notice");
    await finish();
    pointer("pointermove");
    vi.advanceTimersByTime(700);
    expect(viewer.animationName).toBe("Companion");
    pointer("pointerleave");
    pointer("pointermove");
    vi.advanceTimersByTime(700);
    expect(viewer.animationName).toBe("Notice");
  });

  it("cancels the hover invitation when the pointer leaves", () => {
    pointer("pointermove");
    pointer("pointerleave");
    vi.advanceTimersByTime(700);
    expect(viewer.animationName).toBe("Companion");
  });

  it("lets grooming finish before responding, then resumes at that boundary", async () => {
    viewer.currentTime = 9;
    tap();
    tap();
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(9);
    viewer.currentTime = 13.5;
    await vi.advanceTimersByTimeAsync(100);
    expect(viewer.animationName).toBe("Slow blink");
    await finish();
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(13.5);
  });

  it("lets the automatic paw gesture finish without resetting it", async () => {
    viewer.currentTime = 21;
    tap();
    await vi.advanceTimersByTimeAsync(100);
    expect(viewer.currentTime).toBe(21);
    expect(viewer.animationName).toBe("Companion");
    viewer.currentTime = 22.6;
    await vi.advanceTimersByTimeAsync(100);
    expect(viewer.animationName).toBe("Slow blink");
  });

  it("pauses a reaction offscreen and resumes it as a single play", async () => {
    tap();
    await Promise.resolve();
    viewer.currentTime = 1.2;
    allowed = false;
    controller.syncPlayback();
    expect(viewer.pause).toHaveBeenCalledOnce();
    allowed = true;
    controller.syncPlayback();
    expect(viewer.currentTime).toBe(1.2);
    expect(viewer.play).toHaveBeenLastCalledWith({ repetitions: 1, pingpong: false });
  });

  it("returns to idle even when the renderer omits its finished event", async () => {
    tap();
    await Promise.resolve();
    viewer.currentTime = 3.5;
    await vi.advanceTimersByTimeAsync(100);
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(4);
  });

  it("keeps the playing reaction's time and coalesces repeated clicks into one follow-up", async () => {
    tap();
    await Promise.resolve();
    expect(viewer.animationName).toBe("Slow blink");
    viewer.currentTime = .2;
    for (let i = 0; i < 10; i++) tap();
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(viewer.animationName).toBe("Slow blink");
    expect(viewer.currentTime).toBe(.2);
    expect(viewer.play).toHaveBeenCalledTimes(1);
    await finish();
    expect(viewer.animationName).toBe("Paw hello");
    await finish();
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(4);
  });

  it("ignores input under reduced motion without starting a delayed reaction later", () => {
    allowed = false;
    controller.syncPlayback();
    tap();
    viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    allowed = true;
    viewer.currentTime = 0;
    controller.syncPlayback();
    expect(viewer.animationName).toBe("Companion");
  });

  it("does not replace a reaction while its clip selection is awaiting the renderer", async () => {
    let ready!: (value: boolean) => void;
    viewer.updateComplete = new Promise<boolean>(resolve => { ready = resolve; });
    tap();
    tap();
    expect(viewer.animationName).toBe("Slow blink");
    ready(true);
    await Promise.resolve();
    expect(viewer.play).toHaveBeenCalledTimes(1);
    expect(viewer.currentTime).toBe(0);
    await finish();
    expect(viewer.animationName).toBe("Paw hello");
    await finish();
    expect(viewer.currentTime).toBe(4);
  });

  it("ignores a stale finished event after starting the follow-up", async () => {
    tap();
    await Promise.resolve();
    tap();
    await finish();
    viewer.currentTime = .1;
    viewer.dispatchEvent(new Event("finished"));
    expect(viewer.animationName).toBe("Paw hello");
  });

  it("starts the single follow-up even if the renderer omits its finished event", async () => {
    tap();
    await Promise.resolve();
    tap();
    viewer.currentTime = viewer.duration;
    await vi.advanceTimersByTimeAsync(100);
    expect(viewer.animationName).toBe("Paw hello");
    viewer.currentTime = viewer.duration;
    await vi.advanceTimersByTimeAsync(100);
    expect(viewer.animationName).toBe("Companion");
    expect(viewer.currentTime).toBe(4);
  });

  it("drops a pending follow-up when hidden while preserving the current reaction", async () => {
    tap();
    await Promise.resolve();
    viewer.currentTime = 1;
    tap();
    allowed = false;
    controller.syncPlayback();
    allowed = true;
    controller.syncPlayback();
    expect(viewer.animationName).toBe("Slow blink");
    expect(viewer.currentTime).toBe(1);
    await finish();
    expect(viewer.animationName).toBe("Companion");
  });

  it("notices a fresh visit after the pointer settles outside the mesh", async () => {
    pointer("pointermove");
    await vi.advanceTimersByTimeAsync(220);
    await finish();
    viewer.positionAndNormalFromPoint.mockReturnValue(null);
    pointer("pointermove");
    await vi.advanceTimersByTimeAsync(220);
    viewer.positionAndNormalFromPoint.mockReturnValue({});
    pointer("pointermove");
    await vi.advanceTimersByTimeAsync(220);
    expect(viewer.animationName).toBe("Notice");
  });

  it("performs one hit test after movement settles, not one per pointer event", async () => {
    for (let i = 0; i < 120; i++) {
      pointer("pointermove", { clientX: i });
      vi.advanceTimersByTime(8);
    }
    expect(viewer.positionAndNormalFromPoint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(220);
    expect(viewer.positionAndNormalFromPoint).toHaveBeenCalledOnce();
    for (let i = 0; i < 120; i++) pointer("pointermove");
    await vi.advanceTimersByTimeAsync(300);
    expect(viewer.positionAndNormalFromPoint).toHaveBeenCalledOnce();
  });

  it("blends an incoming action without seeking the outgoing pose or shared clock", async () => {
    const seek = vi.spyOn(viewer, "currentTime", "set");
    tap();
    await Promise.resolve();
    expect(seek).not.toHaveBeenCalled();
    expect(viewer.appendAnimation).toHaveBeenCalledWith("Slow blink", { time: 0, fade: .22, repetitions: 1 });
    expect(viewer.detachAnimation).toHaveBeenLastCalledWith("Companion", { fade: .22 });
    await finish();
    expect(viewer.appendAnimation).toHaveBeenLastCalledWith("Companion", { time: 4, fade: .22, repetitions: Infinity });
    expect(seek).toHaveBeenCalledTimes(1); // Only the test's simulated end time.
  });

  it("offers the same blink on Enter/Space while leaving rotation keys alone", async () => {
    const arrow = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });
    viewer.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false);
    const space = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    viewer.dispatchEvent(space);
    await Promise.resolve();
    expect(space.defaultPrevented).toBe(true);
    expect(viewer.animationName).toBe("Slow blink");
  });

  it("never starts an awaited reaction after the component has been removed", async () => {
    tap();
    controller.dispose();
    await Promise.resolve();
    expect(viewer.play).not.toHaveBeenCalled();
    pointer("pointermove");
    vi.advanceTimersByTime(1000);
    expect(viewer.play).not.toHaveBeenCalled();
  });

  it("releases a reserved camera, all timers and window listeners on disposal", async () => {
    viewer.availableAnimations.push("Head pet", "Drowse", "Sleep", "Wake");
    viewer.materialFromPoint.mockReturnValue({ name: "Head touch region" });
    Object.assign(viewer, { cameraControls: true });
    controller.syncPlayback();
    pointer("pointerdown"); await vi.advanceTimersByTimeAsync(450);
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(false);
    const remove = vi.spyOn(window, "removeEventListener");
    controller.dispose();
    expect((viewer as unknown as ModelViewerElement).cameraControls).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    for (const name of ["pointerup", "pointercancel", "blur"]) expect(remove).toHaveBeenCalledWith(name, expect.any(Function));
    expect(viewer.pause).toHaveBeenCalled();
  });
});
