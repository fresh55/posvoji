// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LAST_VISIT_KEY,
  NEW_LISTINGS_DATASET_KEY,
  VISIT_SINCE_KEY,
  newListingsScript,
} from "./last-visit";

const NEWEST = Date.parse("2026-01-10T08:30:00.000Z");
const run = (newest = NEWEST) => new Function(newListingsScript(newest))();
const marked = () => NEW_LISTINGS_DATASET_KEY in document.documentElement.dataset;

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete document.documentElement.dataset[NEW_LISTINGS_DATASET_KEY];
  vi.restoreAllMocks();
});

describe("the script that holds the new-listings notice's place", () => {
  it("marks nothing on a first visit", () => {
    run();
    expect(marked()).toBe(false);
  });

  it("marks a returning visitor whose last list is older than the newest listing", () => {
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-09T12:00:00.000Z");
    run();
    expect(marked()).toBe(true);
  });

  it("marks nothing when the last list already held the newest listing", () => {
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-10T08:30:00.000Z");
    run();
    expect(marked()).toBe(false);
  });

  // The page reads the session's threshold once the hook has written it, so
  // a reload in the same tab must hold the place the first load held, even
  // though the last visit has since moved on to the list on screen.
  it("reads the session's threshold ahead of the last visit, as the hook does", () => {
    sessionStorage.setItem(VISIT_SINCE_KEY, "2026-01-09T12:00:00.000Z");
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-10T12:00:00.000Z");
    run();
    expect(marked()).toBe(true);
  });

  it("marks nothing for a session that began as a first visit", () => {
    sessionStorage.setItem(VISIT_SINCE_KEY, "");
    localStorage.setItem(LAST_VISIT_KEY, "2026-01-09T12:00:00.000Z");
    run();
    expect(marked()).toBe(false);
  });

  it("marks nothing for a value that is not a time", () => {
    localStorage.setItem(LAST_VISIT_KEY, "nekoč");
    run();
    expect(marked()).toBe(false);
  });

  it("marks nothing and throws nothing where storage is refused", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => run()).not.toThrow();
    expect(marked()).toBe(false);
  });
});
