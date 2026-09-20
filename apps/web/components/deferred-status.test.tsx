// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeferredStatus } from "@/components/deferred-status";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(cleanup);

// The note's own delay, which belongs to the component rather than to these
// tests.
const DELAY_MS = 400;

function show(error = false) {
  return render(
    <I18nProvider locale="sl">
      <DeferredStatus error={error} retry={() => undefined} />
    </I18nProvider>,
  );
}

const note = () => screen.queryByRole("status");

describe("the deferred status note", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not in the DOM at all while a load is inside the delay", () => {
    show();

    act(() => {
      vi.advanceTimersByTime(DELAY_MS - 1);
    });
    expect(note()).toBeNull();
  });

  it("names the wait once the delay has passed", () => {
    show();

    act(() => {
      vi.advanceTimersByTime(DELAY_MS);
    });
    expect(note()?.textContent).toContain("Nalaganje");
  });

  it("offers the retry at once when the load has failed", () => {
    show(true);

    expect(note()?.textContent).toContain("Poskusi znova");
  });

  it("clears its timer when it is unmounted inside the delay", () => {
    const { unmount } = show();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(DELAY_MS * 2);
    });
  });
});
