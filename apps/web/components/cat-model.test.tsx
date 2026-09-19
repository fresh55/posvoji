// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatModel } from "./cat-model";
import { renderToStaticMarkup } from "react-dom/server";

// The picking chunk, and when the stage asks for it. The export is read once
// per import, at the moment the chunk has landed, so counting the reads dates
// the arrival of 153,890 bytes, about 51KB gzipped, that must not compete with
// the model. The builds are counted apart from them: the chunk lands while the
// model is still on the wire, and a picker can only be built once there is a
// cat to pick.
const runtime = vi.hoisted(() => ({
  reads: 0,
  builds: 0,
  picker: { pick: vi.fn(() => null), dispose: vi.fn() },
}));
vi.mock("@/lib/cat-viewer-runtime", () => ({
  get createViewerCatPicker() {
    runtime.reads += 1;
    return () => {
      runtime.builds += 1;
      return runtime.picker;
    };
  },
}));

// Whether the renderer's chunk arrives at all. Reading the export is what
// start() does, so a getter that throws is a chunk that evaluated and gave the
// stage nothing, which is the failure the visitor sees as a still picture.
const viewerModule = vi.hoisted(() => ({ fails: false }));

vi.mock("@google/model-viewer", () => {
  class MockViewer extends HTMLElement {
    // Enough of the animation API for the controller to start one reaction.
    availableAnimations: string[] = ["Companion", "Notice"];
    animationName: string | undefined;
    animationCrossfadeDuration = 0;
    duration = 0;
    paused = true;
    currentTime = 0;
    cameraControls = true;
    updateComplete = Promise.resolve(true);
    play = vi.fn(() => { this.paused = false; });
    pause = vi.fn(() => { this.paused = true; });
    appendAnimation = vi.fn();
    detachAnimation = vi.fn();
  }
  if (!customElements.get("model-viewer")) {
    customElements.define("model-viewer", MockViewer);
  }
  return {
    get ModelViewerElement() {
      if (viewerModule.fails) throw new Error("the renderer's chunk is unusable");
      return MockViewer;
    },
  };
});

type Viewer = HTMLElement & {
  paused: boolean;
  currentTime: number;
  animationName?: string;
  availableAnimations: string[];
};
let intersect: (visible: boolean) => void;
let disconnect: ReturnType<typeof vi.fn>;
let media: EventTarget & { matches: boolean };

