import type { ModelViewerElement } from "@google/model-viewer";

const directions = ["left", "right", "up", "down"] as const;

/** Brief, bounded head/eye tracking through public animation layers. No raycasts. */
export function createCatAttention(viewer: ModelViewerElement, allowed: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let until = 0;
  let point = { x: 0, y: 0 };
  let pixels = { x: 0, y: 0 };
  let dirty = false;
  let previousTick = 0;
  const weights = [0, 0, 0, 0];
  const sent = [0, 0, 0, 0];
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
    const target = [Math.max(0, -point.x), Math.max(0, point.x), Math.max(0, -point.y), Math.max(0, point.y)];
    directions.forEach((direction, i) => {
      weights[i] += (target[i] * front - weights[i]) * ease;
      const name = `Gaze ${direction}`;
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
      for (const direction of directions) viewer.detachAnimation(`Gaze ${direction}`, { fade: false });
      update(x, y); until = performance.now() + 6000; previousTick = performance.now() - 33; tick();
      return true;
    },
    stop,
  };
}
