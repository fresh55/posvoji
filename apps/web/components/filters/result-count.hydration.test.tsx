// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultCount } from "./result-count";

afterEach(() => vi.restoreAllMocks());

describe("ResultCount hydration", () => {
  it("keeps reduced-motion server and client markup compatible", async () => {
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMedia,
    });
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
