import type { ModelViewerElement } from "@google/model-viewer";

const directions = ["left", "right", "up", "down"] as const;
const names = [...directions.map(direction => `Gaze ${direction}`), "Ear left", "Ear right", "Curious tilt left", "Curious tilt right"];

/** Brief, bounded head/eye tracking through public animation layers. No raycasts. */
export function createCatAttention(viewer: ModelViewerElement, allowed: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let until = 0;
  let point = { x: 0, y: 0 };
  let pixels = { x: 0, y: 0 };
  let dirty = false;
  let previousTick = 0;
  let started = 0;
  const weights = names.map(() => 0);
  const sent = names.map(() => 0);
  const attached = new Set<string>();
  const stop = (immediate = false) => {
    clearTimeout(timer);
    timer = undefined;
    until = 0;
    for (const name of attached) viewer.detachAnimation(name, { fade: immediate ? false : .2 });
    attached.clear();
    weights.fill(0);
    sent.fill(0);
  };
  const update = (x: number, y: number) => {
    pixels = { x, y };
    dirty = true;
  };
  const normalizePoint = () => {
    const r = viewer.getBoundingClientRect();
    point = {
      x: Math.max(-1, Math.min(1, (pixels.x - r.left) / Math.max(r.width, 1) * 2 - 1)),
      y: Math.max(-1, Math.min(1, (pixels.y - r.top) / Math.max(r.height, 1) * 2 - 1)),
    };
    dirty = false;
  };
  const tick = () => {
    if (!allowed()) { stop(true); return; }
    const now = performance.now();
    if (now >= until) { stop(); return; }
    if (dirty) normalizePoint();
    const ease = 1 - Math.exp(-Math.min(now - previousTick, 100) / 170);
    previousTick = now;
    // Only follow while the visitor can see his face, never twist toward
    // someone behind him. Orbit rotation remains completely independent.
    const front = Math.max(0, Math.cos(viewer.getCameraOrbit().theta));
    const earFirst = viewer.availableAnimations.includes("Ear left") && viewer.availableAnimations.includes("Ear right");
    const head = !earFirst || now - started >= 260 ? 1 : 0;
    const left = Math.max(0, -point.x), right = Math.max(0, point.x);
    const target = [left * head, right * head, Math.max(0, -point.y) * head, Math.max(0, point.y) * head,
      point.x <= 0 ? .65 : 0, point.x > 0 ? .65 : 0, left * head * .35, right * head * .35];
    names.forEach((name, i) => {
      if (!viewer.availableAnimations.includes(name)) return;
      weights[i] += (target[i] * front - weights[i]) * ease;
      if (weights[i] < .002 && attached.has(name)) {
        viewer.detachAnimation(name, { fade: false });
        attached.delete(name);
        sent[i] = 0;
      } else if (weights[i] > .002 && Math.abs(weights[i] - sent[i]) > .002) {
        viewer.appendAnimation(name, { weight: weights[i], timeScale: 0, time: 0 });
        attached.add(name);
        sent[i] = weights[i];
      }
    });
    timer = setTimeout(tick, 33);
  };
  return {
    update,
    start(x: number, y: number) {
      if (!directions.every(d => viewer.availableAnimations.includes(`Gaze ${d}`))) return false;
      stop();
      // Clear cached fade-out state before reusing a frozen pose layer.
      for (const name of names) if (viewer.availableAnimations.includes(name)) viewer.detachAnimation(name, { fade: false });
      update(x, y); started = performance.now(); until = started + 6000; previousTick = started - 33; tick();
      return true;
    },
    stop,
  };
}