beforeEach(() => {
  runtime.reads = 0;
  runtime.builds = 0;
  viewerModule.fails = false;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) {
      intersect = (visible) => callback(
        [{ isIntersecting: visible } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    observe = vi.fn();
    disconnect = disconnect;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Mounts the viewer and loads it, with a chance to prepare it in between. */
async function loadViewer(before?: (viewer: Viewer) => void, reveal = true) {
  act(() => intersect(true));
  await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
  const viewer = document.querySelector("model-viewer") as unknown as Viewer;
  before?.(viewer);
  fireEvent(viewer, new Event("load"));
  if (reveal) finishReveal(viewer);
  return viewer;
}

// jsdom has no TransitionEvent constructor, so name the property explicitly.
const endTransition = (element: Element, propertyName: string) => fireEvent(
  element, Object.assign(new Event("transitionend", { bubbles: true }), { propertyName }),
);
const finishReveal = (viewer: Viewer) => endTransition(viewer.parentElement!, "opacity");

// The stage's label, and the two ways a visitor reaches for the poster. The
// assertions stay in each test; only the reaching is shared.
const shown = () => screen.getByRole("status").className.includes("opacity-100");
// What the stage has asked the browser to download, in the order it asked.
const hints = () => [...document.head.querySelectorAll('link[rel="preload"]')]
  .map(link => link.getAttribute("href"));
const reachFor = () => fireEvent.pointerEnter(screen.getByRole("img"));
const touchPoster = () => fireEvent.pointerDown(screen.getByRole("img"));

describe("the cat model", () => {
  it("asks for the model and the decoder as it starts, not before", async () => {
    render(<CatModel sizes="100vw" locale="en" startOnReach />);
    await act(async () => intersect(true));
    // On screen and waiting for a reach, so it has asked for nothing: a hint
    // here is 632KB on a page whose first seconds belong to something else,
    // and the picking chunk is another 51KB behind it.
    expect(hints()).toEqual([]);
    expect(runtime.reads).toBe(0);

    reachFor();
    // In the same tick as the chunk import, rather than after the chunk has
    // evaluated and the element exists, which is when the viewer would ask.
    expect(hints()).toEqual([
      expect.stringContaining("cat.glb"),
      expect.stringContaining("meshopt-decoder.js"),
    ]);
    const model = document.head.querySelector('link[href*="cat.glb"]')!;
    // The viewer loads the model through three's FileLoader, a fetch in cors
    // mode with same-origin credentials. Without the matching credentials the
    // browser keeps the preload and downloads the model a second time.
    expect(model.getAttribute("as")).toBe("fetch");
    expect(model.getAttribute("crossorigin")).toBe("anonymous");
    // Behind the poster, which is what a visitor sees first on every page
    // that shows him and is the largest paint on the gate.
    expect(model.getAttribute("fetchpriority")).toBe("low");
    // The decoder arrives on a plain async script, which has no credentials.
    const decoder = document.head.querySelector('link[href*="meshopt-decoder"]')!;
    expect(decoder.getAttribute("as")).toBe("script");
    expect(decoder.getAttribute("crossorigin")).toBeNull();
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
  });

  it("asks for nothing while the tab is hidden", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<CatModel sizes="100vw" locale="en" />);
    await act(async () => intersect(true));
    expect(hints()).toEqual([]);
    expect(runtime.reads).toBe(0);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    expect(hints()).toHaveLength(2);
  });

  it("takes its preloads with it when the stage leaves the page", async () => {
    const { unmount } = render(<CatModel sizes="100vw" locale="en" />);
    await loadViewer();
    expect(hints()).toHaveLength(2);
    unmount();
    expect(hints()).toEqual([]);
  });

  it("asks for the picking chunk once the renderer's has landed, and builds on the cat", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    act(() => intersect(true));
    // Not alongside the model and the renderer: those two go out in this tick
    // and this chunk would be taking bandwidth from the model's start.
    expect(hints()).toHaveLength(2);
    expect(runtime.reads).toBe(0);

    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
    // The renderer's chunk has evaluated, so this one rides the tail of the
    // model's download. Nothing is built from it yet: there is nothing to
    // pick on a cat who has not arrived, and until he has the controller
    // picks through the viewer's own API.
    await waitFor(() => expect(runtime.reads).toBe(1));
    expect(runtime.builds).toBe(0);

    const viewer = document.querySelector("model-viewer") as unknown as Viewer;
    fireEvent(viewer, new Event("load"));
    await waitFor(() => expect(runtime.builds).toBe(1));
  });

  it("builds no picker for a stage that left while the chunks were in flight", async () => {
    const { unmount } = render(<CatModel sizes="100vw" locale="en" />);
    act(() => intersect(true));
    unmount();
    await act(async () => {});
    // The renderer's chunk resolved onto a disposed stage, so neither the
    // element nor the picking chunk behind it is anything this stage can
    // still use, and a picker built on it would outlive the viewer it holds.
    expect(document.querySelector("model-viewer")).toBeNull();
    expect(runtime.reads).toBe(0);
    expect(runtime.builds).toBe(0);
  });

  it("stops downloading him when the renderer's chunk cannot be used", async () => {
    viewerModule.fails = true;
    render(<CatModel sizes="100vw" locale="en" />);
    act(() => intersect(true));
    expect(hints()).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("unavailable"));
    // Half a megabyte nothing is left to read: the links download the model
    // on their own, so a stage that has already failed takes them back.
    expect(hints()).toEqual([]);
    expect(document.querySelector("model-viewer")).toBeNull();
  });

  it("defers 3D setup in a hidden tab until the visible page needs it", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<CatModel sizes="100vw" locale="en" />);
    await act(async () => intersect(true));
    expect(document.querySelector("model-viewer")).toBeNull();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
  });

  it("postpones WebGL setup if the cat leaves view while the module loads", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    await act(async () => { intersect(true); intersect(false); });
    expect(document.querySelector("model-viewer")).toBeNull();
    await loadViewer();
    expect(document.querySelector("model-viewer")).not.toBeNull();
  });

  it("waits for a reach before fetching him where the page asks it to", async () => {
    render(<CatModel sizes="100vw" locale="en" startOnReach />);
    await act(async () => intersect(true));
    // On screen from the first paint and still not downloaded. Decoding him
    // holds the main thread for the better part of a second, and on an entry
    // page that second belongs to whatever the visitor came for.
    expect(document.querySelector("model-viewer")).toBeNull();
    reachFor();
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
  });

  it("holds a gated stage back until it is both reached for and on screen", async () => {
    render(<CatModel sizes="100vw" locale="en" startOnReach />);
    reachFor();
    await act(async () => {});
    expect(document.querySelector("model-viewer")).toBeNull();
    await act(async () => intersect(true));
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
  });

  it("takes a Tab into his corner for a reach, and one that stops short for none", async () => {
    // The home corner: the stage and, under it, the one link a Tab can land
    // on while he is still a picture. Nothing inside the stage is focusable
    // until the viewer exists, so without this a visitor on the keyboard
    // alone would never meet him.
    render(
      <>
        <a href="/elsewhere">Si našel žival?</a>
        <figure>
          <CatModel sizes="100vw" locale="sl" startOnReach />
          <figcaption><a href="/srecko">Spoznajte Srečka</a></figcaption>
        </figure>
      </>,
    );
    await act(async () => intersect(true));
    act(() => screen.getByText("Si našel žival?").focus());
    await act(async () => {});
    expect(document.querySelector("model-viewer")).toBeNull();

    act(() => screen.getByText("Spoznajte Srečka").focus());
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
    // He is loading, so the corner says so to whoever reached for him.
    expect(shown()).toBe(true);
  });

  it("answers the touch that woke him", async () => {
    render(<CatModel sizes="100vw" locale="en" startOnReach />);
    act(() => intersect(true));
    touchPoster();
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
    const viewer = document.querySelector("model-viewer") as unknown as Viewer;
    fireEvent(viewer, new Event("load"));
    finishReveal(viewer);
    expect(viewer.animationName).toBe("Notice");
  });

  it("renders an immediately loadable fallback without a speculative poster preload", () => {
    const html = renderToStaticMarkup(<CatModel sizes="100vw" locale="sl" />);
    const document = new DOMParser().parseFromString(html, "text/html");
    const poster = document.querySelector("img")!;
    expect(poster.getAttribute("loading")).toBe("eager");
    expect(poster.getAttribute("fetchpriority")).toBe("low");
    expect(document.querySelector('link[rel="preload"]')).toBeNull();
  });

  it("loads when visible and plays the continuous animation without extra controls", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    expect(document.querySelector("model-viewer")).toBeNull();
    expect(screen.getByRole("img").getAttribute("alt")).toContain("closed right eye");
    const viewer = await loadViewer();
    expect(viewer.paused).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(viewer.getAttribute("animation-name")).toBe("Companion");
    expect(viewer.hasAttribute("camera-controls")).toBe(true);
    expect(viewer.getAttribute("touch-action")).toBe("pan-y");
  });

  it("keeps the still and the seated pose until the canvas has finished fading", async () => {
    const onHandle = vi.fn();
    render(<CatModel sizes="100vw" locale="en" onHandle={onHandle} />);
    touchPoster();
    const poster = screen.getByRole("img");
    const viewer = await loadViewer(undefined, false);
    const host = viewer.parentElement!;
    expect(poster.classList.contains("invisible")).toBe(false);
    expect(host.classList.contains("opacity-100")).toBe(true);
    expect(host.hasAttribute("inert")).toBe(true);
    expect(viewer.paused).toBe(true);
    expect(viewer.currentTime).toBe(0);
    expect(onHandle).not.toHaveBeenCalled();
    expect(viewer.animationName).toBeUndefined();

    // A child transition or another property must not release the still.
    endTransition(viewer, "opacity");
    endTransition(host, "transform");
    expect(poster.classList.contains("invisible")).toBe(false);
    finishReveal(viewer);
    expect(poster.classList.contains("invisible")).toBe(true);
    expect(host.hasAttribute("inert")).toBe(false);
    expect(viewer.animationName).toBe("Notice");
    expect(onHandle).toHaveBeenCalledOnce();
    finishReveal(viewer);
    expect(onHandle).toHaveBeenCalledOnce();
  });

  it("does not wait for a transition when reduced motion is requested", async () => {
    media.matches = true;
    const onHandle = vi.fn();
    render(<CatModel sizes="100vw" locale="en" onHandle={onHandle} />);
    const poster = screen.getByRole("img");
    const viewer = await loadViewer(undefined, false);
    expect(poster.classList.contains("invisible")).toBe(true);
    expect(viewer.paused).toBe(true);
    expect(onHandle).toHaveBeenCalledOnce();
  });

  it("finishes the reveal if reduced motion cancels its transition", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    const poster = screen.getByRole("img");
    const viewer = await loadViewer(undefined, false);
    media.matches = true;
    act(() => media.dispatchEvent(new Event("change")));
    expect(poster.classList.contains("invisible")).toBe(true);
    expect(viewer.paused).toBe(true);
  });

  it("does not hand over a viewer removed during its reveal", async () => {
    const onHandle = vi.fn();
    const { unmount } = render(<CatModel sizes="100vw" locale="en" onHandle={onHandle} />);
    const viewer = await loadViewer(undefined, false);
    const host = viewer.parentElement!;
    unmount();
    endTransition(host, "opacity");
    expect(onHandle.mock.calls).toEqual([[null]]);
    expect(viewer.paused).toBe(true);
  });

  it("frames the camera and the poster as one choice", async () => {
    const framing = { orbit: "0deg 80deg 1m", target: "0m 0.2m 0m", poster: "/test-poster.webp" };
    render(<CatModel sizes="100vw" locale="en" framing={framing} />);
    expect(screen.getByRole("img").getAttribute("src")).toContain("test-poster.webp");
    const viewer = await loadViewer();
    expect(viewer.getAttribute("camera-orbit")).toBe(framing.orbit);
    expect(viewer.getAttribute("camera-target")).toBe(framing.target);
  });

  it("downloads the poster everywhere by default and only past a gate when given one", () => {
    const open = new DOMParser().parseFromString(
      renderToStaticMarkup(<CatModel sizes="100vw" locale="sl" />), "text/html");
    expect(open.querySelector("source")).toBeNull();
    expect(open.querySelector("img")!.getAttribute("src")).toContain("poster.webp");

    const gated = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <CatModel sizes="100vw" locale="sl" posterMedia="(min-width: 48rem)" />,
      ), "text/html");
    const source = gated.querySelector("source")!;
    expect(source.getAttribute("media")).toBe("(min-width: 48rem)");
    expect(source.getAttribute("srcset")).toContain("poster.webp");
    // Below the gate the browser falls through to the img, so it has to cost
    // nothing: a still in a display:none figure is downloaded all the same.
    const fallback = gated.querySelector("img")!.getAttribute("src")!;
    expect(fallback.startsWith("data:image/gif")).toBe(true);
    expect(fallback).not.toContain("poster.webp");
  });

  it("puts the poster first only where it is the largest paint", () => {
    const lazy = new DOMParser().parseFromString(
      renderToStaticMarkup(<CatModel sizes="100vw" locale="sl" />), "text/html");
    expect(lazy.querySelector("img")!.getAttribute("fetchpriority")).toBe("low");
    const eager = new DOMParser().parseFromString(
      renderToStaticMarkup(<CatModel sizes="100vw" locale="sl" posterPriority />), "text/html");
    expect(eager.querySelector("img")!.getAttribute("fetchpriority")).not.toBe("low");
  });

  it("pauses offscreen and in a hidden tab, resuming only when visible", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    const viewer = await loadViewer();
    viewer.currentTime = 4.6;
    act(() => intersect(false));
    expect(viewer.paused).toBe(true);
    act(() => intersect(true));
    expect(viewer.paused).toBe(false);
    expect(viewer.currentTime).toBe(4.6);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(viewer.paused).toBe(true);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    expect(viewer.paused).toBe(false);
    expect(viewer.currentTime).toBe(4.6);
  });

  it("keeps animation still for reduced motion and responds to preference changes", async () => {
    media.matches = true;
    render(<CatModel sizes="100vw" locale="sl" />);
    const viewer = await loadViewer();
    expect(viewer.paused).toBe(true);
    media.matches = false;
    act(() => media.dispatchEvent(new Event("change")));
    expect(viewer.paused).toBe(false);
    media.matches = true;
    act(() => media.dispatchEvent(new Event("change")));
    expect(viewer.paused).toBe(true);
  });

  it("retains an accessible still image when 3D fails", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    const viewer = await loadViewer();
    fireEvent(viewer, new Event("error"));
    expect(viewer.paused).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("unavailable");
    expect(screen.getByRole("img").getAttribute("alt")).toContain("white cat");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("retries a failed model only on another reach, with one fresh viewer and matching hints", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    const first = await loadViewer(undefined, false);
    const firstUrl = first.getAttribute("src");
    fireEvent(first, new Event("error"));
    expect(first.isConnected).toBe(false);
    expect(hints()).toEqual([]);
    expect(runtime.picker.dispose).toHaveBeenCalled();
    act(() => { intersect(false); intersect(true); });
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => {});
    expect(document.querySelector("model-viewer")).toBeNull();

    touchPoster();
    reachFor();
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
    const second = document.querySelector("model-viewer") as Viewer;
    expect(document.querySelectorAll("model-viewer")).toHaveLength(1);
    expect(second.getAttribute("src")).not.toBe(firstUrl);
    expect(hints()[0]).toBe(second.getAttribute("src"));
    expect(hints()).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("still loading");
    // Events from the discarded scene cannot fail the new attempt.
    fireEvent(first, new Event("error"));
    fireEvent(second, new Event("load"));
    finishReveal(second);
    expect(second.animationName).toBe("Notice");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("can retry a renderer setup failure on another reach", async () => {
    viewerModule.fails = true;
    render(<CatModel sizes="100vw" locale="en" />);
    act(() => intersect(true));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("unavailable"));
    viewerModule.fails = false;
    reachFor();
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
    expect(screen.getByRole("status").textContent).toContain("still loading");
  });

  it("starts the slow-load sentence with the request, keeps it quiet, and resets it on retry", async () => {
    vi.useFakeTimers();
    render(<CatModel sizes="100vw" locale="en" />);
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("status").textContent).toBe("The cat is still loading …");
    await act(async () => intersect(true));
    const viewer = document.querySelector("model-viewer")!;
    await act(async () => vi.advanceTimersByTime(9_999));
    expect(screen.getByRole("status").textContent).not.toContain("Slow connection");
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status").textContent).toContain("Slow connection");
    expect(shown()).toBe(false);
    reachFor();
    expect(shown()).toBe(true);
    fireEvent(viewer, new Event("error"));
    reachFor();
    await act(async () => {});
    expect(screen.getByRole("status").textContent).toBe("The cat is still loading …");
  });

  it("releases the observer and viewer when leaving the page", async () => {
    const { unmount } = render(<CatModel sizes="100vw" locale="en" />);
    const viewer = await loadViewer();
    await waitFor(() => expect(runtime.builds).toBe(1));
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(viewer.isConnected).toBe(false);
    expect(viewer.paused).toBe(true);
    // The picker holds the scene the viewer held.
    expect(runtime.picker.dispose).toHaveBeenCalled();
  });

  it("keeps the loading label off screen until someone reaches for him", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    // Present for screen readers from the start, drawn only on a reach.
    expect(screen.getByRole("status").textContent).toContain("still loading");
    expect(shown()).toBe(false);
    await act(async () => intersect(true));
    expect(shown()).toBe(false);
    reachFor();
    expect(shown()).toBe(true);
    // It stays once shown: he is still not there.
    fireEvent.pointerLeave(screen.getByRole("img"));
    expect(shown()).toBe(true);
  });

  it("spins only for the visitor who reached, never on a page nobody scrolled", () => {
    render(<CatModel sizes="100vw" locale="en" />);
    const spinner = () => document.querySelector(".animate-spin");
    expect(spinner()).toBeNull();
    reachFor();
    expect(spinner()).not.toBeNull();
  });

  it("says so at once when the poster is touched, and says why when 3D fails", async () => {
    render(<CatModel sizes="100vw" locale="sl" />);
    touchPoster();
    expect(shown()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("nalaga");
    const viewer = await loadViewer();
    expect(shown()).toBe(false);
    fireEvent(viewer, new Event("error"));
    expect(shown()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("ni na voljo");
  });

  it("does not apologise for a failure to someone who never reached for him", async () => {
    render(<CatModel sizes="100vw" locale="sl" />);
    const viewer = await loadViewer();
    fireEvent(viewer, new Event("error"));
    expect(screen.getByRole("status").textContent).toContain("ni na voljo");
    expect(shown()).toBe(false);
    reachFor();
    expect(shown()).toBe(true);
  });

  it("answers a touch the poster took while he was loading", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    touchPoster();
    const viewer = await loadViewer();
    expect(viewer.animationName).toBe("Notice");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("greets nobody when the poster was left alone", async () => {
    render(<CatModel sizes="100vw" locale="en" />);
    const viewer = await loadViewer();
    expect(viewer.animationName).toBeUndefined();
  });

  it("lets the page's own request on handover come before his glance", async () => {
    const onHandle = vi.fn((handle: { react: (name: "Back warning") => boolean } | null) => {
      handle?.react("Back warning");
    });
    render(<CatModel sizes="100vw" locale="en" onHandle={onHandle} />);
    touchPoster();
    const viewer = await loadViewer(v => { v.availableAnimations = [...v.availableAnimations, "Back warning"]; });
    expect(viewer.animationName).toBe("Back warning");
  });
});
