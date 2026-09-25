// @vitest-environment jsdom

import { act } from "react";
import { domAnimation } from "motion/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LazyMotion } from "@/components/motion-scope";
import { CountRoll } from "./filter-card";
import { ResultCount } from "./result-count";

afterEach(() => vi.restoreAllMocks());

// Every test here runs with reduced motion on. Motion's own hook reads the
// preference once per file and keeps it, so the mock is the same in each.
function preferReducedMotion() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

describe("ResultCount hydration", () => {
  it("keeps reduced-motion server and client markup compatible", async () => {
    preferReducedMotion();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <ResultCount count={231} locale="en" />,
    );

    const root = hydrateRoot(
      container,
      <ResultCount count={231} locale="en" />,
    );
    await act(async () => undefined);

    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes("hydrated but some attributes"),
      ),
    ).toBe(false);
    await act(async () => root.unmount());
  });
});

function Count({ value }: { value: number }) {
  return (
    <LazyMotion features={domAnimation}>
      <CountRoll value={value} />
    </LazyMotion>
  );
}

describe("CountRoll hydration", () => {
  // CountRoll used to draw a bare number under reduced motion and a rolling
  // one otherwise, and Motion's hook answers that question on the client
  // only. The server always drew the rolling shape, so a visitor who asked
  // for less motion hydrated a count React believed was bare text: it kept
  // the server's nodes because the text agreed, and its class and inner span
  // stayed whatever the server had written. One shape now, whatever the
  // preference; reduced motion only keeps the number where it stands.
  it("hydrates the server's count as it is and changes the number in place", async () => {
    preferReducedMotion();
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Count value={12} />);
    const written = container.querySelector("span > span");
    const recovered: unknown[] = [];

    const root = hydrateRoot(container, <Count value={12} />, {
      onRecoverableError: (error) => recovered.push(error),
    });
    await act(async () => undefined);

    expect(recovered).toEqual([]);
    expect(container.querySelector("span > span")).toBe(written);
    expect(written?.textContent).toBe("12");

    await act(async () => root.render(<Count value={15} />));

    expect(container.querySelectorAll("span > span")).toHaveLength(1);
    expect(container.querySelector("span > span")).toBe(written);
    expect(written?.textContent).toBe("15");
    await act(async () => root.unmount());
  });
});
