import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

/**
 * The jsdom navigation seam every suite that asserts on a redirect needs.
 *
 * Not a `.test.` file, so vitest does not collect it. The login card and the
 * workspace guard are only observable through the address they hand over to,
 * and jsdom navigates nowhere and warns instead. Both suites used to carry
 * their own copy of this, which is how `test/pointer.ts` started too.
 */

let restore: (() => void) | null = null;

/** A location whose replace() only records where the page was sent. */
export function captureNavigation(): ReturnType<typeof vi.fn> {
  const real = window.location;
  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...real, replace, assign: vi.fn() },
  });
  restore = () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: real,
    });
  };
  return replace;
}

/** Puts the real location back. Belongs in the suite's afterEach. */
export function restoreNavigation(): void {
  restore?.();
  restore = null;
}

/**
 * Clicks a link and says whether the page let the click through.
 *
 * Read at the document, after React's handlers have had their say, and then
 * prevented there. jsdom follows an unprevented link with a navigation it
 * does not implement and reports it on stderr, which buries real console
 * errors under noise from passing tests. The answer the page gave is the
 * thing under test; what a browser would do with it is not.
 */
export function clickThrough(link: HTMLElement, init?: object): boolean {
  let proceeded = false;
  const seal = (event: Event) => {
    proceeded = !event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", seal);
  try {
    fireEvent.click(link, init);
  } finally {
    document.removeEventListener("click", seal);
  }
  return proceeded;
}
