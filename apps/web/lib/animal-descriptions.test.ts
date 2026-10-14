// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefetchAnimalDescriptions,
  resetAnimalDescriptionsStore,
  useAnimalDescription,
  useAnimalSource,
  ANIMAL_DETAILS_TIMEOUT_MS,
  ANIMAL_DETAILS_RETRY_COOLDOWN_MS,
} from "@/lib/animal-descriptions";

const DESCRIPTIONS = {
  "zavetisce:1": { description: "Muri je prijazna muca, ki obožuje crkljanje." },
  "zavetisce:2": { description: "Rex rad teka." },
};

afterEach(() => {
  cleanup();
  resetAnimalDescriptionsStore();
  vi.useRealTimers();
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
    expect(fetch).toHaveBeenCalledWith("/generated/animal-details.json", {
      signal: expect.any(AbortSignal),
    });
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
  it("is not retried by rapid callers during the failure cooldown", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetch);

    await prefetchAnimalDescriptions();
    await expect(prefetchAnimalDescriptions()).resolves.toEqual({});

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on a later open and publishes the recovered details to existing readers", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => DESCRIPTIONS });
    vi.stubGlobal("fetch", fetch);
    const view = renderHook(() => useAnimalDescription("zavetisce:1"));
    await act(async () => { await prefetchAnimalDescriptions(); });
    expect(view.result.current).toBeUndefined();
    await prefetchAnimalDescriptions();
    await prefetchAnimalDescriptions();
    expect(fetch).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(ANIMAL_DETAILS_RETRY_COOLDOWN_MS));
    await act(async () => {
      await Promise.all([prefetchAnimalDescriptions(), prefetchAnimalDescriptions()]);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(view.result.current).toBe(DESCRIPTIONS["zavetisce:1"].description);
    await prefetchAnimalDescriptions();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts and settles a shared stalled request, including a stalled response body", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
    });
    vi.stubGlobal("fetch", fetch);
    const first = prefetchAnimalDescriptions();
    const second = prefetchAnimalDescriptions();
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(ANIMAL_DETAILS_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toEqual({});
    expect(signal.aborted).toBe(true);
    await expect(second).resolves.toEqual({});
    await prefetchAnimalDescriptions();
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce({ ok: true, json: async () => DESCRIPTIONS });
    await vi.advanceTimersByTimeAsync(ANIMAL_DETAILS_RETRY_COOLDOWN_MS);
    await expect(prefetchAnimalDescriptions()).resolves.toEqual(DESCRIPTIONS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches a valid empty map as a success rather than retrying it", async () => {
    vi.useFakeTimers();
    const fetch = serving({});
    await prefetchAnimalDescriptions();
    await vi.advanceTimersByTimeAsync(ANIMAL_DETAILS_RETRY_COOLDOWN_MS * 2);
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
      expect(view.result.current).toBe(DESCRIPTIONS["zavetisce:1"].description),
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

describe("deferred source details", () => {
  it("shares one request with descriptions and changes source when the animal changes", async () => {
    const source = {
      sourceUrl: "https://shelter.example/animals/1",
      fetchedAt: "2026-09-19T00:00:00Z",
    };
    const fetch = serving({ "shelter:1": { description: "Shelter text", source } });
    const view = renderHook(
      ({ id }) => ({
        description: useAnimalDescription(id),
        source: useAnimalSource(id),
      }),
      { initialProps: { id: "shelter:1" } },
    );
    expect(view.result.current.source).toBeUndefined();
    await waitFor(() => expect(view.result.current.source).toEqual(source));
    expect(view.result.current.description).toBe("Shelter text");
    expect(fetch).toHaveBeenCalledTimes(1);
    view.rerender({ id: "shelter:2" });
    expect(view.result.current.source).toBeUndefined();
  });

  it("does not request details for a standalone page that already has its source", () => {
    const fetch = serving();
    renderHook(() => useAnimalSource(undefined));
    expect(fetch).not.toHaveBeenCalled();
  });
});
