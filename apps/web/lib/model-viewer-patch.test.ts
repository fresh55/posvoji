// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Exercise the installed dependency, not the viewer mock used by controller
// tests. No model downloads or WebGL context are needed for these regressions.
let Viewer: typeof import("@google/model-viewer").ModelViewerElement;
let ModelScene: typeof import("@google/model-viewer/lib/three-components/ModelScene.js").ModelScene;
let controlsKey: symbol;
let sceneKey: symbol;

beforeAll(async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn() })));
  ({ ModelViewerElement: Viewer } = await import("@google/model-viewer/lib/model-viewer.js"));
  ({ ModelScene } = await import("@google/model-viewer/lib/three-components/ModelScene.js"));
  ({ $controls: controlsKey } = await import("@google/model-viewer/lib/features/controls.js"));
  ({ $scene: sceneKey } = await import("@google/model-viewer/lib/model-viewer-base.js"));
});

afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

describe("model-viewer dependency patch", () => {
  it.each([1, 2, Infinity, 0])("preserves playback and validates repetitions=%s", (repetitions) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const clip = { duration: 3 };
    const action = { time: 0, timeScale: 1, isRunning: () => false, setLoop: vi.fn(), play: vi.fn() };
    const scene = {
      currentGLTF: {}, element: { animationName: "Companion", [sceneKey]: { appendedAnimations: [] } },
      animations: [clip], animationsByName: new Map([["Head pet", clip]]),
      parseFadeValue: () => ({ shouldFade: false, duration: 0 }),
      mixers: [{ existingAction: () => action }], _models: [], appendedAnimations: [],
    };
    ModelScene.prototype.appendAnimation.call(scene as unknown as InstanceType<typeof ModelScene>, "Head pet", undefined, repetitions);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(repetitions === 0 ? 1 : 0);
    expect(action.setLoop.mock.calls[0][1]).toBe(repetitions === 0 ? 1 : repetitions);
    expect(action.play).toHaveBeenCalledOnce();
  });

  it("settles camera changes once after the current update without requesting another render", async () => {
    let finish!: (value: boolean) => void;
    const complete = new Promise<boolean>(resolve => { finish = resolve; });
    const cameraJump = vi.fn(), sceneJump = vi.fn(), changed = vi.fn();
    const viewer = new Proxy({
      updateComplete: complete, requestUpdate: vi.fn(),
      [controlsKey]: { jumpToGoal: cameraJump }, [sceneKey]: { jumpToGoal: sceneJump },
    }, {
      get(target, key, receiver) {
        if (typeof key === "symbol" && key.description === "onChange") return changed;
        return Reflect.get(target, key, receiver);
      },
    });
    const jump = () => Viewer.prototype.jumpCameraToGoal.call(viewer as unknown as InstanceType<typeof Viewer>);
    jump(); jump(); jump();
    expect(cameraJump).not.toHaveBeenCalled();
    expect(viewer.requestUpdate).not.toHaveBeenCalled();
    finish(true);
    await complete;
    expect(cameraJump).toHaveBeenCalledOnce();
    expect(sceneJump).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    jump();
    await Promise.resolve();
    expect(cameraJump).toHaveBeenCalledTimes(2);
  });
});
