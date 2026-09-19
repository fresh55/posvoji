// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadClientPayload, useClientPayload } from "./use-client-payload";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shares one request, caches success, and retries a failed download", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      ok: true,
      json: async () => [{ src: "/photo.webp" }],
    });
  vi.stubGlobal("fetch", fetcher);
  const first = loadClientPayload("/retry.json");
  const second = loadClientPayload("/retry.json");
  expect(second).toBe(first);
  await expect(first).rejects.toThrow("offline");
  await expect(loadClientPayload("/retry.json")).resolves.toEqual([
    { src: "/photo.webp" },
  ]);
  await loadClientPayload("/retry.json");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not fetch until needed and ignores an earlier animal's late response", async () => {
  let resolveFirst!: (value: unknown) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValue({ ok: true, json: async () => ["second"] });
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(
    ({ url, active }) => useClientPayload<string[]>(url, active),
    { initialProps: { url: "/animal-one.json", active: false } },
  );
  expect(fetcher).not.toHaveBeenCalled();
  rerender({ url: "/animal-one.json", active: true });
  rerender({ url: "/animal-two.json", active: true });
  await waitFor(() => expect(result.current.data).toEqual(["second"]));
  await act(async () => {
    resolveFirst({ ok: true, json: async () => ["first"] });
  });
  expect(result.current.data).toEqual(["second"]);
});

it("rejects HTTP errors and invalid JSON shapes without caching them", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: "missing" }),
      })
      .mockResolvedValue({ ok: true, json: async () => [] }),
  );
  await expect(loadClientPayload("/invalid.json")).rejects.toThrow("404");
  await expect(loadClientPayload("/invalid.json")).rejects.toThrow(
    "Invalid payload",
  );
  await expect(loadClientPayload("/invalid.json")).resolves.toEqual([]);
});
