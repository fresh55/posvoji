// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listedAtOf } from "@/lib/animal";
import { LAST_VISIT_KEY, VISIT_SINCE_KEY } from "@/lib/last-visit";
import {
  isNewsToVisitor,
  resetLastVisitStore,
  useIsNewListing,
  useNewListingCount,
  useVisitSince,
} from "./use-last-visit";

// The dataset's generatedAt, which is what a visit writes down.
const REFERENCE = new Date("2026-09-25T08:11:57.697Z");
const EARLIER = "2026-09-20T08:00:00.000Z";

const listed = (time: string) => listedAtOf(time)!;

// A new page load in the same tab: the module forgets, the tab's storage does
// not.
function reload() {
  resetLastVisitStore();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetLastVisitStore();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  resetLastVisitStore();
});

describe("isNewsToVisitor", () => {
  const threshold = Date.parse(EARLIER);
  const available = (time: string | undefined) => ({
    listedAt: time === undefined ? undefined : listed(time),
    status: "available" as const,
  });

  it("is new only when listed after the threshold", () => {
    expect(isNewsToVisitor(available("2026-09-22T10:00:00Z"), threshold)).toBe(true);
    expect(isNewsToVisitor(available("2026-09-18T10:00:00Z"), threshold)).toBe(false);
  });

  // A first visit has seen nothing, which is not the same as everything on
  // the page being new to it.
  it("marks nothing without a threshold or a listing time", () => {
    expect(isNewsToVisitor(available("2026-09-22T10:00:00Z"), null)).toBe(false);
    expect(isNewsToVisitor(available(undefined), threshold)).toBe(false);
  });
});

describe("the visit marker", () => {
  it("has no threshold on a first visit, and writes this visit down", () => {
    const { result } = renderHook(() => useVisitSince(REFERENCE));

    expect(result.current).toBeNull();
    expect(localStorage.getItem(LAST_VISIT_KEY)).toBe(REFERENCE.toISOString());
    // The session remembers that it began with nothing to compare against.
    expect(sessionStorage.getItem(VISIT_SINCE_KEY)).toBe("");
  });

  it("measures a returning visit from the one before it", () => {
    localStorage.setItem(LAST_VISIT_KEY, EARLIER);
    const { result } = renderHook(() => useVisitSince(REFERENCE));

    expect(result.current).toBe(Date.parse(EARLIER));
    expect(sessionStorage.getItem(VISIT_SINCE_KEY)).toBe(EARLIER);
    expect(localStorage.getItem(LAST_VISIT_KEY)).toBe(REFERENCE.toISOString());
  });

  it("keeps the threshold through a reload in the same session", () => {
    localStorage.setItem(LAST_VISIT_KEY, EARLIER);
    const first = renderHook(() => useVisitSince(REFERENCE));
    first.unmount();

    reload();
    const second = renderHook(() => useVisitSince(REFERENCE));

    // The stored visit has moved on to this one, and the page still compares
    // against the one before it.
    expect(localStorage.getItem(LAST_VISIT_KEY)).toBe(REFERENCE.toISOString());
    expect(second.result.current).toBe(Date.parse(EARLIER));
  });

  it("starts the next session from this visit", () => {
    localStorage.setItem(LAST_VISIT_KEY, EARLIER);
    renderHook(() => useVisitSince(REFERENCE)).unmount();

    sessionStorage.clear();
    reload();
    const { result } = renderHook(() => useVisitSince(REFERENCE));

    expect(result.current).toBe(REFERENCE.getTime());
  });

  it("reads a stored value it cannot parse as a first visit and replaces it", () => {
    localStorage.setItem(LAST_VISIT_KEY, "nekoč");
    const { result } = renderHook(() => useVisitSince(REFERENCE));

    expect(result.current).toBeNull();
    expect(localStorage.getItem(LAST_VISIT_KEY)).toBe(REFERENCE.toISOString());
  });

  it("works as a first visit when storage is refused", () => {
    const refuse = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);

    const { result } = renderHook(() => useVisitSince(REFERENCE));

    expect(result.current).toBeNull();
  });
});

describe("the new-listing hooks", () => {
  const newer = { listedAt: listed("2026-09-22T10:00:00Z"), status: "available" as const };
  const older = { listedAt: listed("2026-09-18T10:00:00Z"), status: "available" as const };
  const unknown = { status: "available" as const };
  // Listed since the visit, but in quarantine: sorted after every adoptable
  // animal whatever the order, so the notice cannot put it first.
  const held = { listedAt: listed("2026-09-23T10:00:00Z"), status: "hold" as const };

  it("counts the listings since the last visit", () => {
    localStorage.setItem(LAST_VISIT_KEY, EARLIER);
    const { result } = renderHook(() =>
      useNewListingCount([newer, older, unknown, newer], REFERENCE),
    );

    expect(result.current).toBe(2);
  });

  it("counts only what can be adopted now", () => {
    localStorage.setItem(LAST_VISIT_KEY, EARLIER);
    const { result } = renderHook(() =>
      useNewListingCount([newer, held], REFERENCE),
    );

    expect(result.current).toBe(1);
    expect(isNewsToVisitor(held, Date.parse(EARLIER))).toBe(false);
    expect(isNewsToVisitor(newer, Date.parse(EARLIER))).toBe(true);
  });

  it("counts nothing on a first visit", () => {
    const { result } = renderHook(() =>
      useNewListingCount([newer, older], REFERENCE),
    );

    expect(result.current).toBe(0);
  });

  // The server has no storage, so the prerendered page marks nothing, and
  // the hydrating render has to read the same answer or React throws the
  // markup away. The mark then arrives in the commit after.
  it("hydrates to the server's answer and marks after it", async () => {
    localStorage.setItem(LAST_VISIT_KEY, EARLIER);
    function Mark() {
      return useIsNewListing(newer, REFERENCE) ? <b>Novo</b> : <i />;
    }

    const container = document.createElement("div");
    container.innerHTML = renderToString(<Mark />);
    expect(container.innerHTML).toBe("<i></i>");

    const recovered: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Mark />, {
        onRecoverableError: (error) => recovered.push(error),
      });
    });

    expect(recovered).toEqual([]);
    expect(container.innerHTML).toBe("<b>Novo</b>");
    act(() => root?.unmount());
  });
});
