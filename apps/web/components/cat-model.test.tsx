// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatModel } from "./cat-model";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@google/model-viewer", () => {
  class MockViewer extends HTMLElement {
    availableAnimations: string[] = [];
    paused = true;
    currentTime = 0;
    play = vi.fn(() => { this.paused = false; });
    pause = vi.fn(() => { this.paused = true; });
  }
  if (!customElements.get("model-viewer")) {
    customElements.define("model-viewer", MockViewer);
  }
  return { ModelViewerElement: MockViewer };
});

type Viewer = HTMLElement & { paused: boolean; currentTime: number };
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

async function loadViewer() {
  act(() => intersect(true));
  await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
  const viewer = document.querySelector("model-viewer") as unknown as Viewer;
  fireEvent(viewer, new Event("load"));
  return viewer;
}

describe("the cat model", () => {
  it("renders an immediately loadable fallback without a speculative poster preload", () => {
    const html = renderToStaticMarkup(<CatModel sizes="100vw" locale="sl" />);
    const document = new DOMParser().parseFromString(html, "text/html");
    const poster = document.querySelector("img")!;
    expect(poster.getAttribute("loading")).toBe("eager");
    expect(poster.getAttribute("fetchpriority")).toBe("low");
    expect(document.querySelector('link[rel="preload"][as="image"]')).toBeNull();
  });

  it("loads when visible and automatically plays the continuous animation without controls", async () => {
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
    expect(screen.getByRole("status").textContent).toContain("still image");
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
});
