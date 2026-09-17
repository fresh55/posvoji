// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackToTop } from "./back-to-top";
import { I18nProvider } from "@/components/i18n-provider";

// The button reads the viewport rather than being told about it, so a test
// has to say how tall the window is and how far down it is. Both are plain
// properties in jsdom and neither fires an event, which is what the render
// below is for: the effect reads them once on mount.
function viewport(height: number, scrollY: number) {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: scrollY,
  });
}

function mountAt(height: number, scrollY: number) {
  viewport(height, scrollY);
  const { container } = render(
    <I18nProvider locale="sl">
      <BackToTop />
    </I18nProvider>,
  );
  return container.querySelector<HTMLElement>('[data-slot="back-to-top"]')!;
}

// Reachable means reachable: the button is inert and aria-hidden until it is
// shown, so what is asserted is the pair rather than a class. aria-hidden is
// read by value and not by presence, because React prints aria-hidden="false"
// for the shown state rather than dropping the attribute.
function reachable(button: HTMLElement) {
  return (
    !button.hasAttribute("inert") &&
    button.getAttribute("aria-hidden") !== "true"
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("when the way back up appears", () => {
  it("shows itself 700px down on a phone held sideways", () => {
    // 844x390. The species toolbar goes static there (animal-filters.tsx) and
    // scrolls away at about 270px, and at two screens this button waited for
    // 780: a 510px window with no species control and no way up. The cap ends
    // the window at 700 instead.
    expect(reachable(mountAt(390, 720))).toBe(true);
    cleanup();
    expect(reachable(mountAt(390, 690))).toBe(false);
  });

  it("caps a desktop at the same 700px rather than two of its screens", () => {
    // A 900px window asked for 1800px of scroll, which is four rows of cards
    // at that width. The header is out of sight long before that, but 700px
    // on a 900px screen is the hero barely gone, so the floor is one screen.
    expect(reachable(mountAt(900, 920))).toBe(true);
    cleanup();
    expect(reachable(mountAt(900, 880))).toBe(false);
    cleanup();
    expect(reachable(mountAt(900, 720))).toBe(false);
  });

  it("shows a portrait phone the button one screen down", () => {
    // 390x844: two screens is 1688, the cap is 700, and one screen is 844.
    // The floor wins, so the disc arrives once the landing screen has gone.
    expect(reachable(mountAt(844, 860))).toBe(true);
    cleanup();
    expect(reachable(mountAt(844, 820))).toBe(false);
  });

  it("still waits two screens on a window shorter than 350px", () => {
    // The only band where the two-screen term decides anything: 300px of
    // viewport wants 600px of scroll, and the cap never comes into it.
    expect(reachable(mountAt(300, 650))).toBe(true);
    cleanup();
    expect(reachable(mountAt(300, 500))).toBe(false);
  });

  it("answers a scroll with the same threshold it mounted with", () => {
    // The listener is coalesced into a frame, so the frame is what the test
    // drives. Queued rather than run synchronously: the component clears its
    // own handle inside the callback, and a synchronous call would leave the
    // handle set and drop every scroll after the first.
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    const button = mountAt(390, 0);
    expect(reachable(button)).toBe(false);

    viewport(390, 720);
    fireEvent.scroll(window);
    act(() => {
      for (const frame of frames.splice(0)) frame(0);
    });

    expect(reachable(button)).toBe(true);
  });
});
