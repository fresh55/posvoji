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
