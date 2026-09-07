// @vitest-environment jsdom
import type { ModelViewerElement } from "@google/model-viewer";
import { afterEach, expect, it, vi } from "vitest";
import { createCatAttention } from "./cat-attention";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("smooths gaze, stops after six seconds, and never seeks the main clip", async () => {
  vi.useFakeTimers();
  const viewer = Object.assign(document.createElement("div"), {
    currentTime: 4,
    availableAnimations: ["Gaze left", "Gaze right", "Gaze up", "Gaze down"],
    getCameraOrbit: () => ({ theta: 0 }),
    appendAnimation: vi.fn(), detachAnimation: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
  });
  const attention = createCatAttention(viewer as unknown as ModelViewerElement, () => true);
  expect(attention.start(350, 100)).toBe(true);
  const first = viewer.appendAnimation.mock.calls[0][1].weight;
  await vi.advanceTimersByTimeAsync(200);
  expect(viewer.appendAnimation.mock.calls.some(c => c[1].weight > first)).toBe(true);
  expect(viewer.currentTime).toBe(4);
  await vi.advanceTimersByTimeAsync(6100);
  expect(viewer.detachAnimation).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("stops its layers and timer when motion becomes unavailable", async () => {
  vi.useFakeTimers(); let allowed = true;
  const viewer = Object.assign(document.createElement("div"), {
    availableAnimations: ["Gaze left", "Gaze right", "Gaze up", "Gaze down"],
    getCameraOrbit: () => ({ theta: 0 }), appendAnimation: vi.fn(), detachAnimation: vi.fn(),
  });
  const attention = createCatAttention(viewer as unknown as ModelViewerElement, () => allowed);
  attention.start(50, 50); allowed = false;
  await vi.advanceTimersByTimeAsync(40);
  expect(vi.getTimerCount()).toBe(0);
  expect(viewer.detachAnimation).toHaveBeenCalled();
});

it("does no layout work before dwell and stops resending settled weights", async () => {
  vi.useFakeTimers();
  const bounds = vi.fn(() => ({ left: 0, top: 0, width: 400, height: 400 }));
  const viewer = Object.assign(document.createElement("div"), {
    availableAnimations: ["Gaze left", "Gaze right", "Gaze up", "Gaze down"],
    getCameraOrbit: () => ({ theta: 0 }), appendAnimation: vi.fn(), detachAnimation: vi.fn(),
    getBoundingClientRect: bounds,
  });
  const attention = createCatAttention(viewer as unknown as ModelViewerElement, () => true);
  for (let i = 0; i < 120; i++) attention.update(i, 50);
  expect(bounds).not.toHaveBeenCalled();
  attention.start(350, 100);
  await vi.advanceTimersByTimeAsync(2000);
  const calls = viewer.appendAnimation.mock.calls.length;
  await vi.advanceTimersByTimeAsync(2000);
  expect(viewer.appendAnimation).toHaveBeenCalledTimes(calls);
  expect(bounds).toHaveBeenCalledOnce();
  attention.stop();
});
