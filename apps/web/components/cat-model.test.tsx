// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatModel } from "./cat-model";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/cat-viewer-runtime", () => ({ createViewerCatPicker: vi.fn() }));

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
  return { ModelViewerElement: MockViewer };
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Mounts the viewer and loads it, with a chance to prepare it in between. */
async function loadViewer(before?: (viewer: Viewer) => void) {
  act(() => intersect(true));
  await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
  const viewer = document.querySelector("model-viewer") as unknown as Viewer;
  before?.(viewer);
  fireEvent(viewer, new Event("load"));
  return viewer;
}

// The stage's label, and the two ways a visitor reaches for the poster. The
// assertions stay in each test; only the reaching is shared.
const shown = () => screen.getByRole("status").className.includes("opacity-100");
const reachFor = () => fireEvent.pointerEnter(screen.getByRole("img"));
const touchPoster = () => fireEvent.pointerDown(screen.getByRole("img"));

describe("the cat model", () => {
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

  it("releases the observer and viewer when leaving the page", async () => {
    const { unmount } = render(<CatModel sizes="100vw" locale="en" />);
    const viewer = await loadViewer();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(viewer.isConnected).toBe(false);
    expect(viewer.paused).toBe(true);
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
