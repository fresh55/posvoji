// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefetchAnimalDescriptions,
  resetAnimalDescriptionsStore,
  useAnimalDescription,
} from "@/lib/animal-descriptions";

const DESCRIPTIONS = {
  "zavetisce:1": "Muri je prijazna muca, ki obožuje crkljanje.",
  "zavetisce:2": "Rex rad teka.",
};

afterEach(() => {
  cleanup();
  resetAnimalDescriptionsStore();
  vi.unstubAllGlobals();
});

/** The static file, answered the way a static host answers it. */
function serving(body: unknown = DESCRIPTIONS) {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("the one fetch", () => {
  it("is shared by everyone who asks at once", async () => {
    const fetch = serving();

    const [first, second, third] = await Promise.all([
      prefetchAnimalDescriptions(),
      prefetchAnimalDescriptions(),
      prefetchAnimalDescriptions(),
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/generated/animal-descriptions.json");
    expect(first).toEqual(DESCRIPTIONS);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("is not made again once it is done", async () => {
    const fetch = serving();

    await prefetchAnimalDescriptions();
    await prefetchAnimalDescriptions();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("a fetch that fails", () => {
  it("resolves empty rather than rejecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    await expect(prefetchAnimalDescriptions()).resolves.toEqual({});
  });

  // Every open dialog asks, and a dialog is opened again and again. A retry
  // per ask would be a request loop against a file that is not coming.
  it("is not retried by the next caller", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetch);

    await prefetchAnimalDescriptions();
    await expect(prefetchAnimalDescriptions()).resolves.toEqual({});

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a 404 as nothing to print", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    await expect(prefetchAnimalDescriptions()).resolves.toEqual({});
  });

  // A static host that answers an unknown path with the 404 page hands back
  // HTML, which parses as nothing useful or does not parse at all.
  it("treats a body that is not a map as nothing to print", async () => {
    serving(["not", "a", "map"]);

    await expect(prefetchAnimalDescriptions()).resolves.toEqual({});
  });
});

describe("useAnimalDescription", () => {
  it("has no answer on the first render and the text after", async () => {
    serving();

    const view = renderHook(() => useAnimalDescription("zavetisce:1"));
    expect(view.result.current).toBeUndefined();

    await waitFor(() =>
      expect(view.result.current).toBe(DESCRIPTIONS["zavetisce:1"]),
    );
  });

  it("stays undefined for an animal the map has nothing for", async () => {
    serving();

    const view = renderHook(() => useAnimalDescription("zavetisce:404"));
    await prefetchAnimalDescriptions();

    expect(view.result.current).toBeUndefined();
  });

  // What the animal's own page does: it was handed the text already, so it
  // passes no id and the file is never asked for.
  it("fetches nothing when it is given no id", async () => {
    const fetch = serving();

    const view = renderHook(() => useAnimalDescription(undefined));

    expect(view.result.current).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
