// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n-provider";
import { SourceFreshness } from "./source-freshness";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("ages an open static page without changing its source timestamp", async () => {
  vi.useFakeTimers();
  const checkedAt = "2026-09-13T06:00:00Z";
  const reference = new Date("2026-09-13T07:00:00Z");
  vi.setSystemTime(reference);
  const { container } = render(<I18nProvider locale="en"><SourceFreshness checkedAt={checkedAt} reference={reference} /></I18nProvider>);
  expect(screen.queryByText(/Verification is older/)).toBeNull();
  vi.setSystemTime(new Date("2026-09-15T07:00:00Z"));
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(screen.getByText(/Verification is older/)).toBeTruthy();
  expect(container.querySelector("time")?.dateTime).toBe(checkedAt);
});
